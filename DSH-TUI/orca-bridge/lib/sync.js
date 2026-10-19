import fs from 'node:fs';
import path from 'node:path';
import { decompressFrames } from './zstd.js';
import { GENERATORS, convertSession, parseEvents, serialize } from './convert.js';
import { SESSION_FILE, dshSessionsDir, lockPath, manifestPath, mirrorRoot, stateDir } from './paths.js';

// One pass: mirror new or changed DSH sessions and remove mirrors whose source is gone.
// Several DSH processes may run at once, so a pass holds a lock; only files this tool wrote
// (manifest entries, or files carrying its generator marker) are ever replaced or deleted.
export function syncOnce({ log = () => {} } = {}) {
  return withLock(() => syncUnlocked(log));
}

function syncUnlocked(log) {
  const manifest = readManifest();
  const seen = new Set();
  const live = new Map(); // mirror path -> source, for every source that still has a mirror
  const stats = { written: 0, unchanged: 0, skipped: 0, removed: 0, failed: 0 };

  for (const src of listSessionFiles()) {
    seen.add(src);
    let st;
    try {
      st = fs.statSync(src);
    } catch {
      continue;
    }
    const prev = manifest.sessions[src];
    if (prev && prev.size === st.size && prev.mtimeMs === st.mtimeMs && (!prev.mirror || fs.existsSync(prev.mirror))) {
      if (prev.mirror) live.set(prev.mirror, src);
      stats.unchanged++;
      continue;
    }
    try {
      const converted = convertSession(parseEvents(decompressFrames(fs.readFileSync(src)).toString('utf8')));
      if (!converted) {
        if (prev?.mirror) removeMirror(prev.mirror);
        manifest.sessions[src] = { size: st.size, mtimeMs: st.mtimeMs, mirror: null };
        stats.skipped++;
        continue;
      }
      const mirror = mirrorPathFor(converted.header);
      if (prev?.mirror && prev.mirror !== mirror) removeMirror(prev.mirror);
      writeAtomic(mirror, serialize(converted));
      // the mirror's mtime is what Orca shows as "updated"
      const t = new Date(converted.updatedAt);
      fs.utimesSync(mirror, t, t);
      manifest.sessions[src] = { size: st.size, mtimeMs: st.mtimeMs, mirror, sessionId: converted.header.id };
      live.set(mirror, src);
      stats.written++;
    } catch (err) {
      stats.failed++;
      log(`failed ${src}: ${err.message}`);
    }
  }

  for (const [src, entry] of Object.entries(manifest.sessions)) {
    if (seen.has(src)) continue;
    if (entry.mirror && removeMirror(entry.mirror)) stats.removed++;
    delete manifest.sessions[src];
  }
  // Mirrors of ours the manifest lost track of (an interrupted pass, an older install).
  for (const file of listMirrorFiles()) {
    if (!live.has(file) && isOurMirror(file) && removeMirror(file)) stats.removed++;
  }
  writeManifest(manifest);
  return stats;
}

export function removeAllMirrors() {
  return withLock(() => {
    let removed = 0;
    for (const file of listMirrorFiles()) if (isOurMirror(file) && removeMirror(file)) removed++;
    writeManifest({ version: 1, sessions: {} });
    return removed;
  });
}

export function listSessionFiles() {
  const root = dshSessionsDir();
  const out = [];
  for (const project of safeReaddir(root)) {
    if (!project.isDirectory()) continue;
    for (const session of safeReaddir(path.join(root, project.name))) {
      if (!session.isDirectory()) continue;
      const file = path.join(root, project.name, session.name, SESSION_FILE);
      if (fs.existsSync(file)) out.push(file);
    }
  }
  return out;
}

export function listMirrorFiles() {
  const root = mirrorRoot();
  const out = [];
  for (const dir of safeReaddir(root)) {
    if (!dir.isDirectory()) continue;
    for (const f of safeReaddir(path.join(root, dir.name))) {
      if (f.isFile() && f.name.endsWith('.jsonl')) out.push(path.join(root, dir.name, f.name));
    }
  }
  return out;
}

// Same layout pi uses: one folder per working directory, one file per session.
export function mirrorPathFor(header) {
  const dir = `--${header.cwd.replace(/^[/\\]+/, '').replace(/[/\\:]/g, '-')}--`;
  const stamp = header.timestamp.replace(/[:.]/g, '-');
  return path.join(mirrorRoot(), dir, `${stamp}_${header.id}.jsonl`);
}

export function isOurMirror(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const header = JSON.parse(buf.subarray(0, n).toString('utf8').split('\n', 1)[0]);
    return header?.type === 'session' && GENERATORS.has(header.generator);
  } catch {
    return false;
  }
}

export function readManifest() {
  try {
    const m = JSON.parse(fs.readFileSync(manifestPath(), 'utf8'));
    if (m && typeof m.sessions === 'object') return m;
  } catch {
    // first run or unreadable: start fresh (mirrors get rewritten, nothing else is touched)
  }
  return { version: 1, sessions: {} };
}

function writeManifest(m) {
  writeAtomic(manifestPath(), JSON.stringify(m, null, 1) + '\n');
}

function writeAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // the temp name does not end in .jsonl, so Orca never indexes a half-written file
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

function removeMirror(file) {
  try {
    fs.unlinkSync(file);
  } catch {
    return false;
  }
  try {
    fs.rmdirSync(path.dirname(file)); // only succeeds when the folder is now empty
  } catch {}
  return true;
}

function safeReaddir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

// A lock directory holding the owner's pid. A lock whose owner is gone, or one older than
// STALE_MS (a pass takes well under a second), is broken. Waits up to WAIT_MS for a live owner.
const STALE_MS = 60_000;
const WAIT_MS = 15_000;

function withLock(fn) {
  fs.mkdirSync(stateDir(), { recursive: true });
  const lock = lockPath();
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    try {
      fs.mkdirSync(lock);
      fs.writeFileSync(path.join(lock, 'pid'), String(process.pid));
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      if (lockIsStale(lock)) {
        fs.rmSync(lock, { recursive: true, force: true });
        continue;
      }
      if (Date.now() > deadline) throw new Error('another sync is still running');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}

function lockIsStale(lock) {
  let age;
  try {
    age = Date.now() - fs.statSync(lock).mtimeMs;
  } catch {
    return false; // already released; the next mkdir decides
  }
  if (age > STALE_MS) return true;
  let pid;
  try {
    pid = Number(fs.readFileSync(path.join(lock, 'pid'), 'utf8'));
  } catch {
    return age > 2000; // the owner writes its pid right after mkdir
  }
  if (!pid) return age > 2000;
  try {
    process.kill(pid, 0);
    return false;
  } catch (err) {
    return err.code === 'ESRCH';
  }
}

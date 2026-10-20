#!/usr/bin/env node
// Install, check or remove the Orca bridge for DSH.
//
//   node install.mjs                  install (or refresh) into the dsh-tui profile
//   node install.mjs --no-mirror      status only (or --no-status: history only)
//   node install.mjs status           check every piece
//   node install.mjs uninstall [--purge]   remove; --purge also deletes the mirrors
//   --profile <name>                  another DSH profile (default dsh-tui)
//
// Install touches three things, all reversible:
//   1. a marked block in $DSH_HOME/profiles/<profile>/cordis.patch.yml that loads index.js
//   2. symlinks ~/.local/bin/orca-dsh, orca-dsh-sync and prime-agent (-> orca-dsh)
//   3. mirrors under ~/.prime/agent/sessions (state in ~/.dsh-orca-bridge)
// Orca itself is not modified. Orca only lists an agent (and offers its Command setting) once
// `<cli> --version` runs, and resumes Prime Agent rows with `prime-agent --resume <file>`; the
// prime-agent shim covers both, so no Orca setting is needed. It is skipped when a real
// prime-agent CLI is on PATH; then set Settings → Agents → Prime Agent → Command to orca-dsh.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dshHome } from './lib/paths.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.join(HERE, 'index.js');
const BIN_DIR = path.join(os.homedir(), '.local', 'bin');
const BINS = { 'orca-dsh': 'bin/orca-dsh.js', 'orca-dsh-sync': 'bin/orca-dsh-sync.js' };
// Stands in for the prime-agent CLI so Orca detects the slot the mirrors live in.
const SHIM = { name: 'prime-agent', target: 'bin/orca-dsh.js' };
const START = '# >>> dsh-orca-bridge (managed by unixporn/DSH-TUI/orca-bridge/install.mjs) >>>';
const END = '# <<< dsh-orca-bridge <<<';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const cmd = args.find((a) => !a.startsWith('-') && a !== opt('--profile')) ?? 'install';
const profile = opt('--profile', 'dsh-tui');
const patchFile = path.join(dshHome(), 'profiles', profile, 'cordis.patch.yml');

const ok = (msg) => console.log(`✓ ${msg}`);
const bad = (msg) => console.log(`✗ ${msg}`);
const note = (msg) => console.log(`  ${msg}`);

// ---- profile patch block -------------------------------------------------------------

// --no-status / --no-mirror turn a half off; re-running install keeps only what is passed again.
function block() {
  const off = ['status', 'mirror'].filter((half) => flag(`--no-${half}`));
  const config = off.length ? ['      config:', ...off.map((half) => `        ${half}: false`)] : [];
  return [START, '- insert:', '    - id: orca-bridge', `      name: ${quote(ENTRY)}`, ...config, END];
}
const quote = (s) => `'${s.replaceAll("'", "''")}'`;

function region(lines) {
  let start = -1;
  for (const [i, line] of lines.entries()) {
    if (line.trim() === START) start = i;
    else if (line.trim() === END && start !== -1) return { start, end: i };
  }
  return null;
}

// The YAML body without blank and comment lines.
const body = (lines) => lines.filter((l) => l.trim() && !l.trim().startsWith('#'));
const stripComment = (l) => (l.includes('#') ? l.slice(0, l.indexOf('#')) : l).trim();

function withBlock(text) {
  let lines = text.split('\n');
  const r = region(lines);
  if (r) lines = [...lines.slice(0, r.start), ...lines.slice(r.end + 1)];
  const b = body(lines);
  // A fresh profile's patch file is an empty flow sequence (`[]`), after which a block entry is
  // a YAML error; drop that token. Any other flow sequence cannot be appended to safely.
  if (b.length === 1 && stripComment(b[0]) === '[]') {
    lines = lines.filter((l) => !(l.trim() && !l.trim().startsWith('#') && stripComment(l) === '[]'));
  } else if (b.length && b[0].trimStart().startsWith('[')) {
    throw new Error(`${patchFile} is a flow sequence ([…]); rewrite it as one "- " entry per line first`);
  }
  while (lines.length && !lines.at(-1).trim()) lines.pop();
  return [...lines, ...block(), ''].join('\n');
}

function withoutBlock(text) {
  let lines = text.split('\n');
  const r = region(lines);
  if (!r) return text;
  lines = [...lines.slice(0, r.start), ...lines.slice(r.end + 1)];
  while (lines.length && !lines.at(-1).trim()) lines.pop();
  if (!body(lines).length) lines.push('[]'); // keep an empty, parseable sequence
  return lines.join('\n') + '\n';
}

function readPatch() {
  try {
    return fs.readFileSync(patchFile, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function writePatch(text) {
  const tmp = `${patchFile}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, patchFile);
}

function patchInstalled(text = readPatch()) {
  if (!text) return false;
  const r = region(text.split('\n'));
  return Boolean(r) && text.split('\n').slice(r.start, r.end).some((l) => l.includes(ENTRY));
}

// ---- Orca side (read-only) ------------------------------------------------------------

function orcaHookRowInstalled() {
  try {
    return fs.readFileSync(path.join(dshHome(), 'cordis.patch.yml'), 'utf8').includes('id: orca-agent-hooks');
  } catch {
    return false;
  }
}

// Orca keeps settings in SQLite and overwrites edits made while it runs, so this only reads.
function orcaPrimeAgentCommand() {
  const db = path.join(os.homedir(), 'Library', 'Application Support', 'orca', 'profiles', 'local-default', 'profile-state.db');
  if (!fs.existsSync(db)) return undefined;
  try {
    const out = execFileSync('sqlite3', ['-readonly', `file:${db}?mode=ro`, "select payload from profile_state_documents where domain='settings'"], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(out).agentCmdOverrides?.['prime-agent'] ?? null;
  } catch {
    return undefined;
  }
}

// ---- commands -------------------------------------------------------------------------

function linkBins() {
  fs.mkdirSync(BIN_DIR, { recursive: true });
  for (const [name, rel] of Object.entries(BINS)) {
    const link = path.join(BIN_DIR, name);
    const target = path.join(HERE, rel);
    fs.chmodSync(target, 0o755);
    try {
      const st = fs.lstatSync(link);
      if (!st.isSymbolicLink()) throw new Error(`${link} exists and is not a symlink; move it away first`);
      fs.unlinkSync(link);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    fs.symlinkSync(target, link);
  }
}

function unlinkBins() {
  for (const [name, rel] of Object.entries(BINS)) {
    const link = path.join(BIN_DIR, name);
    try {
      if (fs.lstatSync(link).isSymbolicLink() && fs.readlinkSync(link) === path.join(HERE, rel)) fs.unlinkSync(link);
    } catch {}
  }
}

function binsLinked() {
  return Object.entries(BINS).every(([name, rel]) => {
    try {
      return fs.readlinkSync(path.join(BIN_DIR, name)) === path.join(HERE, rel);
    } catch {
      return false;
    }
  });
}

function shimLinked() {
  try {
    return fs.readlinkSync(path.join(BIN_DIR, SHIM.name)) === path.join(HERE, SHIM.target);
  } catch {
    return false;
  }
}

// Another prime-agent on PATH (the real CLI) wins over the shim.
function otherPrimeAgent() {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const file = path.join(dir, SHIM.name);
    if (!dir || file === path.join(BIN_DIR, SHIM.name)) continue;
    try {
      fs.accessSync(file, fs.constants.X_OK);
      return file;
    } catch {}
  }
  try {
    if (!fs.lstatSync(path.join(BIN_DIR, SHIM.name)).isSymbolicLink()) return path.join(BIN_DIR, SHIM.name);
  } catch {}
  return null;
}

function linkShim() {
  const other = otherPrimeAgent();
  if (other) return other;
  const link = path.join(BIN_DIR, SHIM.name);
  try {
    fs.unlinkSync(link);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  fs.symlinkSync(path.join(HERE, SHIM.target), link);
  return null;
}

async function install() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 15)) throw new Error(`Node ${process.versions.node}: need 22.15+ for zstd`);
  const text = readPatch();
  if (text === null) throw new Error(`${patchFile} not found: run \`dsh-tui\` once so the ${profile} profile exists`);
  writePatch(withBlock(text));
  ok(`${patchFile}: loads ${ENTRY}`);
  linkBins();
  ok(`${BIN_DIR}/orca-dsh, orca-dsh-sync`);
  const other = linkShim();
  if (other) note(`prime-agent shim skipped: ${other} is a real prime-agent`);
  else ok(`${BIN_DIR}/prime-agent -> orca-dsh (Orca now detects Prime Agent)`);
  if (!flag('--no-mirror')) {
    const { syncOnce } = await import('./lib/sync.js');
    const s = syncOnce();
    ok(`mirrored: ${s.written} written, ${s.unchanged} unchanged, ${s.skipped} skipped, ${s.removed} removed, ${s.failed} failed`);
  }
  report();
  console.log('\nRestart any running dsh-tui for the plugin to load.');
}

async function uninstall() {
  const text = readPatch();
  if (text !== null && patchInstalled(text)) {
    writePatch(withoutBlock(text));
    ok(`removed the block from ${patchFile}`);
  }
  unlinkBins();
  if (shimLinked()) fs.unlinkSync(path.join(BIN_DIR, SHIM.name));
  ok('removed the orca-dsh and prime-agent symlinks');
  if (flag('--purge')) {
    const { removeAllMirrors } = await import('./lib/sync.js');
    ok(`removed ${removeAllMirrors()} mirrors`);
    fs.rmSync(path.join(os.homedir(), '.dsh-orca-bridge'), { recursive: true, force: true });
  }
  console.log('\nIn Orca, clear Settings → Agents → Prime Agent → Command if you set it to orca-dsh.');
}

function report() {
  const command = orcaPrimeAgentCommand();
  if (command === 'orca-dsh' || command?.endsWith('/orca-dsh')) ok('Orca: Prime Agent command is orca-dsh (resume from Session History opens DSH)');
  else if (!command && shimLinked()) {
    ok('Orca: Prime Agent runs the prime-agent shim (resume from Session History opens DSH)');
    note('If Orca still lists Prime Agent as not installed, press Refresh in Settings → Agents.');
  } else {
    bad(`Orca: Prime Agent command is ${command ? `"${command}"` : 'not set'} and the prime-agent shim is not installed`);
    note('Set Settings → Agents → Prime Agent → Command to `orca-dsh`, otherwise resuming a');
    note('mirrored session from Session History starts the prime-agent CLI, not DSH.');
  }
  if (orcaHookRowInstalled()) ok("Orca: its own DSH status hook is installed; the plugin adds approvals, reply text and error Stops");
  else {
    ok("Orca: its own DSH status hook is not installed; the plugin sends every status event itself");
    note('(Orca installs it on its next start once it sees dsh on PATH; both setups work.)');
  }
}

async function status() {
  (patchInstalled() ? ok : bad)(`${patchFile}: ${patchInstalled() ? 'loads' : 'does not load'} the plugin`);
  (binsLinked() ? ok : bad)(`${BIN_DIR}/orca-dsh, orca-dsh-sync ${binsLinked() ? 'linked' : 'missing'}`);
  if (shimLinked()) ok(`${BIN_DIR}/prime-agent -> orca-dsh`);
  else note(`prime-agent shim not installed${otherPrimeAgent() ? ` (${otherPrimeAgent()} is a real prime-agent)` : ''}`);
  const { listMirrorFiles, isOurMirror, listSessionFiles } = await import('./lib/sync.js');
  ok(`mirrors: ${listMirrorFiles().filter(isOurMirror).length} for ${listSessionFiles().length} DSH session logs`);
  report();
}

const commands = { install, uninstall, status };
if (!commands[cmd]) {
  console.error('usage: node install.mjs [install|status|uninstall [--purge]] [--profile <name>]');
  process.exit(2);
}
try {
  await commands[cmd]();
} catch (err) {
  bad(err.message);
  process.exit(1);
}

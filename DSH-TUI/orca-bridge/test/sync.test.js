import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sampleEvents, toZstdFrames } from './fixture.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-orca-bridge-'));
process.env.DSH_HOME = path.join(tmp, 'dsh');
process.env.ORCA_DSH_MIRROR_DIR = path.join(tmp, 'mirror');
process.env.ORCA_DSH_STATE_DIR = path.join(tmp, 'state');
const { syncOnce, removeAllMirrors } = await import('../lib/sync.js');
const { resolveSessionId, parseResumeArgs } = await import('../lib/resume.js');

const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const src = path.join(process.env.DSH_HOME, 'sessions', '--work-demo--', id, 'session.v4.jsonl.zstd');
const mirrorDir = process.env.ORCA_DSH_MIRROR_DIR;
const mirrorFiles = () => fs.readdirSync(mirrorDir, { recursive: true }).filter((f) => f.endsWith('.jsonl'));
const writeSource = (events = sampleEvents({ id })) => {
  fs.mkdirSync(path.dirname(src), { recursive: true });
  fs.writeFileSync(src, toZstdFrames(events));
};

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('mirrors, skips unchanged, and removes deleted sessions', () => {
  writeSource();
  // a file that is not ours must survive every sync and purge
  const foreign = path.join(mirrorDir, '--other--', 'foreign.jsonl');
  fs.mkdirSync(path.dirname(foreign), { recursive: true });
  fs.writeFileSync(foreign, '{"type":"session","id":"x"}\n');

  assert.equal(syncOnce().written, 1);
  const [mirror] = mirrorFiles().filter((f) => f.includes(id));
  assert.match(mirror, /^--work-demo--\/2026-10-01T08-00-00-000Z_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\.jsonl$/);
  assert.equal(syncOnce().unchanged, 1);

  const full = path.join(mirrorDir, mirror);
  assert.equal(resolveSessionId(full), id);

  fs.rmSync(path.dirname(src), { recursive: true });
  assert.equal(syncOnce().removed, 1);
  assert.equal(fs.existsSync(full), false);
  assert.equal(fs.existsSync(foreign), true);

  writeSource();
  syncOnce();
  assert.equal(removeAllMirrors(), 1);
  assert.equal(fs.existsSync(foreign), true);
});

test('rewrites a mirror that was deleted behind its back, and drops orphans of ours', () => {
  writeSource();
  syncOnce();
  const [mirror] = mirrorFiles().filter((f) => f.includes(id));
  fs.unlinkSync(path.join(mirrorDir, mirror));
  assert.equal(syncOnce().written, 1);

  // an orphan: ours by its generator marker, but no source and no manifest entry
  const orphan = path.join(mirrorDir, '--gone--', '2026-01-01T00-00-00-000Z_gone.jsonl');
  fs.mkdirSync(path.dirname(orphan), { recursive: true });
  fs.writeFileSync(orphan, '{"type":"session","version":3,"id":"gone","generator":"orca-dsh-history"}\n');
  assert.equal(syncOnce().removed, 1);
  assert.equal(fs.existsSync(orphan), false);
});

test('a stale lock from a dead process is broken', () => {
  const lock = path.join(process.env.ORCA_DSH_STATE_DIR, 'sync.lock');
  fs.mkdirSync(lock, { recursive: true });
  fs.writeFileSync(path.join(lock, 'pid'), '999999');
  assert.equal(typeof syncOnce().unchanged, 'number');
  assert.equal(fs.existsSync(lock), false);
});

test('parses the resume arguments Orca passes', () => {
  assert.deepEqual(parseResumeArgs(['--resume', '/x/y.jsonl']), { resume: true, target: '/x/y.jsonl', rest: [] });
  assert.deepEqual(parseResumeArgs(['--resume=abc', '--model', 'm']), { resume: true, target: 'abc', rest: ['--model', 'm'] });
  assert.deepEqual(parseResumeArgs(['.']), { resume: false, target: undefined, rest: ['.'] });
  assert.equal(resolveSessionId(`/gone/2026-10-01T08-00-00-000Z_${id}.jsonl`), id);
  assert.equal(resolveSessionId('abc'), 'abc');
  assert.equal(resolveSessionId('/gone/2026-10-01T08-00-00-000Z_session-1234.jsonl'), 'session-1234');
});

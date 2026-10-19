#!/usr/bin/env node
// Mirror DSH sessions into Orca's Prime Agent folder. The DSH plugin runs `once --quiet`
// after each change; run it by hand to check or clean up.
//
//   orca-dsh-sync [once]      one pass, then print what changed
//   orca-dsh-sync status      folders, mirror count, last log lines
//   orca-dsh-sync purge       delete every mirror this tool wrote
import fs from 'node:fs';
import path from 'node:path';
import { listMirrorFiles, isOurMirror, listSessionFiles, removeAllMirrors, syncOnce } from '../lib/sync.js';
import { dshSessionsDir, logPath, mirrorRoot, stateDir } from '../lib/paths.js';

const [cmd = 'once', ...flags] = process.argv.slice(2);
const quiet = flags.includes('--quiet');

function log(line) {
  try {
    fs.mkdirSync(stateDir(), { recursive: true });
    const file = logPath();
    if (fs.existsSync(file) && fs.statSync(file).size > 512 * 1024) fs.renameSync(file, `${file}.1`);
    fs.appendFileSync(file, `${new Date().toISOString()} ${line}\n`);
  } catch {}
  if (!quiet) console.log(line);
}

switch (cmd) {
  case 'once': {
    try {
      const s = syncOnce({ log });
      const changed = s.written || s.removed || s.failed;
      const line = `sync: ${s.written} written, ${s.removed} removed, ${s.unchanged} unchanged, ${s.skipped} skipped, ${s.failed} failed`;
      if (changed) log(line);
      else if (!quiet) console.log(line);
      process.exitCode = s.failed ? 1 : 0;
    } catch (err) {
      log(`sync failed: ${err.message}`);
      process.exitCode = 1;
    }
    break;
  }
  case 'status': {
    const mirrors = listMirrorFiles().filter(isOurMirror);
    console.log(`DSH sessions   ${dshSessionsDir()} (${listSessionFiles().length})`);
    console.log(`mirrors        ${mirrorRoot()} (${mirrors.length})`);
    console.log(`state          ${stateDir()}`);
    try {
      const tail = fs.readFileSync(logPath(), 'utf8').trimEnd().split('\n').slice(-5);
      console.log(`last log lines (${path.basename(logPath())}):`);
      for (const l of tail) console.log(`  ${l}`);
    } catch {
      console.log('no log yet');
    }
    break;
  }
  case 'purge':
    console.log(`removed ${removeAllMirrors()} mirrors`);
    break;
  default:
    console.error(`usage: orca-dsh-sync [once|status|purge] [--quiet]`);
    process.exitCode = 2;
}

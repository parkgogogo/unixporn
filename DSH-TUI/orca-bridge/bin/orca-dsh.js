#!/usr/bin/env node
// Launcher for Orca's Prime Agent slot, which is where the DSH mirrors live. With
// Settings → Agents → Prime Agent → Command set to `orca-dsh`, Orca resumes a mirrored
// session with
//   cd <session cwd> && orca-dsh --resume <mirror file>
// and this turns it into `dsh-tui --backend=dsh --resume <DSH session id>`.
import { spawnSync } from 'node:child_process';
import { parseResumeArgs, resolveSessionId } from '../lib/resume.js';

const tui = (process.env.ORCA_DSH_TUI?.trim() || 'dsh-tui').split(/\s+/);
const { resume, target, rest } = parseResumeArgs(process.argv.slice(2));

let args;
if (resume) {
  const id = resolveSessionId(target);
  if (target && !id) {
    console.error(`orca-dsh: cannot find a DSH session id in ${target}`);
    process.exit(2);
  }
  // dsh-tui remembers the last backend picked (dsh, claude, codex); pin DSH so its session resumes there.
  // One joined token: `--backend dsh` would let an older dsh-tui read `dsh` as a prompt.
  args = [...tui.slice(1), '--backend=dsh', '--resume', ...(id ? [id] : []), ...rest];
} else {
  args = [...tui.slice(1), ...(rest.length ? rest : ['.'])]; // same as Orca's own DSH launch: `dsh-tui .`
}

const r = spawnSync(tui[0], args, { stdio: 'inherit' });
if (r.error) {
  console.error(`orca-dsh: cannot start ${tui[0]}: ${r.error.message}`);
  process.exit(127);
}
process.exit(r.status ?? 1);

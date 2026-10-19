import fs from 'node:fs';

// Orca resumes a Prime Agent session with `<command> --resume <session file path>`.
// Map that back to a DSH session id: read the mirror's header, or take the id from the file name.
export function resolveSessionId(target) {
  if (!target) return null;
  if (target.endsWith('.jsonl') && fs.existsSync(target)) {
    try {
      const header = JSON.parse(fs.readFileSync(target, 'utf8').split('\n', 1)[0]);
      if (header?.type === 'session' && header.id) return header.id;
    } catch {}
  }
  // mirror names are <ISO time with - for : and .>_<session id>.jsonl; ids may carry a prefix such as session-
  const fromName = target.match(/\d{4}-\d\d-\d\dT[\d-]+Z_(.+)\.jsonl$/);
  if (fromName) return fromName[1];
  return target.includes('/') ? null : target; // a bare id passes through
}

// Split argv into the resume target (if any) and the remaining arguments.
export function parseResumeArgs(argv) {
  const rest = [];
  let target;
  let resume = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--resume' || a === '-r' || a === '--session') {
      resume = true;
      if (argv[i + 1] && !argv[i + 1].startsWith('-')) target = argv[++i];
    } else if (a.startsWith('--resume=') || a.startsWith('--session=')) {
      resume = true;
      target = a.slice(a.indexOf('=') + 1);
    } else {
      rest.push(a);
    }
  }
  return { resume, target, rest };
}

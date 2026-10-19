// dsh-orca-bridge: a DSH plugin for the dsh-tui profile that keeps Orca in step with DSH.
//
// - Status: DSH's own events go to Orca's agent-hook server, so the pane's working /
//   waiting / done dot, prompt, tool and reply preview follow DSH (see lib/status.js).
// - History: sessions are mirrored into Orca's Prime Agent session folder after each
//   change, so they show up in Orca's Session History and search (see lib/sync.js).
//
// Config (both optional): `status: false` or `mirror: false` turns a half off.
import fs from 'node:fs';
import path from 'node:path';
import { createOrcaHookClient, orcaPaneFromEnv } from './lib/orca-hook.js';
import { attachStatus } from './lib/status.js';
import { createMirrorScheduler } from './lib/mirror-schedule.js';
import { dshHome } from './lib/paths.js';

export const name = 'orca-bridge';

// Session events that change what the mirror shows.
const MIRRORED = new Set(['user/message', 'assistant/message', 'tool/result', 'session/title', 'turn/end']);

// Orca's own DSH integration: a row it inserts into $DSH_HOME/cordis.patch.yml.
export const ORCA_HOOK_ROW_ID = 'orca-agent-hooks';

export function orcaHookRowLoaded(ctx) {
  try {
    if (ctx.loader?.entries) {
      return [...ctx.loader.entries()].some((e) => e.options?.id === ORCA_HOOK_ROW_ID && !e.disabled);
    }
  } catch {}
  try {
    return fs.readFileSync(path.join(dshHome(), 'cordis.patch.yml'), 'utf8').includes(`id: ${ORCA_HOOK_ROW_ID}`);
  } catch {
    return false;
  }
}

export function apply(ctx, config = {}) {
  const warn = (msg) => ctx.logger?.warn?.(`orca-bridge: ${msg}`);

  const pane = config.status === false ? null : orcaPaneFromEnv();
  if (pane) {
    let warned = false;
    const client = createOrcaHookClient(pane, {
      onError: (err) => {
        if (!warned) warn(`cannot reach Orca's hook server (${err.message}); status updates are dropped`);
        warned = true;
      },
    });
    attachStatus(ctx, client, { mode: orcaHookRowLoaded(ctx) ? 'complement' : 'full' });
  }

  if (config.mirror !== false) {
    const mirror = createMirrorScheduler({ onError: (err) => warn(`mirror pass failed to start: ${err.message}`) });
    ctx.on('session/event', (session, event) => {
      if (MIRRORED.has(event.type)) mirror.poke();
    });
    mirror.poke(3000); // catch up with sessions written while this profile was not running
    const onExit = () => mirror.flush();
    process.on('exit', onExit);
    ctx.effect(
      () => () => {
        process.off('exit', onExit);
        mirror.flush();
      },
      'orca-bridge: flush the pending mirror pass',
    );
  }
}

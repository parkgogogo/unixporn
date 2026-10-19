// Client for Orca's loopback agent-hook server: the same POST Orca's own managed hook scripts
// send (`POST /hook/dsh`, form-encoded, `X-Orca-Agent-Hook-Token`), made from inside DSH.
import fs from 'node:fs';
import http from 'node:http';

const TIMEOUT_MS = 1500;

// The pane identity Orca puts in every terminal it spawns. DSH scrubs variables whose name
// contains KEY or TOKEN from its tool subprocesses only; this process still has them, and
// Orca also sets scrub-safe aliases (ORCA_AGENT_PANE, ORCA_AGENT_LAUNCH).
export function orcaPaneFromEnv(env = process.env) {
  const paneKey = env.ORCA_PANE_KEY || env.ORCA_AGENT_PANE;
  if (!paneKey) return null;
  return {
    paneKey,
    tabId: env.ORCA_TAB_ID ?? '',
    launchToken: env.ORCA_AGENT_LAUNCH_TOKEN || env.ORCA_AGENT_LAUNCH || '',
    worktreeId: env.ORCA_WORKTREE_ID ?? '',
    endpointFile: env.ORCA_AGENT_HOOK_ENDPOINT ?? '',
    fallback: {
      port: env.ORCA_AGENT_HOOK_PORT ?? '',
      token: env.ORCA_AGENT_HOOK_TOKEN ?? '',
      env: env.ORCA_AGENT_HOOK_ENV ?? '',
      version: env.ORCA_AGENT_HOOK_VERSION ?? '',
    },
  };
}

// Orca rewrites the endpoint file whenever its hook server restarts, so a pane that outlived an
// Orca restart still reaches the new server. Read it per post, as the managed scripts do.
export function readEndpoint(pane) {
  const out = { ...pane.fallback };
  try {
    for (const line of fs.readFileSync(pane.endpointFile, 'utf8').split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?ORCA_AGENT_HOOK_([A-Z_]+)=(.*)$/);
      if (!m) continue;
      const value = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
      const key = { PORT: 'port', TOKEN: 'token', ENV: 'env', VERSION: 'version' }[m[1]];
      if (key) out[key] = value;
    }
  } catch {}
  return out;
}

export function createOrcaHookClient(pane, { onError = () => {} } = {}) {
  let chain = Promise.resolve();

  function post(payload) {
    const ep = readEndpoint(pane);
    if (!ep.port || !ep.token) return Promise.resolve(false);
    const body = new URLSearchParams({
      paneKey: pane.paneKey,
      tabId: pane.tabId,
      launchToken: pane.launchToken,
      worktreeId: pane.worktreeId,
      env: ep.env,
      version: ep.version,
      agentProcess: '',
      payload: JSON.stringify(payload),
    }).toString();
    return new Promise((resolve) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: Number(ep.port),
          path: '/hook/dsh',
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body),
            'X-Orca-Agent-Hook-Token': ep.token,
          },
          timeout: TIMEOUT_MS,
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode < 300));
        },
      );
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', (err) => {
        onError(err);
        resolve(false);
      });
      req.end(body);
    });
  }

  return {
    // Events must reach Orca in order (PreToolUse before its PostToolUse), so posts are queued.
    send(payload) {
      const done = chain.then(() => post(payload));
      chain = done.catch(() => false);
      return done;
    },
    idle: () => chain,
  };
}

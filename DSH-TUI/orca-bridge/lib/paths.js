import os from 'node:os';
import path from 'node:path';

const env = (name) => process.env[name]?.trim() || undefined;

// DSH keeps sessions at $DSH_HOME/sessions/<cwd key>/<session id>/session.v4.jsonl.zstd
export const dshHome = () => env('DSH_HOME') ?? path.join(os.homedir(), '.dsh');
export const dshSessionsDir = () => env('DSH_TUI_SESSION_ROOT') ?? path.join(dshHome(), 'sessions');
export const SESSION_FILE = 'session.v4.jsonl.zstd';

// Orca scans ~/.prime/agent/sessions for its built-in "Prime Agent" (pi-format JSONL).
export const mirrorRoot = () => env('ORCA_DSH_MIRROR_DIR') ?? path.join(os.homedir(), '.prime', 'agent', 'sessions');

// Our own state: which mirror files we wrote, so nothing else in the mirror root is ever touched.
export const stateDir = () => env('ORCA_DSH_STATE_DIR') ?? path.join(os.homedir(), '.dsh-orca-bridge');
export const manifestPath = () => path.join(stateDir(), 'manifest.json');
export const lockPath = () => path.join(stateDir(), 'sync.lock');
export const logPath = () => path.join(stateDir(), 'sync.log');

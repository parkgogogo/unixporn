// Re-mirror sessions shortly after DSH writes to them. The pass runs in a detached child
// process: decoding a long session must not stall the TUI, and a pass scheduled as DSH
// exits still finishes after it.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SYNC_BIN = fileURLToPath(new URL('../bin/orca-dsh-sync.js', import.meta.url));

export function createMirrorScheduler({ delayMs = 1500, onError = () => {} } = {}) {
  let timer = null;
  let child = null;
  let again = false;

  function run() {
    timer = null;
    if (child) {
      again = true;
      return;
    }
    try {
      child = spawn(process.execPath, [SYNC_BIN, 'once', '--quiet'], { detached: true, stdio: 'ignore' });
    } catch (err) {
      onError(err);
      return;
    }
    child.on('error', onError);
    child.on('exit', () => {
      child = null;
      if (again) {
        again = false;
        run();
      }
    });
    child.unref();
  }

  return {
    poke(ms = delayMs) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, ms);
      timer.unref?.();
    },
    // On exit: start the pending pass now; the detached child outlives this process.
    flush() {
      if (!timer && !again) return;
      if (timer) clearTimeout(timer);
      // A pass already running may have read the log before the last write; start one more
      // regardless (the sync lock queues it behind the running one).
      child = null;
      again = false;
      run();
    },
    dispose() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

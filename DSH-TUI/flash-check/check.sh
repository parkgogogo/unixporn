#!/bin/sh
# Flash check for the compact tool runs: record real dsh-tui runs of eight
# scenarios in parallel, replay every frame, and fail if a tool line was
# drawn and then taken back (see replay.py). Needs tmux, python3, and a
# dsh-tui that can reach its model. Takes 1-3 minutes and a few cents.
#
#   sh check.sh                 all scenarios
#   sh check.sh par seq         some of them
#   DSH_FLASH_DIR=/path sh check.sh
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
DIR=${DSH_FLASH_DIR:-${TMPDIR:-/tmp}/dsh-flash-check}
mkdir -p "$DIR/fixtures"
[ -x "$DIR/venv/bin/python" ] || { python3 -m venv "$DIR/venv" && "$DIR/venv/bin/pip" install -q pyte; } || exit 1
printf 'alpha\nbeta\ngamma\n' > "$DIR/fixtures/x.txt"
printf 'one\ntwo\n' > "$DIR/fixtures/y.txt"
python3 - "$DIR/fixtures/pic.png" <<'PY'
import struct, sys, zlib
w = h = 8
raw = b''.join(b'\x00' + b'\xd9\x77\x57' * w for _ in range(h))
ch = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
open(sys.argv[1], 'wb').write(b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + ch(b'IDAT', zlib.compress(raw)) + ch(b'IEND', b''))
PY
rm -rf "$DIR/out" "$DIR/wd"

prompt() {
  case $1 in
    seq) echo 'Test: run these shell commands one at a time, each as its own separate tool call, no batching, and write no text between the calls: `sleep 1 && echo one`, `ls`, `sleep 1 && echo two`, `pwd`. Then reply ok.' ;;
    par) echo 'Test: issue these three bash tool calls in parallel in a single step: `echo a`, `sleep 1 && echo b`, `echo c`. After they finish, again in one parallel step, read the file x.txt with your read tool and run `wc -l y.txt`. Then reply ok.' ;;
    mix) echo 'Test: make these tool calls one by one: read x.txt with your read tool; run `grep -n beta x.txt`; run `ls /nonexistent`; run `cat y.txt`; create a new file w.txt containing hi with your write tool; run `cat w.txt`; run `wc -c w.txt`. Keep text between calls to a minimum. Then reply ok.' ;;
    img) echo 'Test: look at pic.png with your image-reading tool, then run `ls -la pic.png` as a separate call. Then reply ok.' ;;
    live) echo 'Test: run exactly this one bash command and nothing else: `for i in 1 2 3 4 5; do echo line $i; sleep 1; done`. Then reply ok.' ;;
    narrow) echo 'Test: run these as two separate bash tool calls: `echo this-is-a-very-long-command-line-that-should-not-fit-in-a-narrow-terminal-window-at-all && echo done`, then `echo second-call-also-quite-long-to-check-truncation-behaviour`. Then reply ok.' ;;
    think) echo 'Test: write no visible text until the very end. Run `seq 1 4` with bash. Then think carefully, privately, about the sum of those numbers, and run `echo SUM` with bash where SUM is that sum. Then think privately about whether it is even, and run `echo even` or `echo odd` with bash. Then reply ok.' ;;
    search) echo 'Test: use your file-search tools, not bash, each as a separate call: find files matching *.txt with your glob tool, search for the pattern "beta" with your grep tool, then read y.txt with your read tool. Then reply ok.' ;;
  esac
}
size() { [ "$1" = narrow ] && echo '56 40' || echo '100 60'; }

NAMES=${*:-seq par mix img live narrow think search}
for n in $NAMES; do
  sh "$HERE/record.sh" "$DIR" "$n" "$(prompt "$n")" $(size "$n") &
done
wait
status=0
for n in $NAMES; do
  printf '%-7s ' "$n"
  report=$("$DIR/venv/bin/python" "$HERE/replay.py" "$DIR/out/$n.raw" $(size "$n")) || status=1
  echo "$report" | tail -1
  echo "$report" | grep -E '^(SHRINK|CARD-FLASH|reflow|no transcript)' | sed 's/^/        /'
done
echo "recordings: $DIR/out (replay one with: $DIR/venv/bin/python $HERE/replay.py <raw> <cols> <rows> -v)"
exit $status

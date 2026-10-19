#!/bin/sh
# Record one dsh-tui run's raw pty stream, timestamped per chunk.
#   record.sh <dir> <name> <prompt> [cols] [rows]
# Writes <dir>/out/<name>.raw and <name>.final.txt; works in <dir>/wd/<name>.
# KEEP=1 leaves the tmux session (flash-<name>) open afterwards.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
DIR=$1; NAME=$2; PROMPT=$3; COLS=${4:-100}; ROWS=${5:-60}
OUT=$DIR/out; WD=$DIR/wd/$NAME; SES=flash-$NAME
mkdir -p "$OUT" "$WD" && cp -R "$DIR/fixtures/." "$WD/"
tmux kill-session -t "$SES" 2>/dev/null
rm -f "$OUT/$NAME.raw"
tmux new-session -d -s "$SES" -x "$COLS" -y "$ROWS" -c "$WD"
tmux pipe-pane -o -t "$SES" "python3 -u '$HERE/ts.py' '$OUT/$NAME.raw'"
tmux send-keys -t "$SES" "clear; DSH_TUI_TMUX_TRUECOLOR=1 dsh-tui ." Enter
i=0; until tmux capture-pane -p -t "$SES" | grep -q 'deepseek-'; do
  sleep 0.5; i=$((i+1)); [ $i -gt 60 ] && { echo "$NAME: dsh-tui did not start"; exit 1; }
done
sleep 1.5
tmux send-keys -t "$SES" -l "$PROMPT"
sleep 0.8
tmux send-keys -t "$SES" Enter
i=0; until tmux capture-pane -p -t "$SES" | grep -qE '⏺ (ok|OK)'; do
  sleep 0.5; i=$((i+1)); [ $i -gt 360 ] && { echo "$NAME: no final ok after 3 min"; break; }
done
sleep 1
tmux capture-pane -p -t "$SES" > "$OUT/$NAME.final.txt"
[ -n "${KEEP:-}" ] || tmux kill-session -t "$SES"

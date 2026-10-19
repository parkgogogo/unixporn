#!/usr/bin/env bash
# Fan out one task spec per agent on a fresh Orca run, then wait until every dispatch settles,
# releasing each worker and acking each delivery as it goes. One call, no coordinator turns in between.
#
# usage: orca_fanout.sh "<objective>" <worktree-path> agent=specfile [agent=specfile ...]
#        orca_fanout.sh --resume <state-dir>
#   agent: any Orca agent id (codex, grok, dsh, claude, opencode, ...).
#   Exit 0: every dispatch settled (succeeded or failed; see the `done`/`FAILED` lines).
#   Exit 2: a worker asked a question or escalated. The delivery is printed and left un-acked;
#           answer with `orca orchestration reply --id <message_id> --body ...`, ack it with
#           `orca orchestration check --run <run> --ack <delivery_id>`, then rerun with --resume.
# State (run id, dispatch map) lives in $ORCA_FANOUT_STATE (default ./.orca-fanout/<run>).
# bash 3.2 compatible (stock macOS).
set -u
T0=$(date +%s); el() { echo "+$(( $(date +%s)-T0 ))s"; }
j() { python3 -c "$1" "${@:2}" 2>/dev/null; }

if [ "${1:-}" = --resume ]; then
  ST=$2; RUN=$(cat "$ST/run")
  echo "resume run $RUN ($(wc -l < "$ST/pending" | tr -d ' ') pending)"
else
  [ $# -ge 3 ] || { sed -n 2,14p "$0"; exit 64; }
  OBJ=$1; WT=$2; shift 2
  RUN=$(orca orchestration run-create --objective "$OBJ" --json | j 'import json,sys;print(json.load(sys.stdin)["result"]["run"]["id"])')
  [ -n "$RUN" ] || { echo "run-create failed"; exit 1; }
  ST=${ORCA_FANOUT_STATE:-./.orca-fanout/$RUN}; mkdir -p "$ST"; echo "$RUN" > "$ST/run"; : > "$ST/map"
  echo "run $RUN  state $ST"

  # dsh drops the Enter Orca sends right after pasting a fresh launch prompt, so the prompt sits in
  # its composer as a collapsed `▸ N lines・M chars` chip and the worker never starts (while
  # worker-start still reports input_accepted). A chip seen on two reads 2s apart was never
  # submitted — a submitted prompt leaves the composer — so one Enter is safe.
  nudge_dsh() {
    local h=$1 seen=0 i
    for i in $(seq 15); do
      sleep 2
      if orca terminal read --terminal "$h" --screen --json 2>/dev/null | grep -qE '▸ [0-9]+ lines・[0-9]+ chars・'; then
        seen=$((seen+1))
        if [ $seen -ge 2 ]; then orca terminal send --terminal "$h" --enter --json >/dev/null 2>&1; echo "$(el) dsh: launch prompt was not submitted, sent Enter"; return; fi
      elif [ $seen -ge 1 ]; then return; fi
    done
  }

  # All starts run in parallel; each agent boots and receives its prompt independently.
  for pair in "$@"; do
    agent=${pair%%=*}; spec=${pair#*=}
    [ -s "$spec" ] || { echo "missing spec $spec"; exit 64; }
    ( orca orchestration worker-start --run "$RUN" --spec "$(cat "$spec")" --task-title "$agent: $(basename "$spec")" \
        --worktree "path:$WT" --agent "$agent" --json > "$ST/start-$agent.json" 2>/dev/null
      if [ "$agent" = dsh ]; then
        h=$(j 'import json,sys
r=json.load(open(sys.argv[1])).get("result") or {}
print(next((e["id"] for e in r.get("effects",[]) if e.get("kind")=="terminal"),""))' "$ST/start-$agent.json")
        [ -n "$h" ] && nudge_dsh "$h"
      fi ) &
  done
  for pair in "$@"; do
    agent=${pair%%=*}
    until [ -s "$ST/start-$agent.json" ]; do sleep 0.5; done; sleep 0.2
    d=$(j 'import json,sys
d=json.load(open(sys.argv[1])); r=d.get("result") or {}
print(r.get("dispatchId","") if d.get("ok") else "")' "$ST/start-$agent.json")
    # A failed start may have left resources behind; never relaunch blindly (see SKILL.md).
    if [ -z "$d" ]; then echo "$(el) START FAILED $agent — see $ST/start-$agent.json"; continue; fi
    echo "$d $agent" >> "$ST/map"; echo "$(el) started $agent $d"
  done
  [ -s "$ST/map" ] || { echo "nothing started"; exit 1; }
  cp "$ST/map" "$ST/pending"
fi

name() { awk -v d="$1" '$1==d{print $2}' "$ST/map"; }
drop() { grep -v "^$1 " "$ST/pending" > "$ST/p2"; mv "$ST/p2" "$ST/pending"; }

while [ -s "$ST/pending" ]; do
  out=$(orca orchestration check --run "$RUN" --wait --types "worker_done,escalation,question,heartbeat" --timeout-ms 30000 --json 2>/dev/null | grep -v '"_keepalive"')
  parsed=$(printf '%s' "$out" | j '
import json,sys
r=json.load(sys.stdin).get("result",{})
print(r.get("deliveryId") or "-")
for m in r.get("messages",[]):
    p=json.loads(m.get("payload") or "{}")
    print(m["type"], p.get("dispatchId","-"), p.get("outcome","-"), (m.get("subject") or "").replace("\n"," "))')
  did=$(printf '%s\n' "$parsed" | head -1)
  if [ -z "$did" ] || [ "$did" = "-" ]; then
    # Quiet window. A worker whose process died never sends worker_done; only a recorded
    # failed/stopped state (positive proof) takes it off the pending list.
    while read -r d agent; do
      st=$(orca orchestration worker-show --dispatch "$d" --json 2>/dev/null | j 'import json,sys
r=json.load(sys.stdin).get("result",{}); print(r.get("worker",{}).get("state",""), "|", r.get("dispatch",{}).get("lastFailure") or "")')
      case $st in failed*|stopped*|abandoned*) echo "$(el) FAILED $agent $d: ${st#*| }"; drop "$d" ;; esac
    done < "$ST/pending"
    continue
  fi
  stop=0
  while read -r type disp outcome subject; do
    case $type in
      heartbeat) ;;
      worker_done)
        echo "$(el) done $(name "$disp") $outcome — $subject"
        # Release closes the agent terminal Orca launched and archives its transcript.
        orca orchestration worker-release --dispatch "$disp" --json >/dev/null 2>&1
        drop "$disp" ;;
      *) stop=1 ;;
    esac
  done < <(printf '%s\n' "$parsed" | tail -n +2)
  if [ $stop = 1 ]; then
    echo "NEEDS COORDINATOR — run $RUN, delivery $did (not acked). After reply + ack: $0 --resume $ST"
    printf '%s\n' "$out"; exit 2
  fi
  orca orchestration check --run "$RUN" --ack "$did" --json >/dev/null 2>&1
done
wait
echo "all settled in $(( $(date +%s)-T0 ))s (run $RUN)"

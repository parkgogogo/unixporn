#!/usr/bin/env bash
# Hand tasks off to agents in other Orca workspaces, in parallel, and return as soon as each agent
# has demonstrably started its task. Ownership moves to the receiving agent: nothing waits for
# results, no orchestration Run/Task is created.
#
# usage: orca_handoff.sh agent@target=specfile [agent@target=specfile ...]
#   agent   codex | grok | dsh (any other Orca agent id works on the new-worktree path)
#   target  an existing workspace: any Orca worktree selector — path:/abs, name:<display name>,
#           id:<repoId>::<path>, branch:<branch>
#           or a new worktree:  +<repo>/<name>   (repo display name from `orca repo list`)
#   ORCA_HANDOFF_SETUP=inherit|run|skip   setup hooks for new worktrees (default inherit)
# Prints one line per handoff; exit 0 when every agent started, 1 otherwise. bash 3.2 compatible.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
SETUP=${ORCA_HANDOFF_SETUP:-inherit}
STORE=${ORCA_HANDOFF_HOME:-$HOME/.orca-handoff}; mkdir -p "$STORE"
T0=$(date +%s); el() { echo "+$(( $(date +%s)-T0 ))s"; }
[ $# -ge 1 ] || { sed -n 2,13p "$0"; exit 64; }
OUT=$(mktemp -d)

# Launch command for an existing workspace. The task goes in as a CLI argument, never as pasted
# keystrokes, so there is no Enter to lose. The prompt file sits outside every repo.
launch_cmd() { # agent promptfile
  case $1 in
    codex) echo "codex \"\$(cat '$2')\"" ;;
    grok)  echo "grok -- \"\$(cat '$2')\"" ;;
    dsh)   echo "dsh-tui . -- \"\$(cat '$2')\"" ;;
    *)     return 1 ;;
  esac
}

# Watch the new agent until its task is visibly running. Clears the two known blockers:
# grok's folder-trust dialog (the user chose this workspace, so it is trusted with `y`), and a task
# left unsubmitted in the input box. Enter goes only once the box content is unchanged across two
# reads (a long paste has finished arriving); text still in the box means nothing was submitted,
# so a retry cannot start the task twice.
confirm() { # handle specfile agent -> prints STARTED or the last state
  local h=$1 spec=$2 agent=$3 st last="" enters=0 trusted=0 i
  for i in $(seq 40); do
    sleep 1.5
    st=$(orca terminal read --terminal "$h" --screen --json 2>/dev/null | python3 "$HERE/screen_state.py" "$spec" "$agent")
    case $st in
      STARTED) echo STARTED; return ;;
      TRUST) [ $trusted = 0 ] && { orca terminal send --terminal "$h" --text y --json >/dev/null 2>&1; trusted=1; echo "$(el) $agent: answered grok folder-trust prompt (y)" >&2; } ;;
      PENDING:*)
        if [ "$st" = "$last" ] && [ $enters -lt 4 ]; then
          orca terminal send --terminal "$h" --enter --json >/dev/null 2>&1; enters=$((enters+1)); st=""
          echo "$(el) $agent: task was left unsubmitted, sent Enter (#$enters)" >&2
        fi ;;
    esac
    last=$st
  done
  echo "UNCONFIRMED($st)"
}

handoff() { # n agent target spec
  local n=$1 agent=$2 target=$3 spec=$4 res h wt st pf=""
  if [ "${target#+}" != "$target" ]; then
    local repo=${target#+}; repo=${repo%%/*}; local name=${target##*/}
    res=$(orca worktree create --repo "name:$repo" --name "$name" --no-parent --agent "$agent" \
            --prompt "$(cat "$spec")" --setup "$SETUP" --json 2>&1)
  else
    pf="$STORE/$(date +%Y%m%d-%H%M%S)-$n-$agent.md"; cp "$spec" "$pf"
    local cmd; cmd=$(launch_cmd "$agent" "$pf") || { echo "$n $agent $target FAILED unsupported agent for an existing workspace (use codex/grok/dsh)" > "$OUT/$n"; return; }
    res=$(orca terminal create --worktree "$target" --title "handoff: $agent" --command "$cmd" --json 2>&1)
  fi
  read -r h wt <<EOF
$(printf '%s' "$res" | python3 -c '
import json,sys
try: d=json.load(sys.stdin)
except Exception: print("- -"); sys.exit()
r=d.get("result") or {}
h=r.get("agentTerminalHandle") or (r.get("startupTerminal") or {}).get("handle") or (r.get("terminal") or {}).get("handle") or "-"
wt=(r.get("worktree") or {}).get("path") or (r.get("terminal") or {}).get("worktreeId","-").split("::")[-1]
print(h if d.get("ok") else "-", wt or "-")' 2>/dev/null)
EOF
  if [ "$h" = "-" ]; then echo "$n $agent $target FAILED $(printf '%s' "$res" | tr '\n' ' ' | cut -c1-300)" > "$OUT/$n"; return; fi
  st=$(confirm "$h" "$spec" "$agent")
  # The shell expanded the prompt file at launch; once the task is running it is no longer needed.
  [ "$st" = STARTED ] && [ -n "${pf:-}" ] && rm -f "$pf"
  echo "$n $agent $target $st $(el) workspace=$wt terminal=$h" > "$OUT/$n"
}

n=0
for arg in "$@"; do
  n=$((n+1)); agent=${arg%%@*}; rest=${arg#*@}; spec=${rest##*=}; target=${rest%=*}
  [ -s "$spec" ] || { echo "missing spec: $spec"; exit 64; }
  handoff $n "$agent" "$target" "$spec" &
done
wait
ok=0
for i in $(seq $n); do
  line=$(cat "$OUT/$i"); echo "${line#* }"
  case $line in *" STARTED "*) ;; *) ok=1 ;; esac
done
echo "handoff finished in $(( $(date +%s)-T0 ))s"
exit $ok

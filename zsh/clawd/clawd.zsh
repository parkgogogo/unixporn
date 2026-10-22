# Clawd — Claude's mascot says hi when a terminal opens, and dances on demand.
#
#   clawd                dance until any key (at most 8 bars), then report how long
#   CLAWD_INTRO=dance    what a new terminal shows: dance (default), still, off
#   CLAWD_NAME=...       name in the greeting (default: user.name from ~/.gitconfig)
#
# Load it at the very top of ~/.zshrc, above the Powerlevel10k instant prompt block,
# because the greeting prints to the console:
#
#   { [[ -r ~/.config/clawd/clawd.zsh ]] && source ~/.config/clawd/clawd.zsh && clawd-intro } always { TRY_BLOCK_ERROR=0 }
#
# The always block keeps a broken greeting from aborting the rest of ~/.zshrc.

source ${${(%):-%x}:A:h}/frames.zsh
zmodload zsh/zselect zsh/datetime 2>/dev/null

typeset -ga _clawd_verbs=(Grooving Boogieing Shimmying Jiving Moonwalking Vibing Wiggling Bopping Clauding)
typeset -ga _clawd_past=(Grooved Boogied Shimmied Jived Moonwalked Vibed Wiggled Bopped Clauded)
typeset -ga _clawd_spin=(· ✢ ✳ ✶ ✻ ✽ ✻ ✶ ✳ ✢)
typeset -g _clawd_o=$'\e[38;2;217;119;87m' _clawd_hi=$'\e[38;2;245;185;158m'
typeset -g _clawd_dim=$'\e[38;2;120;120;120m' _clawd_b=$'\e[1m' _clawd_r=$'\e[0m'

# _clawd_draw <frame> <text0> <text1> <text2> <text3>
# Redraws the 4-row block from its top row and returns the cursor there.
_clawd_draw() {
  local -a rows=("${(@f)1}")
  local out= i
  for i in 1 2 3 4; do
    out+=$'\r\e[2K'$_clawd_o${(r:10:: :)rows[i]}$_clawd_r"  "${argv[i+1]}
    (( i < 4 )) && out+=$'\n'
  done
  print -nr -- $out$'\e[3A\r'
}

# REPLY = the verb with a light band sweeping across it, like Claude Code's spinner.
_clawd_shimmer() {
  local word=$1… i
  local -i at=$2
  REPLY=
  for (( i = 1; i <= $#word; i++ )); do
    if (( i >= at - 1 && i <= at + 1 )); then REPLY+=$_clawd_hi$word[i]
    else REPLY+=$_clawd_o$word[i]; fi
  done
  REPLY+=$_clawd_r
}

_clawd_name() {
  [[ -n $CLAWD_NAME ]] && { print -r -- $CLAWD_NAME; return }
  local line section=
  [[ -r ~/.gitconfig ]] && for line in "${(@f)$(<~/.gitconfig)}"; do
    if [[ $line =~ '^[[:space:]]*\[([^]]*)\]' ]]; then
      section=$match[1]
    elif [[ $section == user && $line =~ '^[[:space:]]*name[[:space:]]*=[[:space:]]*(.*[^[:space:]])' ]]; then
      print -r -- $match[1]; return
    fi
  done
  print -r -- $USER
}

# _clawd_bar <verb> <key-stops>: one bar of dance. Returns 1 if a key was pressed.
_clawd_bar() {
  local verb=$1 f k pad REPLY
  local -i i=0
  for f in $_clawd_dance; do
    (( i++ ))
    printf -v pad '%*s' $(( i % 4 * 2 )) ''
    _clawd_shimmer $verb $(( i * 2 - 2 ))
    _clawd_draw $f "$_clawd_dim$pad♪$_clawd_r" "$_clawd_o$_clawd_spin[i]$_clawd_r $REPLY" "" ""
    if (( $2 )); then
      read -s -k 1 -t 0.09 k && return 1
    else
      zselect -t 9 2>/dev/null || sleep 0.09
    fi
  done
  return 0
}

# Shared setup/teardown: reserve 4 rows, hide the cursor and the typed echo.
_clawd_stage() {
  local tty_state
  tty_state=$(stty -g 2>/dev/null)
  stty -echo 2>/dev/null
  print -n $'\e[?25l\n\n\n\e[3A\r'
  {
    "$@"
  } always {
    print -n $'\e[3B\r\n\e[?25h'
    [[ -n $tty_state ]] && stty $tty_state 2>/dev/null
  }
}

_clawd_greet() {
  local mode=$1 term=${TERM_PROGRAM:-terminal}
  local ver=${TERM_PROGRAM_VERSION:-$ORCA_APP_VERSION}
  local -a text=(
    ""
    "$_clawd_o✻$_clawd_r $_clawd_b$(_clawd_name)$_clawd_r, welcome back"
    "$_clawd_dim$(strftime '%a %b %-d · %H:%M' $EPOCHSECONDS)$_clawd_r"
    "$_clawd_dim$term${ver:+ $ver} · zsh $ZSH_VERSION$_clawd_r"
  )
  if [[ $mode == dance ]]; then
    local -i v=$(( RANDOM % ${#_clawd_verbs} + 1 ))
    _clawd_bar $_clawd_verbs[v] 0
    _clawd_draw $_clawd_rest $text
    zselect -t 30 2>/dev/null
    _clawd_draw $_clawd_blink $text
    zselect -t 8 2>/dev/null
  fi
  _clawd_draw $_clawd_rest $text
}

clawd-intro() {
  local mode=${CLAWD_INTRO:-dance}
  [[ $mode == (dance|still) && -o interactive && -t 0 && -t 1 && $TERM != dumb ]] || return 0
  [[ -z $ORCA_AGENT_LAUNCH_TOKEN && -z $CLAUDECODE ]] || return 0  # agent terminals stay quiet
  (( COLUMNS >= 44 && LINES >= 10 )) || return 0
  _clawd_stage _clawd_greet $mode
  print
}

_clawd_party() {
  local -i v=$(( RANDOM % ${#_clawd_verbs} + 1 ))
  local verb=$_clawd_verbs[v]
  local -F start=$EPOCHREALTIME
  local -i bars=0
  while (( bars++ < 8 )) && _clawd_bar $verb 1; do :; done
  local -i secs=$(( EPOCHREALTIME - start + 0.5 ))
  _clawd_draw $_clawd_rest "" "$_clawd_o✻$_clawd_r $_clawd_past[v] for ${secs}s" "" ""
}

clawd() {
  [[ -t 0 && -t 1 ]] || { print -r -- $_clawd_rest; return }
  _clawd_stage _clawd_party
}

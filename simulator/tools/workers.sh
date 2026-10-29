#!/bin/bash
# The shared browser cap of ALL simulator lanes: how many Playwright browsers a run may start now = the shared budget
# (WB_WORKERS_TOTAL, default 8) minus what is already busy on this host, never below 1. Prints one integer on stdout.
#
#   simulator/tools/workers.sh                      # free workers now
#   simulator/tools/workers.sh --max 4              # at most 4
#   simulator/tools/workers.sh --claim --pid $$     # also hold the answer for process $$ until it exits, so a run
#                                                   # starting in the same minute does not count the same workers as free
#   simulator/tools/workers.sh --release --pid $$   # give a claim back before the process ends (prints nothing)
#   simulator/tools/workers.sh -v                   # the breakdown on stderr
#
# Busy = max(browsers running, workers held by live claims). A browser is a Playwright-launched MAIN process:
#   - Chromium: chrome-headless-shell, or chrome/chromium with --headless and --remote-debugging-pipe;
#   - WebKit: the MiniBrowser that Playwright starts with --inspector-pipe.
# Renderer/helper processes (--type=…), shell wrappers (pw_run.sh, the MiniBrowser launcher script), a process whose
# parent is already counted, and long-lived CDP browsers (--remote-debugging-port) are not counted twice or at all.
# Claims live in ~/.cache/claude-builds/cs-simulator/workers/<pid> and vanish with their process. The count and the claim
# are taken under one flock on ~/.cache/claude-builds/cs-simulator/browsers.lock, so two lanes asking at once do not
# both see the same workers as free. See simulator/README.md.
set -u
BASE=$HOME/.cache/claude-builds/cs-simulator
TOTAL=${WB_WORKERS_TOTAL:-8}; MAX=0; CLAIM=0; RELEASE=0; PID=$PPID; VERBOSE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --max) MAX=$2; shift ;;
    --claim) CLAIM=1 ;;
    --release) RELEASE=1 ;;
    --pid) PID=$2; shift ;;
    --total) TOTAL=$2; shift ;;
    -v|--verbose) VERBOSE=1 ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) echo "workers.sh: unknown argument $1" >&2; exit 2 ;;
  esac; shift
done
DIR=$BASE/workers; mkdir -p "$DIR"
exec 9>"$BASE/browsers.lock"; flock 9
[ "$RELEASE" = 1 ] && { rm -f "$DIR/$PID"; exit 0; }

# pid ppid args → one line per process; the awk keeps the Playwright browser main processes (see the header)
browsers=$(ps -eo pid=,ppid=,args= | awk '
  { pid = $1; ppid = $2; exe = $3 }
  $0 ~ /--type=/ { next }
  exe ~ /(^|\/)(bash|sh|dash|zsh|fish|awk|gawk|mawk|ps|grep|rg|env|timeout|flock|sed|tail|head|watch)$/ { next }
  exe ~ /chrome-headless-shell$/ { cand[pid] = ppid; next }
  exe ~ /(chrome|chromium)$/ && /--headless/ && /--remote-debugging-pipe/ && !/--remote-debugging-port/ { cand[pid] = ppid; next }
  /--inspector-pipe/ { cand[pid] = ppid }
  END { n = 0; for (p in cand) if (!(cand[p] in cand)) n++; print n }')

claimed=0
for f in "$DIR"/[0-9]*; do
  [ -e "$f" ] || continue
  p=${f##*/}
  if kill -0 "$p" 2>/dev/null; then claimed=$((claimed + $(cat "$f" 2>/dev/null || echo 0))); else rm -f "$f"; fi
done
[ -e "$DIR/$PID" ] && claimed=$((claimed - $(cat "$DIR/$PID")))   # a re-claim by the same process replaces its own
busy=$(( browsers > claimed ? browsers : claimed ))
free=$(( TOTAL - busy )); [ "$free" -lt 1 ] && free=1
[ "$MAX" -gt 0 ] && [ "$free" -gt "$MAX" ] && free=$MAX
[ "$CLAIM" = 1 ] && kill -0 "$PID" 2>/dev/null && echo "$free" > "$DIR/$PID"
flock -u 9
[ "$VERBOSE" = 1 ] && echo "workers: total $TOTAL, browsers running $browsers, held by claims $claimed → $free free$([ "$CLAIM" = 1 ] && echo ", held for pid $PID")" >&2
echo "$free"

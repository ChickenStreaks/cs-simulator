#!/bin/bash
# Start and wait for long runs: the way simulator lanes wait for suites, sweeps, crawls and builds (see simulator/README.md).
# A wait always ends with ONE status line on stdout and an exit code that says what happened:
#   finished (0) · failed exit=N (1) · died (3: the process is gone with no exit record, or killed by a signal)
#   silent N min (4: still running but its output has not changed for N minutes) · max wait (5) · ended, status unknown (6)
#
#   simulator/tools/wait-run.sh start NAME -- CMD [ARGS…]   # run CMD detached; output, pid and exit code under $WB_RUNS_DIR/NAME.*
#   simulator/tools/wait-run.sh wait NAME [--silent MIN] [--max MIN] [--every SEC]
#   simulator/tools/wait-run.sh wait --pid PID --out FILE [--silent MIN] …   # a run not started here (exit code unknown)
#   simulator/tools/wait-run.sh status NAME                 # the status line now, without waiting
#   simulator/tools/wait-run.sh list                        # every run in $WB_RUNS_DIR with its status
#
# WB_RUNS_DIR defaults to ~/.cache/claude-builds/cs-simulator/runs. Defaults: --silent 10, --max 0 (no limit), --every 15.
# In Claude Code run the wait with run_in_background (you are notified when it prints its line), or in the foreground
# with --max under the tool's 10-minute limit; never poll with sleep, never wait on a run you have not checked with
# `status` first. Pair it with simulator/tools/workers.sh for the shared browser cap.
set -u
RUNS=${WB_RUNS_DIR:-$HOME/.cache/claude-builds/cs-simulator/runs}; mkdir -p "$RUNS"
usage() { sed -n '2,16p' "$0"; exit 2; }
fmt() { local s=$1; [ "$s" -ge 3600 ] && printf '%dh%02dm' $((s/3600)) $((s%3600/60)) || printf '%dm%02ds' $((s/60)) $((s%60)); }
mtime() { stat -c %Y "$1" 2>/dev/null || echo 0; }
last() { [ -s "$1" ] && tail -c 65536 "$1" | tr '\r' '\n' | sed 's/\x1b\[[0-9;]*[A-Za-z]//g' | grep -v '^[[:space:]]*$' | tail -1 | cut -c1-200; }
alive() { [ -n "$1" ] && kill -0 "$1" 2>/dev/null; }

# status NAME|"" PID OUT EXITFILE STARTED → sets LINE and CODE; RUNNING=1 while the process lives
status() {
  local name=$1 pid=$2 out=$3 ex=$4 started=$5 now; now=$(date +%s)
  [ -n "$ex" ] && [ -s "$ex" ] && now=$(mtime "$ex")   # a finished run: its duration, not the time since it started
  local age=$(( now - started )) idle=$(( $(date +%s) - $(mtime "$out") )) size; size=$(du -h "$out" 2>/dev/null | cut -f1)
  local tail; tail=$(last "$out"); RUNNING=0
  if [ -n "$ex" ] && [ -s "$ex" ]; then
    local c; c=$(cat "$ex")
    if [ "$c" = 0 ]; then LINE="finished exit=0"; CODE=0
    elif [ "$c" -gt 128 ] 2>/dev/null; then LINE="died (signal $((c-128)), exit=$c)"; CODE=3
    else LINE="failed exit=$c"; CODE=1; fi
  elif alive "$pid"; then
    RUNNING=1; LINE="running, output idle $(fmt $idle)"; CODE=0
  elif [ -n "$ex" ]; then LINE="died (pid $pid gone, no exit record)"; CODE=3
  else LINE="ended, exit status unknown (pid $pid gone; not started by wait-run)"; CODE=6; fi
  local left=""   # what the run left behind in its session (setsid at start: session id = pid), e.g. browsers
  [ "$RUNNING" = 0 ] && [ -n "$ex" ] && left=$(pgrep -s "$pid" 2>/dev/null | wc -l) && [ "$left" -gt 0 ] && left=" · $left processes left in its session (pkill -s $pid)" || left=""
  WHO="wait-run: ${name:-pid $pid}"; REST="after $(fmt $age) · out $out (${size:-0})$left · last: ${tail:-<no output>}"
  LINE="$WHO $LINE $REST"
}

resolve() {   # NAME → PID OUT EX STARTED
  local n=$1 base; case "$n" in */*) base=$n ;; *) base=$RUNS/$n ;; esac
  [ -e "$base.pid" ] || { echo "wait-run: $n unknown (no $base.pid)"; exit 2; }
  PID=$(cat "$base.pid"); OUT=$base.out; EX=$base.exit; STARTED=$(mtime "$base.pid")
}

cmd=${1:-}; [ -n "$cmd" ] || usage; shift
case "$cmd" in
  start)
    NAME=${1:-}; [ -n "$NAME" ] || usage; shift; [ "${1:-}" = "--" ] && shift; [ $# -gt 0 ] || usage
    base=$RUNS/$NAME
    if [ -e "$base.pid" ] && alive "$(cat "$base.pid")" && [ ! -s "$base.exit" ]; then echo "wait-run: $NAME is already running (pid $(cat "$base.pid"))"; exit 2; fi
    rm -f "$base.exit" "$base.out"; printf '%q ' "$@" > "$base.cmd"; echo "# cwd $PWD" >> "$base.cmd"
    # the wrapper records the exit code; setsid keeps the run alive when the caller's shell ends
    setsid nohup bash -c '"$@" > "$0.out" 2>&1 < /dev/null; echo $? > "$0.exit"' "$base" "$@" > /dev/null 2>&1 &
    echo $! > "$base.pid"
    echo "wait-run: $NAME started pid $! · out $base.out · wait with: simulator/tools/wait-run.sh wait $NAME"
    ;;
  status)
    [ -n "${1:-}" ] || usage; resolve "$1"; status "$1" "$PID" "$OUT" "$EX" "$STARTED"; echo "$LINE"; exit $CODE ;;
  list)
    for p in "$RUNS"/*.pid; do [ -e "$p" ] || continue; n=$(basename "$p" .pid); resolve "$n"; status "$n" "$PID" "$OUT" "$EX" "$STARTED"; echo "$LINE"; done ;;
  wait)
    SILENT=10; MAX=0; EVERY=15; NAME=""; PID=""; OUT=""; EX=""; STARTED=$(date +%s)
    while [ $# -gt 0 ]; do
      case "$1" in
        --silent) SILENT=$2; shift ;; --max) MAX=$2; shift ;; --every) EVERY=$2; shift ;;
        --pid) PID=$2; shift ;; --out) OUT=$2; shift ;;
        -*) usage ;; *) NAME=$1 ;;
      esac; shift
    done
    if [ -n "$NAME" ]; then resolve "$NAME"; elif [ -z "$PID" ] || [ -z "$OUT" ]; then usage
    else e=$(ps -o etimes= -p "$PID" 2>/dev/null | tr -d ' '); [ -n "$e" ] && STARTED=$(( $(date +%s) - e )); fi
    t0=$(date +%s)
    trap 'status "$NAME" "$PID" "$OUT" "$EX" "$STARTED"; echo "$LINE (wait interrupted)"; exit 130' INT TERM HUP
    while :; do
      status "$NAME" "$PID" "$OUT" "$EX" "$STARTED"
      if [ "$RUNNING" = 0 ]; then
        # the wrapper writes the exit file right after the command ends: give it a moment before calling it «died»
        if [ -n "$EX" ] && [ ! -s "$EX" ] && [ "$CODE" = 3 ]; then sleep 2; status "$NAME" "$PID" "$OUT" "$EX" "$STARTED"; fi
        echo "$LINE"; exit $CODE
      fi
      idle=$(( $(date +%s) - $(mtime "$OUT") ))
      if [ "$SILENT" -gt 0 ] && [ "$idle" -ge $((SILENT*60)) ]; then echo "$WHO silent $((idle/60)) min (still running, pid $PID) $REST"; exit 4; fi
      if [ "$MAX" -gt 0 ] && [ $(( $(date +%s) - t0 )) -ge $((MAX*60)) ]; then echo "$WHO max wait $MAX min reached, still running (pid $PID, output idle $(fmt $idle)) $REST"; exit 5; fi
      sleep "$EVERY"
    done ;;
  -h|--help|help) usage ;;
  *) usage ;;
esac

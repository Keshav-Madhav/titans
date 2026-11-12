#!/usr/bin/env bash
# Run a heavy (browser) job only when the machine is quiet — the user's laptop nearly died twice on
# 2026-11-04 from test runs piling on top of their own work. Waits (up to 10 min) until the
# 1-minute load is under 18 (raised 2026-11-05: the user — "load will be high for a while… you can work
# too, make sure the load isn't high enough to explode"; the monitor still kills runs at 25) and no other
# headless Chrome is running, runs the command, then leaves
# 45 s of quiet before returning so back-to-back runs can't stack up.
#   tools/guarded.sh <command> [args…]
set -u
# Busy headless Chrome only (summed CPU over 30%): another session's idle headless browser left open
# held every run off for its whole 10 minutes (2026-11-12).
busyHeadless() {
  local pids
  pids=$(pgrep -f '[G]oogle Chrome.app/Contents/MacOS/Google Chrome .*--headless|[c]hrome-headless-shell' | tr '\n' ',' | sed 's/,$//')
  [ -z "$pids" ] && return 1
  ps -o %cpu= -p "$pids" | awk '{s+=$1} END {exit !(s > 30)}'
}
for i in $(seq 1 60); do
  L=$(sysctl -n vm.loadavg | awk '{print $2}')
  if awk "BEGIN{exit !($L < 18)}" && ! busyHeadless; then
    "$@"; rc=$?
    sleep 45
    exit $rc
  fi
  [ "$i" = 1 ] && echo "[guarded] waiting: load $L$(busyHeadless && echo ', another headless Chrome busy')" >&2
  sleep 10
done
echo "[guarded] gave up after 10 min: the machine never cooled (load $(sysctl -n vm.loadavg | awk '{print $2}'))" >&2
exit 75

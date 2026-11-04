#!/usr/bin/env bash
# Run a heavy (browser) job only when the machine is quiet — the user's laptop nearly died twice on
# 2026-11-04 from test runs piling on top of their own work. Waits (up to 10 min) until the
# 1-minute load is under 10 and no other headless Chrome is running, runs the command, then leaves
# 45 s of quiet before returning so back-to-back runs can't stack up.
#   tools/guarded.sh <command> [args…]
set -u
for i in $(seq 1 60); do
  L=$(sysctl -n vm.loadavg | awk '{print $2}')
  if awk "BEGIN{exit !($L < 10)}" && ! pgrep -f "[G]oogle Chrome.*--headless|[c]hrome-headless-shell" >/dev/null; then
    "$@"; rc=$?
    sleep 45
    exit $rc
  fi
  [ "$i" = 1 ] && echo "[guarded] waiting: load $L$(pgrep -f '[G]oogle Chrome.*--headless|[c]hrome-headless-shell' >/dev/null && echo ', another headless Chrome up')" >&2
  sleep 10
done
echo "[guarded] gave up after 10 min: the machine never cooled (load $(sysctl -n vm.loadavg | awk '{print $2}'))" >&2
exit 75

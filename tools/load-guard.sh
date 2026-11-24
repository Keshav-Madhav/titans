#!/bin/bash
# The load guard: while the 1-minute load is 50 or more, kill TITANS's own headless Chrome (its parent
# node runs with its cwd in this repo) — never another project's. Run under a watcher; prints what it kills.
while true; do
  l=$(sysctl -n vm.loadavg | awk '{print int($2)}')
  if [ "$l" -ge 50 ]; then
    for p in $(pgrep -f "Google Chrome.app/Contents/MacOS/Google Chrome .*--headless"); do
      pp=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')
      [ -z "$pp" ] && continue
      cwd=$(lsof -a -p "$pp" -d cwd -Fn 2>/dev/null | grep '^n' | cut -c2-)
      case "$cwd" in *Repositories/titans*) kill "$p" 2>/dev/null && echo "load $l: killed TITANS headless chrome $p";; esac
    done
  fi
  sleep 5
done

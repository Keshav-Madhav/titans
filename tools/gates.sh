#!/usr/bin/env bash
# Every gate, one after another, against the preview server (npm run preview).
#   tools/gates.sh [out-dir]   → a line per gate: PASS / FAIL, and a summary
# Shots go to <out-dir> (default shots/gates); logs to <out-dir>/<gate>.log; seconds per gate to
# <out-dir>/timings.txt. TITANS_URL=<origin> tests another server (default http://localhost:4317).
set -u
out=${1:-shots/gates}
mkdir -p "$out"
cd "$(dirname "$0")/.."
mkdir -p "$out"
: >"$out/timings.txt" # seconds per gate, one line each
# One headless Chrome for the whole sweep (a launch per gate cost its GPU process and shader
# cache every time); each gate still gets a fresh browser context of its own — see tools/browser.mjs.
# GATES_SHARED_BROWSER=0 goes back to a browser per gate.
if [ "${GATES_SHARED_BROWSER:-1}" != 0 ]; then
  wsfile="$out/.browser-ws"
  rm -f "$wsfile"
  node tools/browser-server.mjs "$wsfile" >"$out/browser-server.log" 2>&1 &
  server=$!
  trap 'kill $server 2>/dev/null; wait $server 2>/dev/null' EXIT
  for _ in $(seq 1 600); do [ -s "$wsfile" ] || ! kill -0 $server 2>/dev/null && break; sleep 0.1; done
  if [ -s "$wsfile" ]; then export TITANS_BROWSER_WS=$(cat "$wsfile"); else echo "(shared browser did not start; a browser per gate)" >&2; fi
fi
pass=0
fail=0
failed=()
run() {
  local name=$1
  shift
  # GATES_ONLY="walk climb …" runs just those gates.
  [ -n "${GATES_ONLY:-}" ] && [[ " $GATES_ONLY " != *" $name "* ]] && return
  local t0=$SECONDS
  if "$@" >"$out/$name.log" 2>&1; then
    echo "PASS  $name"
    pass=$((pass + 1))
  else
    echo "FAIL  $name   (see $out/$name.log)"
    fail=$((fail + 1))
    failed+=("$name")
  fi
  echo "$name $((SECONDS - t0))" >>"$out/timings.txt"
}
run lakes npx tsx tools/fill-bench.ts
run save node tools/single.mjs
run respect node tools/respect.mjs "$out"
run keys node tools/keys.mjs "$out"
run sfx node tools/sfx.mjs
run fps node tools/fps.mjs
run adversary node tools/adversary.mjs "$out/adversary"
# The playable world, a scene each (each throws if what it tests does not hold).
for s in walk run climb fall undercroft eerie bell dread rocks cairns map discover bag spots raid wisp resonance bow aim sight horn glide flight steps uncover offer mire herd awakening hands daynight lands_weather life weather wall vistas colossi forest giant carved shore high grapple pause; do
  run "$s" env SHOTS="$out" node tools/shot.mjs "$s"
done
# The features of 2026-11-05, driven like a player (each exits non-zero if what it tests stops holding).
for s in sled seeds lanterns bells woodbell dunebell bellsave thermals knees; do
  mkdir -p "$out/$s"
  run "$s" node "tools/features/$s.mjs" "$out/$s"
done
echo "--- $pass passed, $fail failed${failed:+: ${failed[*]}}"
[ "$fail" -eq 0 ]

#!/usr/bin/env bash
# Every gate, one after another, against the preview server (npm run preview).
#   tools/gates.sh [out-dir]   → a line per gate: PASS / FAIL, and a summary
# Shots go to <out-dir> (default shots/gates); logs to <out-dir>/<gate>.log.
set -u
out=${1:-shots/gates}
mkdir -p "$out"
cd "$(dirname "$0")/.."
pass=0
fail=0
failed=()
run() {
  local name=$1
  shift
  if "$@" >"$out/$name.log" 2>&1; then
    echo "PASS  $name"
    pass=$((pass + 1))
  else
    echo "FAIL  $name   (see $out/$name.log)"
    fail=$((fail + 1))
    failed+=("$name")
  fi
}
run lakes npx tsx tools/fill-bench.ts
run save node tools/single.mjs
# The playable world, a scene each (each throws if what it tests does not hold).
for s in walk run climb fall undercroft eerie bell dread rocks cairns map discover bag spots raid wisp resonance bow aim sight horn glide flight steps uncover offer mire herd awakening hands daynight lands_weather life weather wall vistas colossi forest giant carved shore high grapple; do
  run "$s" env SHOTS="$out" node tools/shot.mjs "$s"
done
echo "--- $pass passed, $fail failed${failed:+: ${failed[*]}}"
[ "$fail" -eq 0 ]

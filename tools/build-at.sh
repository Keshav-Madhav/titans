#!/usr/bin/env bash
# Build the game as it was at a commit and serve it, for before/after shots.
#   tools/build-at.sh <commit> <work-dir> [port]      → http://localhost:<port>/
# The worktree borrows the main checkout's node_modules, except for our own
# workspaces, which point at the worktree's copies (so its shared/ is used).
set -euo pipefail
commit=$1
dir=$2
port=${3:-4318}
root=$(cd "$(dirname "$0")/.." && pwd)
wt="$dir/titans-at-$commit"
if [ ! -d "$wt" ]; then
  git -C "$root" worktree add --detach "$wt" "$commit" >/dev/null
  mkdir -p "$wt/node_modules/@titans"
  for e in "$root"/node_modules/* "$root"/node_modules/.bin; do
    name=$(basename "$e")
    [ "$name" = "@titans" ] && continue
    ln -s "$e" "$wt/node_modules/$name"
  done
  ln -s "$wt/shared" "$wt/node_modules/@titans/shared"
  ln -s "$wt/client" "$wt/node_modules/@titans/client"
fi
cd "$wt/client"
node "$root/node_modules/vite/bin/vite.js" build --logLevel error
exec node "$root/node_modules/vite/bin/vite.js" preview --port "$port" --strictPort

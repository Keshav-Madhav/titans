#!/usr/bin/env bash
# Put the freshly built client into the folder the play server (port 4402) serves, safely for a
# tab that is open or reloading: every asset first (old ones kept, so an open tab's lazy chunks
# still load), each written to a temp name and moved into place; index.html last, the same way.
# A reload mid-copy then gets either the old page and its old assets, or the new page with all of
# its assets already there — never a page that points at files not yet written (a black screen).
#   tools/publish-play.sh <play dir>
set -euo pipefail
cd "$(dirname "$0")/.."
DEST=${1:?play dir}
SRC=client/dist
mkdir -p "$DEST"
# Everything but index.html.
(cd "$SRC" && find . -type f ! -name index.html) | while read -r f; do
  mkdir -p "$DEST/$(dirname "$f")"
  if [ ! -f "$DEST/$f" ] || ! cmp -s "$SRC/$f" "$DEST/$f"; then
    cp "$SRC/$f" "$DEST/$f.part" && mv -f "$DEST/$f.part" "$DEST/$f"
  fi
done
cp "$SRC/index.html" "$DEST/index.html.part" && mv -f "$DEST/index.html.part" "$DEST/index.html"
echo "published $(ls "$DEST/assets" | wc -l | tr -d ' ') assets"

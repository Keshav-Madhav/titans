#!/usr/bin/env bash
# Recorded sound effects (all CC0, Kenney: Impact Sounds, RPG Audio, Interface Sounds —
# see AUDIO.md) → client/public/sfx/*.mp3. Each: silence below -50 dBFS trimmed from both
# ends, at most 1.6 s (faded), mono 44.1 kHz, peak-normalised to -1 dBFS, MP3 64 kb/s.
#   tools/build-sfx.sh <dir the three Kenney packs were unzipped into>
set -euo pipefail
SRC="$1"
OUT="$(dirname "$0")/../client/public/sfx"
mkdir -p "$OUT"
I="$SRC/impact-sounds/Audio"; R="$SRC/rpg-audio/Audio"; U="$SRC/interface-sounds/Audio"
MAP=()
for k in 0 1 2 3 4; do
  MAP+=("step-grass-$k:$I/footstep_grass_00$k.ogg" "step-stone-$k:$I/footstep_concrete_00$k.ogg" "step-snow-$k:$I/footstep_snow_00$k.ogg" "step-soft-$k:$I/footstep_carpet_00$k.ogg" "ui-click-$k:$U/click_00$((k + 1)).ogg")
done
for k in 0 1 2; do
  MAP+=("land-heavy-$k:$I/impactSoft_heavy_00$k.ogg" "land-soft-$k:$I/impactSoft_medium_00$k.ogg" "page-$k:$R/bookFlip$((k + 1)).ogg" "book-place-$k:$R/bookPlace$((k + 1)).ogg")
done
for k in 0 1 2 3; do MAP+=("cloth-$k:$R/cloth$((k + 1)).ogg" "ui-toggle-$k:$U/toggle_00$((k + 1)).ogg"); done
MAP+=("book-open:$R/bookOpen.ogg" "book-close:$R/bookClose.ogg" "leather-0:$R/handleSmallLeather.ogg" "leather-1:$R/handleSmallLeather2.ogg"
  "leather-drop:$R/dropLeather.ogg" "belt-0:$R/clothBelt.ogg" "belt-1:$R/clothBelt2.ogg" "metal-click:$R/metalClick.ogg"
  "ui-hover-0:$U/select_001.ogg" "ui-hover-1:$U/select_002.ogg" "ui-denied-0:$U/error_001.ogg" "ui-denied-1:$U/error_002.ogg")
printf '%-16s %-28s %8s %8s\n' name source original runtime
for m in "${MAP[@]}"; do
  name="${m%%:*}"; src="${m#*:}"
  trim="silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,atrim=0:1.6,afade=t=out:st=1.45:d=0.15"
  peak=$(ffmpeg -hide_banner -nostats -i "$src" -af "$trim,volumedetect" -ac 1 -f null - 2>&1 | sed -n 's/.*max_volume: \(-*[0-9.]*\) dB/\1/p')
  gain=$(python3 -c "print(round(-1 - float('${peak:-0}'), 2))")
  ffmpeg -hide_banner -loglevel error -y -i "$src" -af "$trim,volume=${gain}dB" -ac 1 -ar 44100 -c:a libmp3lame -b:a 64k "$OUT/$name.mp3"
  printf '%-16s %-28s %8s %8s\n' "$name" "$(basename "$src")" "$(stat -f%z "$src")" "$(stat -f%z "$OUT/$name.mp3")"
done

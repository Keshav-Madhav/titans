# Audio

Every recorded sound in the game, where it came from and how it was made ready. The rest of
the sound (the score, wind, rain, the giants, the horn, the bell, the hall's reverb) is synthesised
live in `client/src/audio.ts`; each recorded sound below also has a synthesised stand-in that plays
until the recordings have loaded.

## Sources

All three packs are by Kenney (www.kenney.nl), **CC0 1.0** (public domain; no attribution needed,
credited here anyway). Downloaded 2026-11-04 from kenney.nl/assets/impact-sounds, /rpg-audio and
/interface-sounds.

## Processing

`tools/build-sfx.sh <dir with the three packs unzipped>` writes `client/public/sfx/*.mp3`: silence
below -50 dBFS trimmed from both ends, at most 1.6 s (0.15 s fade), mono 44.1 kHz, peak-normalised
to -1 dBFS, MP3 64 kb/s. At play: a random take (never the same twice running), ±5% pitch, at most
20 recorded voices at once, one group no faster than every 45 ms.

## The sounds

| File | Pack | Source file | Original bytes | Runtime bytes | Used for |
| --- | --- | --- | ---: | ---: | --- |
| step-grass-0.mp3 | Impact Sounds | footstep_grass_000.ogg | 8290 | 1505 | footsteps on grass |
| step-stone-0.mp3 | Impact Sounds | footstep_concrete_000.ogg | 5808 | 1296 | footsteps on stone and the hall floor |
| step-snow-0.mp3 | Impact Sounds | footstep_snow_000.ogg | 7880 | 1923 | footsteps in the High Places' snow |
| step-soft-0.mp3 | Impact Sounds | footstep_carpet_000.ogg | 6353 | 1505 | footsteps in sand (pitched down) and mud (further down, with a synthesised suck) |
| ui-click-0.mp3 | Interface Sounds | click_001.ogg | 4876 | 669 | a button pressed (pause page) |
| step-grass-1.mp3 | Impact Sounds | footstep_grass_001.ogg | 8313 | 1714 | footsteps on grass |
| step-stone-1.mp3 | Impact Sounds | footstep_concrete_001.ogg | 6308 | 1505 | footsteps on stone and the hall floor |
| step-snow-1.mp3 | Impact Sounds | footstep_snow_001.ogg | 7794 | 1923 | footsteps in the High Places' snow |
| step-soft-1.mp3 | Impact Sounds | footstep_carpet_001.ogg | 6411 | 1714 | footsteps in sand (pitched down) and mud (further down, with a synthesised suck) |
| ui-click-1.mp3 | Interface Sounds | click_002.ogg | 4275 | 669 | a button pressed (pause page) |
| step-grass-2.mp3 | Impact Sounds | footstep_grass_002.ogg | 8278 | 1714 | footsteps on grass |
| step-stone-2.mp3 | Impact Sounds | footstep_concrete_002.ogg | 6255 | 1505 | footsteps on stone and the hall floor |
| step-snow-2.mp3 | Impact Sounds | footstep_snow_002.ogg | 7694 | 1923 | footsteps in the High Places' snow |
| step-soft-2.mp3 | Impact Sounds | footstep_carpet_002.ogg | 6411 | 1714 | footsteps in sand (pitched down) and mud (further down, with a synthesised suck) |
| ui-click-2.mp3 | Interface Sounds | click_003.ogg | 4371 | 669 | a button pressed (pause page) |
| step-grass-3.mp3 | Impact Sounds | footstep_grass_003.ogg | 8129 | 1296 | footsteps on grass |
| step-stone-3.mp3 | Impact Sounds | footstep_concrete_003.ogg | 5805 | 1505 | footsteps on stone and the hall floor |
| step-snow-3.mp3 | Impact Sounds | footstep_snow_003.ogg | 7860 | 1923 | footsteps in the High Places' snow |
| step-soft-3.mp3 | Impact Sounds | footstep_carpet_003.ogg | 6301 | 1087 | footsteps in sand (pitched down) and mud (further down, with a synthesised suck) |
| ui-click-3.mp3 | Interface Sounds | click_004.ogg | 4486 | 669 | a button pressed (pause page) |
| step-grass-4.mp3 | Impact Sounds | footstep_grass_004.ogg | 7800 | 1296 | footsteps on grass |
| step-stone-4.mp3 | Impact Sounds | footstep_concrete_004.ogg | 5912 | 1505 | footsteps on stone and the hall floor |
| step-snow-4.mp3 | Impact Sounds | footstep_snow_004.ogg | 7630 | 1923 | footsteps in the High Places' snow |
| step-soft-4.mp3 | Impact Sounds | footstep_carpet_004.ogg | 6301 | 1087 | footsteps in sand (pitched down) and mud (further down, with a synthesised suck) |
| ui-click-4.mp3 | Interface Sounds | click_005.ogg | 4410 | 669 | a button pressed (pause page) |
| land-heavy-0.mp3 | Impact Sounds | impactSoft_heavy_000.ogg | 6570 | 4640 | landing hard |
| land-soft-0.mp3 | Impact Sounds | impactSoft_medium_000.ogg | 5351 | 1505 | landing |
| page-0.mp3 | RPG Audio | bookFlip1.ogg | 18248 | 5476 | the map opening and closing; pages |
| book-place-0.mp3 | RPG Audio | bookPlace1.ogg | 9901 | 2132 | the pause page opening |
| land-heavy-1.mp3 | Impact Sounds | impactSoft_heavy_001.ogg | 6689 | 5058 | landing hard |
| land-soft-1.mp3 | Impact Sounds | impactSoft_medium_001.ogg | 5506 | 1923 | landing |
| page-1.mp3 | RPG Audio | bookFlip2.ogg | 12393 | 3386 | the map opening and closing; pages |
| book-place-1.mp3 | RPG Audio | bookPlace2.ogg | 11185 | 2341 | the pause page opening |
| land-heavy-2.mp3 | Impact Sounds | impactSoft_heavy_002.ogg | 6749 | 5058 | landing hard |
| land-soft-2.mp3 | Impact Sounds | impactSoft_medium_002.ogg | 5358 | 1714 | landing |
| page-2.mp3 | RPG Audio | bookFlip3.ogg | 9077 | 1923 | the map opening and closing; pages |
| book-place-2.mp3 | RPG Audio | bookPlace3.ogg | 9570 | 2132 | the pause page opening |
| cloth-0.mp3 | RPG Audio | cloth1.ogg | 16508 | 4640 | kneeling to take something; the cloak settling on landing; the pause closing |
| ui-toggle-0.mp3 | Interface Sounds | toggle_001.ogg | 7369 | 1296 | a toggle or choice (pause page) |
| cloth-1.mp3 | RPG Audio | cloth2.ogg | 11787 | 2968 | kneeling to take something; the cloak settling on landing; the pause closing |
| ui-toggle-1.mp3 | Interface Sounds | toggle_002.ogg | 8056 | 1296 | a toggle or choice (pause page) |
| cloth-2.mp3 | RPG Audio | cloth3.ogg | 12432 | 4222 | kneeling to take something; the cloak settling on landing; the pause closing |
| ui-toggle-2.mp3 | Interface Sounds | toggle_003.ogg | 8654 | 1296 | a toggle or choice (pause page) |
| cloth-3.mp3 | RPG Audio | cloth4.ogg | 11043 | 3177 | kneeling to take something; the cloak settling on landing; the pause closing |
| ui-toggle-3.mp3 | Interface Sounds | toggle_004.ogg | 6695 | 1087 | a toggle or choice (pause page) |
| book-open.mp3 | RPG Audio | bookOpen.ogg | 8273 | 1087 | the journal opening |
| book-close.mp3 | RPG Audio | bookClose.ogg | 9292 | 2132 | the journal closing |
| leather-0.mp3 | RPG Audio | handleSmallLeather.ogg | 10492 | 1714 | the bag opening; something going into it |
| leather-1.mp3 | RPG Audio | handleSmallLeather2.ogg | 10028 | 1505 | the bag opening; something going into it |
| leather-drop.mp3 | RPG Audio | dropLeather.ogg | 11695 | 2968 | the bag closing |
| belt-0.mp3 | RPG Audio | clothBelt.ogg | 21491 | 5894 | the bag's strap as it opens |
| belt-1.mp3 | RPG Audio | clothBelt2.ogg | 20013 | 4640 | the bag's strap as it opens |
| metal-click.mp3 | RPG Audio | metalClick.ogg | 13615 | 3177 | the grappling line biting |
| ui-hover-0.mp3 | Interface Sounds | select_001.ogg | 5468 | 878 | a button hovered (pause page) |
| ui-hover-1.mp3 | Interface Sounds | select_002.ogg | 5463 | 878 | a button hovered (pause page) |
| ui-denied-0.mp3 | Interface Sounds | error_001.ogg | 7373 | 1714 | a disabled button pressed |
| ui-denied-1.mp3 | Interface Sounds | error_002.ogg | 7369 | 1923 | a disabled button pressed |

57 files, 483,664 bytes as downloaded → 120,688 bytes shipped.

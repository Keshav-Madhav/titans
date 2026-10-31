# Terrain textures

CC0 (public domain) textures from [Poly Haven](https://polyhaven.com), packed by
`tools/pack-textures.py`: `<layer>_c.jpg` is colour, `<layer>_n.jpg` holds the normal's X and Y
(OpenGL convention) in R and G and the height map in B.

| Layer | Poly Haven asset |
| --- | --- |
| grass | leafy_grass |
| drygrass | withered_grass |
| forest | forest_leaves_04 |
| mud | brown_mud_leaves_01 |
| sand | sand_01 |
| redrock | cliff_side |
| rock | rock_face_03 |
| snow | snow_02 |

Generated with Gemini image models by `tools/gen-textures.py` (made seamless, normal and height
derived from luminance) — the colossi's surfaces:

| Layer | What |
| --- | --- |
| carved | megalithic stone blocks with worn glyphs (the Sentinel, the stair, the Undercroft) |
| relief | sandstone with a worn relief frieze (the colonnade) |
| bone | weathered bone (the Fallen's ribs and skull) |
| bark | giant tree bark |
| flagstone | paving with grass in the joints (the plaza, the stair's treads) |
| moss | thick moss (tops of stone) |
| basalt | dark stone (the floating monoliths, the sword) |

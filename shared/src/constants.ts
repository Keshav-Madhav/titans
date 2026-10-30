// World constants shared by client and server. Units are metres.

/** The one persistent world's seed. Changing it moves every mountain. */
export const WORLD_SEED = 20261030

/** Half-size of the playable core (8 km × 8 km). Terrain continues past it. */
export const WORLD_HALF = 4096

/** Delta tiles: DELTA_TILE metres square at 1 m resolution. */
export const DELTA_TILE = 64

export const WANDERER_HEIGHT = 1.8

/** A newly awakened Titan's height. Scale is a progression axis later. */
export const TITAN_HEIGHT = 120

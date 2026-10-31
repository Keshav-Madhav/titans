// World constants shared by client and server. Units are metres.

/** The one persistent world's seed. Changing it moves every mountain. */
export const WORLD_SEED = 20261030

/**
 * How much bigger the world is than its first layout (user, 2026-10-31: "it
 * feels overcrowded… make it much bigger, distance the giants a lot too").
 * Distances written in the first layout's metres are multiplied by it.
 */
export const SPREAD = 2.6

/** Half-size of the mapped world (~21 km across). Terrain continues past it. */
export const WORLD_HALF = Math.round(4096 * SPREAD)

/** Delta tiles: DELTA_TILE metres square at 1 m resolution. */
export const DELTA_TILE = 64

export const WANDERER_HEIGHT = 1.8

/** A newly awakened Titan's height. Scale is a progression axis later. */
export const TITAN_HEIGHT = 300

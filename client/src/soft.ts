// Soft layers (user, 2026-11-03: "the clouds/fogs are distinct plains/layers stacked so
// wherever those layers meet something, be it a giant or a wall… its very easily
// discernable"). The cloud deck's sheets, the cumulus puffs and the mist banks are flat
// cards; where one passes through a giant, a cliff or a pillar, the depth test cut it off
// in a hard straight line. Now the solid world is drawn first, its depth kept, and these
// layers are drawn after it (in their own scene) fading out as they near whatever stands
// behind them: a cloud wraps a giant's shoulders instead of slicing them.

import * as THREE from 'three'

export const soft = {
  tSoftDepth: { value: null as THREE.Texture | null },
  /** 1 when the depth is there to read (off with post-processing off). */
  uSoftOn: { value: 0 },
  uSoftNF: { value: new THREE.Vector2(0.15, 90000) },
  uSoftRes: { value: new THREE.Vector2(1, 1) },
}

/** The scene the soft layers live in (drawn after the main one, onto it). */
export const softScene = new THREE.Scene()
softScene.matrixWorldAutoUpdate = true

/** GLSL: `softFade(base, perM)`: 0 … 1, how much room there is behind this fragment (needs <packing>). */
export const SOFT_GLSL = /* glsl */ `
  uniform sampler2D tSoftDepth;
  uniform float uSoftOn;
  uniform vec2 uSoftNF;
  uniform vec2 uSoftRes;
  // (Softer far off: \`base\` metres, plus \`perM\` per metre away.)
  float softFade(float base, float perM) {
    if (uSoftOn < 0.5) return 1.0;
    float sd = texture2D(tSoftDepth, gl_FragCoord.xy / uSoftRes).r;
    float sceneZ = -perspectiveDepthToViewZ(sd, uSoftNF.x, uSoftNF.y);
    float fragZ = -perspectiveDepthToViewZ(gl_FragCoord.z, uSoftNF.x, uSoftNF.y);
    float t = clamp((sceneZ - fragZ) / (base + perM * fragZ), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }
`

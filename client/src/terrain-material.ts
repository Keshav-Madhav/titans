// The ground's look: eight CC0 texture layers (Poly Haven, packed by
// tools/pack-textures.py) in two texture arrays, splatted per vertex by land,
// slope and height (TerrainView writes the weights).
//
// - Height blending: where two layers meet, the taller texels of each win
//   (sand settles between stones instead of a soft cross-fade).
// - Cliffs (the two rock layers) are tri-planar, so steep faces never stretch.
// - Against tiling: a second, much larger sample of each colour fades in with
//   distance, and the procedural detail texture varies brightness at two
//   scales the textures do not repeat at.
// - From afar the Old Wood's floor takes on a mottled canopy colour (trees are
//   only drawn out to the vegetation's middle range).

import * as THREE from 'three'
import { TRAIL_GLSL, trailU } from './trail'
import { SHORE } from '@titans/shared'

/**
 * Layer order: matches tools/pack-textures.py. The first eight are splatted on
 * the ground (TerrainView writes their weights); the last are stonework.
 */
export const LAYERS = ['grass', 'drygrass', 'forest', 'mud', 'sand', 'redrock', 'rock', 'snow', 'carved', 'relief', 'bone', 'bark', 'flagstone', 'moss', 'basalt', 'hide'] as const
export type Layer = (typeof LAYERS)[number]
export const LAYER = Object.fromEntries(LAYERS.map((l, i) => [l, i])) as Record<Layer, number>

/** Metres per texture tile, up close. */
/** How much of each layer's own half-metre blotching is taken out (the ground layers; not sand's ripples or the rocks'). */
// grass, drygrass, forest, mud, sand, redrock, rock, snow, carved, relief, bone, bark, flagstone, moss, basalt, hide
const FLAT = [0.9, 0.9, 0.8, 0.7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0]
const SCALE = [3.2, 3.4, 2.8, 3.0, 6.0, 24.0, 9.0, 7.0, 10, 14, 8, 6, 6, 4, 10, 8]
/**
 * Art direction per layer: each texture's colour pulled toward the palette
 * (muted greens, pale warm sand, grey stone), as linear multipliers.
 */
const TINT = [
  [0.686, 1.223, 0.647], // grass: khaki → a muted green
  [0.982, 1.134, 0.777], // dry grass: straw
  [0.717, 0.937, 1.101], // forest floor
  [0.883, 1.052, 1.186], // mud
  [1.04, 0.98, 0.93], // sand (generated: rippled, already coloured; a touch paler)
  [1.45, 1.369, 1.496], // red rock
  [1.12, 1.38, 1.65], // rock: toward grey
  [2.139, 2.205, 2.246], // snow: brighter
  // Generated (gen-textures.py): already coloured; the relief and moss toned down.
  [1, 1, 1], // carved
  [0.92, 0.86, 0.74], // relief
  [1, 1, 1], // bone
  [1, 1, 1], // bark
  [1, 1, 1], // flagstone
  [0.72, 0.8, 0.66], // moss
  [1, 1, 1], // basalt
  [1, 1, 1], // hide (the giants)
]
/** Roughness per layer. */
const ROUGH = [0.92, 0.95, 0.95, 0.9, 0.97, 0.88, 0.86, 0.7, 0.9, 0.9, 0.8, 0.95, 0.9, 0.98, 0.85, 0.93]
const SIZE = 1024

export interface TerrainTextures {
  color: THREE.DataArrayTexture
  normal: THREE.DataArrayTexture
}

async function pixels(url: string, ctx: CanvasRenderingContext2D): Promise<Uint8ClampedArray> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`terrain texture ${url}: ${res.status}`)
  const bitmap = await createImageBitmap(await res.blob())
  ctx.drawImage(bitmap, 0, 0, SIZE, SIZE)
  bitmap.close()
  return ctx.getImageData(0, 0, SIZE, SIZE).data
}

/** Load every layer into two texture arrays (colour in sRGB; normal XY + height, linear). */
export async function loadTerrainTextures(renderer: THREE.WebGLRenderer, base = `${import.meta.env.BASE_URL}tex/`): Promise<TerrainTextures> {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const layer = SIZE * SIZE * 4
  const color = new Uint8Array(layer * LAYERS.length)
  const normal = new Uint8Array(layer * LAYERS.length)
  for (let i = 0; i < LAYERS.length; i++) {
    color.set(await pixels(`${base}${LAYERS[i]}_c.jpg`, ctx), i * layer)
    normal.set(await pixels(`${base}${LAYERS[i]}_n.jpg`, ctx), i * layer)
  }
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  const make = (data: Uint8Array, srgb: boolean) => {
    const t = new THREE.DataArrayTexture(data, SIZE, SIZE, LAYERS.length)
    t.format = THREE.RGBAFormat
    t.type = THREE.UnsignedByteType
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.generateMipmaps = true
    t.minFilter = THREE.LinearMipmapLinearFilter
    t.magFilter = THREE.LinearFilter
    t.anisotropy = aniso
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
    t.needsUpdate = true
    return t
  }
  return { color: make(color, true), normal: make(normal, false) }
}

const list = (a: number[]) => a.map((v) => v.toFixed(3)).join(', ')

/**
 * Cloud shadows on the ground (scale: shadows a kilometre across sliding over
 * the plains): x, z the drift (metres), z of the vector the cover threshold,
 * w the strength (0 under a full overcast — no sun to cast them). weather.ts sets it.
 */
export const groundShade = { value: new THREE.Vector4(0, 0, 0.6, 0) }
/**
 * 0 by day … 1 at full night (weather.ts): the sand's albedo goes down at night. (A night tour,
 * 2026-11-19: under the same moon the Dune Sea's sand came out 2.5× the brightness of every other
 * land's ground — it read as dusk beside a black forest. Moonlit sand stays the brightest ground,
 * at about 1.7×.)
 */
export const sandNight = { value: 0 }

/** The ground material: MeshStandardMaterial with the splat patched in. */
/** Tools: switches for measuring the terrain shader's parts (uTerrainExp). */
export const terrainExp = { u: { value: 0 } }

export function makeTerrainMaterial(tex: TerrainTextures, detail: THREE.Texture): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tLayerColor = { value: tex.color }
    shader.uniforms.tLayerNormal = { value: tex.normal }
    shader.uniforms.tDetail = { value: detail }
    shader.uniforms.uTerrainExp = terrainExp.u
    Object.assign(shader.uniforms, trailU)
    shader.uniforms.groundShade = groundShade
    shader.uniforms.uSandNight = sandNight
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 aSplatA;
        attribute vec4 aSplatB;
        varying vec4 vSplatA;
        varying vec4 vSplatB;
        varying vec3 vGroundPos;
        varying vec3 vGroundRel;
        varying vec3 vGroundN;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vSplatA = aSplatA;
        vSplatB = aSplatB;
        vGroundPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vGroundRel = vGroundPos - cameraPosition;
        vGroundN = normalize(mat3(modelMatrix) * objectNormal);`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform highp sampler2DArray tLayerColor;
        uniform highp sampler2DArray tLayerNormal;
        uniform sampler2D tDetail;
        uniform vec4 groundShade;
        uniform float uSandNight;
        varying vec4 vSplatA;
        varying vec4 vSplatB;
        varying vec3 vGroundPos;
        varying vec3 vGroundRel;
        varying vec3 vGroundN;
        const float LSCALE[${LAYERS.length}] = float[${LAYERS.length}](${list(SCALE)});
        const float LROUGH[${LAYERS.length}] = float[${LAYERS.length}](${list(ROUGH)});
        const float LFLAT[${LAYERS.length}] = float[${LAYERS.length}](${list(FLAT)});
        const vec3 LTINT[${LAYERS.length}] = vec3[${LAYERS.length}](${TINT.map((t) => `vec3(${list(t)})`).join(', ')});

        // A tangent-space normal from the packed texel (Y flipped: the arrays are
        // uploaded top row first, so the image's "up" is -v).
        #define T_NRM_R 650.0
        // Experiments (tools): bit 1 only the two strongest layers, 2 no anti-tiling second sample,
        // 4 no normal maps, 8 fetch even the layers that cannot show (to measure the cut), 16 no close-up
        // grain on cliffs.
        uniform int uTerrainExp;
        ${TRAIL_GLSL}
        // Value noise that never repeats (a hash without sin(): see post.ts).
        float tHash(vec2 p) { p = mod(p, 4096.0); vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float tVNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), f.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        vec3 unpackN(vec4 t) {
          vec2 xy = t.rg * 2.0 - 1.0;
          xy.y = -xy.y;
          return vec3(xy, sqrt(max(0.0, 1.0 - dot(xy, xy))));
        }

        // One layer, projected from above (with a far sample against tiling).
        void topLayer(int i, vec3 p, vec3 dpx, vec3 dpy, vec3 N, float farT, out vec3 col, out vec3 nrm, out float hgt) {
          float s = 1.0 / LSCALE[i];
          vec2 uv = p.xz * s;
          vec4 c = textureGrad(tLayerColor, vec3(uv, float(i)), dpx.xz * s, dpy.xz * s);
          // (The ground layers' blotches flattened out: a photo tile has its own patches half a metre
          // across — the grass a dark bare one — and at a 3 m repeat they lay over every meadow as a
          // regular lattice of dark dots, from a walk and from the air alike (the user's flyover,
          // 2026-11-08). The tile's own blur taken off and its mean put back: the fine leaf and blade
          // stay, the patches go; the land's own large shading is the variation.)
          if (LFLAT[i] > 0.0) {
            vec3 blot = textureLod(tLayerColor, vec3(uv, float(i)), 6.5).rgb;
            vec3 mean = textureLod(tLayerColor, vec3(uv, float(i)), 10.0).rgb;
            c.rgb = max(c.rgb + (mean - blot) * LFLAT[i], vec3(0.0));
          }
          // (Past ~650 m the relief is faded out to the surface normal anyway (gNorm, below): no
          // fetch for it — optimisation pass, 2026-11-04: the terrain was 3.1 of ~8 ms.)
          vec4 n = (distance(p, cameraPosition) < T_NRM_R && (uTerrainExp & 4) == 0) ? textureGrad(tLayerNormal, vec3(uv, float(i)), dpx.xz * s, dpy.xz * s) : vec4(0.5, 0.5, 0.5, 1.0);
          // (And the same for its relief: the grass normal map's half-metre bumps, repeating every 3 m and
          // caught by a low sun, WERE the lattice of dark dots over the meadows (bisected: gone with the
          // normal maps off). The tile's own broad slopes taken off; the fine relief stays.)
          if (LFLAT[i] > 0.0 && n.a > 0.0 && distance(p, cameraPosition) < T_NRM_R && (uTerrainExp & 4) == 0) {
            // (.b too: the height the layers blend by — mud showed through in the grass height map's
            // low spots, the same 3 m lattice, red-brown.)
            vec3 nBlot = textureLod(tLayerNormal, vec3(uv, float(i)), 6.5).rgb;
            vec3 nMean = textureLod(tLayerNormal, vec3(uv, float(i)), 10.0).rgb;
            n.rgb += (nMean - nBlot) * LFLAT[i];
          }
          if (farT > 0.0 && (uTerrainExp & 2) == 0) {
            float s2 = s * 0.19;
            vec2 uv2 = mat2(0.8, -0.6, 0.6, 0.8) * p.xz * s2 + 0.37;
            vec4 c2 = textureGrad(tLayerColor, vec3(uv2, float(i)), dpx.xz * s2, dpy.xz * s2);
            c.rgb = mix(c.rgb, c2.rgb, farT * 0.6);
          }
          col = c.rgb;
          vec3 t = unpackN(n);
          // Whiteout blend onto the surface normal (Y projection).
          vec3 b = vec3(t.xy + N.xz, abs(t.z) * N.y);
          nrm = normalize(b.xzy);
          hgt = n.b;
        }

        // One layer, tri-planar (cliffs).
        // N: which way to project (the wall's facing); S: the smooth normal the relief sits on.
        void triLayer(int i, vec3 p, vec3 dpx, vec3 dpy, vec3 N, vec3 S, out vec3 col, out vec3 nrm, out float hgt) {
          float s = 1.0 / LSCALE[i];
          vec3 w = pow(abs(N), vec3(4.0));
          w /= (w.x + w.y + w.z);
          // (An axis carrying under 3% is left out — most walls are lit by one or two — and the
          // rest renormalised. Optimisation pass, 2026-11-04: a cliff layer was 13 fetches always.)
          w *= step(0.03, w);
          w /= max(1e-4, w.x + w.y + w.z);
          float L = float(i);
          float dist = distance(p, cameraPosition);
          // (Far off, a softer mip: past a few hundred metres the rock's tile repeated as an even dot
          // grid over whole mountainsides — the ring of peaks round the High Places read as quilted,
          // the playtest. The shape and the light carry far walls, not the grain.)
          float blurK = 1.0 + 5.0 * smoothstep(300.0, 2500.0, dist);
          dpx *= blurK;
          dpy *= blurK;
          bool wantN = dist < T_NRM_R;
          float s2 = s * 0.41;
          vec3 o = vec3(0.37, 0.61, 0.13);
          float m = smoothstep(0.3, 0.7, texture2D(tDetail, p.xz * 0.009 + p.y * 0.006).r);
          // (Farther off, mostly the larger: from a couple of hundred metres the small tile's
          // repeat was what read as the quilting.)
          float k2 = max(0.25 + 0.5 * m, 0.88 * smoothstep(30.0, 160.0, dist));
          // Past ~160 m the larger look is 88% of it: the small one is not fetched at all.
          bool base = k2 < 0.86 && T_NRM_R > 1.0;
          vec4 flatN = vec4(0.5, 0.5, 0.5, 1.0);
          vec3 c1 = vec3(0.0);
          vec3 c2 = vec3(0.0);
          vec4 nx = flatN; vec4 ny = flatN; vec4 nz = flatN;
          // A second look at the same rock, at an unrelated scale and offset, mixed in by a slow
          // noise: a wall tens of metres high showed the texture's repeat as a quilted grid.
          if (w.x > 0.0) {
            vec2 u1 = p.zy * s; vec2 u2 = (p.zy + o.zy * 40.0) * s2;
            c2 += textureGrad(tLayerColor, vec3(u2, L), dpx.zy * s2, dpy.zy * s2).rgb * w.x;
            vec4 n2 = wantN ? textureGrad(tLayerNormal, vec3(u2, L), dpx.zy * s2, dpy.zy * s2) : flatN;
            if (base) {
              c1 += textureGrad(tLayerColor, vec3(u1, L), dpx.zy * s, dpy.zy * s).rgb * w.x;
              nx = mix(wantN ? textureGrad(tLayerNormal, vec3(u1, L), dpx.zy * s, dpy.zy * s) : flatN, n2, k2);
            } else nx = n2;
          }
          if (w.y > 0.0) {
            vec2 u1 = p.xz * s; vec2 u2 = (p.xz + o.xz * 40.0) * s2;
            c2 += textureGrad(tLayerColor, vec3(u2, L), dpx.xz * s2, dpy.xz * s2).rgb * w.y;
            vec4 n2 = wantN ? textureGrad(tLayerNormal, vec3(u2, L), dpx.xz * s2, dpy.xz * s2) : flatN;
            if (base) {
              c1 += textureGrad(tLayerColor, vec3(u1, L), dpx.xz * s, dpy.xz * s).rgb * w.y;
              ny = mix(wantN ? textureGrad(tLayerNormal, vec3(u1, L), dpx.xz * s, dpy.xz * s) : flatN, n2, k2);
            } else ny = n2;
          }
          if (w.z > 0.0) {
            vec2 u1 = p.xy * s; vec2 u2 = (p.xy + o.xy * 40.0) * s2;
            c2 += textureGrad(tLayerColor, vec3(u2, L), dpx.xy * s2, dpy.xy * s2).rgb * w.z;
            vec4 n2 = wantN ? textureGrad(tLayerNormal, vec3(u2, L), dpx.xy * s2, dpy.xy * s2) : flatN;
            if (base) {
              c1 += textureGrad(tLayerColor, vec3(u1, L), dpx.xy * s, dpy.xy * s).rgb * w.z;
              nz = mix(wantN ? textureGrad(tLayerNormal, vec3(u1, L), dpx.xy * s, dpy.xy * s) : flatN, n2, k2);
            } else nz = n2;
          }
          col = base ? mix(c1, c2, k2) : c2;
          // Close up, a fine grain on the main face (QA cycle 7: a red cliff's 24 m tile is ~43 texels
          // a metre, and a climber's camera 8 m off it shows ~150 pixels a metre — the rock round you
          // was a soft smear). The same layer 8× smaller, only its fine detail (minus a blurred copy
          // of itself, so the colour does not shift), and its relief; fading out by 45 m.
          if (dist < 45.0 && (uTerrainExp & 16) == 0) {
            float fk = 1.0 - smoothstep(18.0, 45.0, dist);
            float sF = s * 8.0;
            vec2 uf; vec2 gx; vec2 gy;
            if (w.x >= w.y && w.x >= w.z) { uf = p.zy * sF; gx = dpx.zy * sF; gy = dpy.zy * sF; }
            else if (w.y >= w.z) { uf = p.xz * sF; gx = dpx.xz * sF; gy = dpy.xz * sF; }
            else { uf = p.xy * sF; gx = dpx.xy * sF; gy = dpy.xy * sF; }
            uf += 0.53;
            vec3 fc = textureGrad(tLayerColor, vec3(uf, L), gx, gy).rgb;
            vec3 fb = textureGrad(tLayerColor, vec3(uf, L), gx * 8.0, gy * 8.0).rgb;
            col = max(col + (fc - fb) * fk * 0.9, vec3(0.0));
            if (wantN) {
              vec4 fn = textureGrad(tLayerNormal, vec3(uf, L), gx, gy);
              float nk = fk * 0.55;
              if (w.x >= w.y && w.x >= w.z) nx = mix(nx, fn, nk);
              else if (w.y >= w.z) ny = mix(ny, fn, nk);
              else nz = mix(nz, fn, nk);
            }
          }
          vec3 tx = unpackN(nx);
          vec3 ty = unpackN(ny);
          vec3 tz = unpackN(nz);
          tx = vec3(tx.xy + S.zy, abs(tx.z) * S.x);
          ty = vec3(ty.xy + S.xz, abs(ty.z) * S.y);
          tz = vec3(tz.xy + S.xy, abs(tz.z) * S.z);
          nrm = normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z);
          hgt = nx.b * w.x + ny.b * w.y + nz.b * w.z;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `
        // --- the splat -------------------------------------------------------
        vec3 gN = normalize(vGroundN);
        vec3 gP = vGroundPos;
        // (The screen derivatives from the position relative to the camera, a few metres, not the world
        // position: ~10 km out, in the High Places, a float steps ~1 mm, and with the ground half a metre
        // from the lens neighbouring pixels are closer than that — the derivatives came out quantised, the
        // facet normal from them pointed anywhere, random pixels were judged cliff and drawn as rock: the
        // dark speckle over the near snow, the playtest, 2026-11-08; found 2026-11-17.)
        vec3 gDx = dFdx(vGroundRel);
        vec3 gDy = dFdy(vGroundRel);
        float gDist = distance(gP, cameraPosition);
        float gFar = smoothstep(25.0, 160.0, gDist);
        float gW[8] = float[8](vSplatA.x, vSplatA.y, vSplatA.z, vSplatA.w, vSplatB.x, vSplatB.y, vSplatB.z, vSplatB.w);
        // Steep is rock, decided here per pixel from the surface itself, not from
        // the (coarser, smoother) vertex weights: grass and sand projected from
        // above stretch into streaks and pale teeth down a cliff.
        // The triangle's own slope (from screen derivatives), not only the smooth
        // vertex normal: a triangle spanning a cliff's foot is steep all over,
        // where the interpolated normal would leave a pale tooth of sand or grass.
        // (Guarded: a degenerate pixel's zero cross product would normalise to NaN.)
        vec3 gFlatC = cross(gDx, gDy);
        float gFlatL = length(gFlatC);
        vec3 gFlat = gFlatL > 1e-12 ? gFlatC / gFlatL : gN;
        // (Smooth, so the projection does not jump at every triangle edge.)
        // (In the desert, sand holds to a much steeper face: a dune's slip face is sand, and the red
        // strata belong to the mesas' near-vertical walls — the tour, 2026-11-07, found whole dune
        // faces painted as red cliff, sawtoothed where they met the sand.)
        float gSteep = 1.0 - smoothstep(mix(0.58, 0.24, vColor.b), mix(0.8, 0.42, vColor.b), min(gN.y, abs(gFlat.y) + 0.06));
        // The facing on steep ground comes from the triangle (the smoothed normal can
        // still point up on a wall at coarse detail); only its horizontal part, so the
        // projection turns smoothly round a cliff instead of jumping at each edge.
        vec2 gHor = gFlat.xz * sign(gFlat.y + 1e-4);
        // (Turned to the wall's facing well before the rock fully shows: half-way, the top-down
        // projection still carried real weight on a near-vertical face and smeared its texture down
        // it in streaks — a furry dark fringe along every cliff's foot, tour review 2026-11-08.)
        vec3 gTriN = normalize(mix(gN, vec3(gHor.x, 0.12, gHor.y) / max(1e-3, length(gHor)), min(1.0, gSteep * 3.0) * 0.92));
        // (Written out per layer — every array index a constant — not looped: indexed by a variable,
        // the per-layer arrays went to memory on Apple GPUs for every pixel; trimming the work
        // inside the loop saved nothing, and the terrain was 10 of 22 ms. Optimisation pass, 2026-11-04.)
        if (gSteep > 0.0) {
          ${[0,1,2,3,4,7].map(i => `gW[${i}] *= 1.0 - gSteep;`).join(' ')}
          gW[5] += gSteep * vColor.b;
          gW[6] += gSteep * (1.0 - vColor.b);
        }
        float gTop = -10.0;
        // (Experiment 1: only the two strongest layers.)
        float gW1 = 0.0; float gW2 = 0.0;
        if ((uTerrainExp & 1) != 0) {
          ${[0,1,2,3,4,5,6,7].map(i => `if (gW[${i}] > gW1) { gW2 = gW1; gW1 = gW[${i}]; } else if (gW[${i}] > gW2) gW2 = gW[${i}];`).join('\n          ')}
        }
        // A layer shows only within 0.18 of the top of the height blend, and its texture lifts it at
        // most 0.55 (gH = h·0.55 + w): one more than 0.73 under the strongest can never show, so it
        // is not fetched. The same image, fewer fetches where one ground dominates — most of it.
        float gWMax = max(max(max(gW[0], gW[1]), max(gW[2], gW[3])), max(max(gW[4], gW[5]), max(gW[6], gW[7])));
        float gCut = max(max(0.004, (uTerrainExp & 8) != 0 ? 0.0 : gWMax - 0.73), gW2 - 1e-4);
        ${[0,1,2,3,4,5,6,7].map(i => `vec3 gCol${i} = vec3(0.0); vec3 gNrm${i} = vec3(0.0, 1.0, 0.0); float gH${i} = -10.0;
        if (gW[${i}] >= gCut) {
          vec3 c; vec3 n; float h;
          ${i === 5 || i === 6 ? `triLayer(${i}, gP, gDx, gDy, gTriN, gN, c, n, h);` : `topLayer(${i}, gP, gDx, gDy, gN, gFar, c, n, h);`}
          gCol${i} = c * LTINT[${i}];
          gNrm${i} = n;
          // (Sand's own relief is its ripples: lifted by them in the height blend, at a dune's grassy edge the
          // sand won on every crest and the grass in every trough, and the hill came out as green ripples —
          // tour 41, (2598, 2100). Lifted by the ripples' mean instead, barely by the ripples: it keeps its share,
          // and the edge goes in the grass's own patches. Not lifted at all, the sand lost every edge to grass.)
          gH${i} = ${i === LAYER.sand ? 'h * 0.1 + 0.25' : 'h * 0.55'} + gW[${i}];
          gTop = max(gTop, gH${i});
        }`).join('\n        ')}
        vec3 gAlb = vec3(0.0);
        vec3 gNorm = vec3(0.0);
        float gRough = 0.0;
        float gSum = 0.0;
        ${[0,1,2,3,4,5,6,7].map(i => `if (gH${i} > -5.0) { float b = max(gH${i} - gTop + 0.18, 0.0); gAlb += gCol${i} * b; gNorm += gNrm${i} * b; gRough += LROUGH[${i}] * b; gSum += b; }`).join('\n        ')}
        gAlb = gSum > 1e-4 ? gAlb / gSum : vec3(0.3, 0.29, 0.27);
        // (Tools, bits 256/512: the snow layer alone / its blend weight as grey.)
        if ((uTerrainExp & 256) != 0 && gH7 > -5.0) gAlb = gCol7;
        // Cliffs in strata: bands lighter and darker, thick and thin together,
        // dipping and wandering across a wall (evenly ruled stripes read as a
        // layer cake, not as rock laid down over ages).
        float gRockW = (gW[5] + gW[6]) / max(1e-4, gW[0] + gW[1] + gW[2] + gW[3] + gW[4] + gW[5] + gW[6] + gW[7]);
        // (Every detail below is fetched only where it shows — optimisation pass, 2026-11-04: on a
        // MacBook-sized window the terrain was 10 of 23 ms, most pixels fetching cliff strata,
        // canopy and far-grass patterns multiplied by zero.)
        if (gRockW > 0.01) {
          float gDip = (texture2D(tDetail, gP.xz * 0.0006).r - 0.5) * 2.4 + (texture2D(tDetail, gP.xz * 0.0041 + 0.3).r - 0.5) * 0.5;
          float gBandThin = texture2D(tDetail, vec2(gP.y * 0.021 + gDip, 0.37)).r;
          float gBandThick = texture2D(tDetail, vec2(gP.y * 0.0047 + gDip * 0.6 + 0.2, 0.61)).r;
          float gBand = mix(gBandThin, gBandThick, 0.55);
          gAlb *= mix(1.0, 0.74 + 0.46 * gBand, gRockW * 0.8);
        }
        // The Steps' cut walls are dressed stone, not raw cliff (QA cycle 7: up close the terrace
        // risers read as poured concrete). The Steps' weight rides in vColor.r below zero (above
        // zero is the Old Wood's; the two lands never meet). Fetched only on the Steps' steep ground.
        float gMason = max(-vColor.r, 0.0) * gRockW;
        if (gMason > 0.02) {
          // (Every terrace wall the same dressed stone at the same scale read as one tiled texture —
          // sandbox, developer-mode (the user, 2026-11-08, a view over the Steps). Now: each stretch of
          // wall one of two scales and offsets of the courses; the facing fallen away in patches to the raw
          // rock behind; water-stain streaks down the face; moss at its foot and its lip; and a broad
          // warm/cool drift of colour across the terraces.)
          // (Two fixed looks crossfaded, not one look whose scale and offset drift with a noise: the
          // drift, times the world position — hundreds of metres up a wall — sheared the courses into
          // dense near-vertical lines, every Steps wall streaked like wood grain (tour, 2026-11-17).)
          float wCell = smoothstep(0.42, 0.58, texture2D(tDetail, gP.xz * 0.0021 + 0.17).r);
          vec3 mc = vec3(0.0); vec3 mn = vec3(0.0); float mh;
          if (wCell < 0.99) {
            vec3 c; vec3 n;
            triLayer(${LAYERS.indexOf('flagstone')}, gP * 0.82 + vec3(37.0, 5.0, 91.0), gDx * 0.82, gDy * 0.82, gTriN, gN, c, n, mh);
            mc += c * (1.0 - wCell); mn += n * (1.0 - wCell);
          }
          if (wCell > 0.01) {
            vec3 c; vec3 n;
            triLayer(${LAYERS.indexOf('flagstone')}, gP * 1.21 + vec3(113.0, 9.0, 23.0), gDx * 1.21, gDy * 1.21, gTriN, gN, c, n, mh);
            mc += c * wCell; mn += n * wCell;
          }
          mn = normalize(mn);
          // Where the facing has fallen: big ragged patches (a slow noise along the wall and up it).
          float fallen = texture2D(tDetail, vec2(gP.x * 0.006 + gP.z * 0.006, gP.y * 0.011) + 0.41).r;
          fallen = smoothstep(0.58, 0.72, fallen + 0.12 * (texture2D(tDetail, gP.xz * 0.05 + gP.y * 0.03).r - 0.5));
          // (And from afar the courses give way to the rock's own grain: past a couple of hundred metres
          // the block grid was what read as a tiled texture across every wall in view.)
          float mk = smoothstep(0.02, 0.45, gMason) * (1.0 - fallen) * (1.0 - 0.7 * smoothstep(140.0, 700.0, gDist));
          vec3 stone = mc * mix(vec3(0.97, 0.92, 0.84), vec3(0.86, 0.9, 0.93), smoothstep(0.3, 0.7, texture2D(tDetail, gP.xz * 0.0013 + 0.6).r));
          gAlb = mix(gAlb, stone, mk * 0.9);
          gNorm = mix(gNorm, mn, mk);
          // Weathering on the whole wall, facing or rock: streaks where the rain runs down it...
          float streakN = texture2D(tDetail, vec2((gP.x + gP.z) * 0.09, gP.y * 0.0035) + 0.27).r;
          float streakK = smoothstep(0.55, 0.85, streakN) * smoothstep(0.02, 0.3, gMason);
          gAlb *= 1.0 - 0.28 * streakK;
          // ...and moss where it holds: at the wall's foot (near the land under it) and on its lip.
          float mossN = texture2D(tDetail, gP.xz * 0.07 + gP.y * 0.05).r;
          float lip = smoothstep(0.75, 0.95, gN.y + 0.25);
          float moss = smoothstep(0.45, 0.75, mossN) * max(lip, 0.35 * (1.0 - smoothstep(0.0, 0.25, gSteep))) * smoothstep(0.02, 0.3, gMason);
          gAlb = mix(gAlb, gAlb * vec3(0.62, 0.78, 0.48), moss * 0.6);
          // A broad, slow drift of light and dark along the walls and up them (the ground's own
          // variation runs over x and z only, and on a wall it is one value all the way up).
          float wallDrift = texture2D(tDetail, vec2((gP.x - gP.z) * 0.0031, gP.y * 0.0052) + 0.73).r;
          gAlb *= mix(1.0, 0.72 + 0.56 * wallDrift, smoothstep(0.02, 0.3, gMason));
        }
        gNorm = normalize(gNorm + gN * 1e-3);
        if ((uTerrainExp & 128) != 0) gNorm = gN;
        gRough = gSum > 1e-4 ? gRough / gSum : 0.9;
        // Far away, the normal detail would only shimmer.
        gNorm = normalize(mix(gNorm, gN, smoothstep(120.0, 600.0, gDist)));

        // Brightness varying at scales the textures do not repeat at.
        float gd2 = texture2D(tDetail, gP.xz * 0.031).r;
        float gd3 = texture2D(tDetail, gP.xz * 0.0047).r;
        gAlb *= (0.84 + 0.32 * gd2) * (0.86 + 0.28 * gd3);

        // Your trail (trail.ts): a path worn in where you often walk — trodden earth through the
        // grass, paler and warmer; not on rock.
        {
          float tw = trailAt(gP.xz).y * (1.0 - gRockW);
          // (Not on snow, the earth: walked snow is packed snow, a little greyer and smoother. Trodden
          // earth's fine mottle over the High Places' snow came out as dark green-brown specks thick
          // over everywhere you had walked — the playtest, sliding the snowfields.)
          float twSnow = smoothstep(0.3, 0.7, gW[7]);
          // (Toward trodden earth itself, mottled: a tint of the grass read as nothing at all.)
          if (tw > 0.004) gAlb = mix(gAlb, mix(vec3(0.30, 0.25, 0.17) * (0.8 + 0.4 * texture2D(tDetail, gP.xz * 0.6).r), gAlb * vec3(0.86, 0.89, 0.93), twSnow), smoothstep(0.05, 0.85, tw) * mix(0.75, 0.5, twSnow));
        }
        // The Old Wood from afar: a mottled canopy where the trees stop being drawn.
        // Cliffs differ by land: mossy and dark in the Old Wood, pale grey elsewhere (red in the dunes).
        gAlb = mix(gAlb, gAlb * vec3(0.66, 0.78, 0.62), gRockW * max(vColor.r, 0.0) * (1.0 - vColor.b));
        // Big, slow variation over open ground — greener and yellower swathes,
        // darker hollows — so a plain never reads as one flat sheet from afar.
        float gM1 = texture2D(tDetail, gP.xz * 0.0011).r;
        float gM2 = texture2D(tDetail, gP.xz * 0.0031 + 0.5).r;
        vec3 gWarm = gAlb * vec3(1.12, 1.04, 0.82);
        vec3 gCool = gAlb * vec3(0.86, 1.0, 0.92);
        // (Not over the snow: the greener and yellower swathes tinted snowfields green.)
        gAlb = mix(gAlb, mix(gCool, gWarm, gM1), (1.0 - gRockW) * 0.7 * (1.0 - smoothstep(0.3, 0.7, gW[7])));
        gAlb *= 0.88 + 0.24 * gM2;
        float gCanopy = max(vColor.r, 0.0) * (1.0 - gRockW) * smoothstep(380.0, 760.0, gDist);
        if (gCanopy > 0.004) {
          float gCrowns = texture2D(tDetail, gP.xz * 0.06).r;
          gAlb = mix(gAlb, mix(vec3(0.040, 0.052, 0.024), vec3(0.085, 0.098, 0.045), gCrowns), gCanopy);
        }
        // Grassland reads as the grass cards do, near and far (user: "grass rendering in chunks,
        // very close"): where the cards stop, the bare ground beyond was ~10% lighter and bluer
        // than the field of blades, a hard edge round you. Toned toward the cards' average.
        {
          float gGrass = (gW[0] + gW[1]) / max(1e-4, gW[0] + gW[1] + gW[2] + gW[3] + gW[4] + gW[5] + gW[6] + gW[7]);
          gAlb *= mix(vec3(1.0), vec3(0.9, 0.91, 0.78), gGrass * (1.0 - gRockW));
          // Far grass: where the blades stop (30–70 m) the ground takes on their broken light and
          // shade, so the field goes on past them instead of turning to smooth felt; it fades out
          // again where it would only shimmer.
          float gFarG = smoothstep(30.0, 70.0, gDist) * (1.0 - smoothstep(260.0, 520.0, gDist));
          float gFarGK = gGrass * (1.0 - gRockW) * gFarG;
          if (gFarGK > 0.004) {
            // (Value noise, not the detail texture: that repeats every 1.9 m at this scale, and from any
            // height the repeat lay over every meadow as a regular lattice of dark dots — the user's
            // flyover, 2026-11-08. The fine octave fades before it would alias.)
            float gFine = 1.0 - smoothstep(90.0, 220.0, gDist);
            float gBlade = 0.5 + 0.3 * ((tVNoise(gP.xz * 1.1) - 0.5) * 0.55 * gFine + (tVNoise(gP.xz * 0.31 + 17.0) - 0.5) * (0.45 + 0.55 * (1.0 - gFine)));
            gAlb *= mix(1.0, 0.78 + 0.4 * gBlade, gFarGK);
          }
          // …and their colour, at a scale that still reads from a crest: the blades are tinted per
          // clump from green to straw, so past them the slopes were smooth pastel lawn (CHECKLIST
          // P3, "the edge still shows from a height"). Straw clumps a few metres across, wider
          // drier swathes, darker gaps between — faded in where the blades thin out, kept far.
          // (Big enough to survive the mipmaps: at 50–900 m a pattern a few metres across is averaged
          // to flat grey before it reaches the screen — the first try changed 3/255.)
          float gFar2 = gGrass * (1.0 - gRockW) * smoothstep(40.0, 95.0, gDist) * (1.0 - smoothstep(900.0, 1600.0, gDist));
          if (gFar2 > 0.004) {
          float gClump = texture2D(tDetail, gP.xz * 0.045 + 0.37).r;
          float gSwath = texture2D(tDetail, gP.xz * 0.009 + 0.71).r;
          // (The detail texture lives in a narrow mid-grey band: thresholds round its middle, or the
          // pattern came out all one value — measured: 3/255 of change on the first try.)
          float gStraw = smoothstep(0.44, 0.58, gClump * 0.5 + gSwath * 0.5);
          gAlb = mix(gAlb, gAlb * mix(vec3(0.74, 0.8, 0.78), vec3(1.24, 1.1, 0.66), gStraw), gFar2 * 0.85);
          }
        }
        // Sand at night: down toward half its albedo (uSandNight above).
        if (uSandNight > 0.001) {
          float nSandK = gW[4] / max(1e-4, gW[0] + gW[1] + gW[2] + gW[3] + gW[4] + gW[5] + gW[6] + gW[7]) * (1.0 - gRockW);
          gAlb *= 1.0 - 0.5 * uSandNight * nSandK;
        }
        // The Shore: sand the sea reaches is wet, darker, a band above the waterline.
        {
          float sAng = abs(atan(gP.x, gP.z));
          float sSec = 1.0 - smoothstep(${(SHORE.half * 0.75).toFixed(3)}, ${(SHORE.half * 1.25).toFixed(3)}, sAng);
          float sWet = sSec * step(${(SHORE.coast - 1500).toFixed(1)}, length(gP.xz)) * (1.0 - smoothstep(${(SHORE.sea + 0.3).toFixed(2)}, ${(SHORE.sea + 2.4).toFixed(2)}, gP.y));
          gAlb *= mix(1.0, 0.6, sWet);
          gRough = mix(gRough, 0.45, sWet);
        }
        // Snow that reads as snow (graphics pass, 2026-11-04: the High Places' field was a flat white
        // plane with dark crust lines like dirt). Wind-carved ridges (sastrugi) stretched across one
        // wind, a few metres apart, as relief that catches the sun; bluer in their hollows; the crust
        // lines lifted toward white. Glitter near you, below (emissive).
        float gSnowK = gW[7] / max(1e-4, gW[0] + gW[1] + gW[2] + gW[3] + gW[4] + gW[5] + gW[6] + gW[7]) * (1.0 - gRockW);
        if (gSnowK > 0.01) {
          vec2 sWd = normalize(vec2(0.8, 0.6));
          vec2 sQ = vec2(dot(gP.xz, sWd), dot(gP.xz, vec2(-sWd.y, sWd.x)));
          // (Ridges metres long, a couple of metres apart: the noise has many features to a tile, so the
          // first scale — 0.21 / 0.05 — made fine zebra stripes.)
          vec2 sU = vec2(sQ.x * 0.035, sQ.y * 0.0085);
          float sR0 = texture2D(tDetail, sU).r;
          float sRx = texture2D(tDetail, sU + vec2(0.004, 0.0)).r;
          float sRy = texture2D(tDetail, sU + vec2(0.0, 0.004)).r;
          float sNear = 1.0 - smoothstep(80.0, 320.0, gDist);
          vec2 sG = vec2((sRx - sR0) / 0.004 * 0.035, (sRy - sR0) / 0.004 * 0.0085);
          vec2 sGw = sWd * sG.x + vec2(-sWd.y, sWd.x) * sG.y;
          gNorm = normalize(gNorm + vec3(-sGw.x, 0.0, -sGw.y) * 4.0 * gSnowK * sNear);
          float sCrest = smoothstep(0.4, 0.62, sR0);
          vec3 sAlb = mix(gAlb, vec3(0.9, 0.92, 0.95) * dot(gAlb, vec3(0.33)) * 1.25, 0.35);
          sAlb *= mix(vec3(0.84, 0.91, 1.05), vec3(1.04, 1.03, 1.0), sCrest);
          gAlb = mix(gAlb, sAlb, gSnowK);
        }
        // Ground a giant churned up, still bare (darkened in the vertex colour).
        gAlb *= vColor.g;
        // Cloud shadows drifting over the land.
        if (groundShade.w > 0.001) {
          vec2 gq = gP.xz + groundShade.xy;
          float gcs = texture2D(tDetail, gq * 0.00021).r * 0.65 + texture2D(tDetail, gq * 0.00069 + 0.37).r * 0.35;
          gAlb *= 1.0 - groundShade.w * smoothstep(groundShade.z - 0.05, groundShade.z + 0.05, gcs);
        }
        if ((uTerrainExp & 512) != 0) gAlb = vec3(0.7);
        diffuseColor.rgb = gAlb;`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gRough;')
      // Snow glitter: a few grains in a hundred catch the light near you and twinkle as you move.
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float sp = (uTerrainExp & 1024) != 0 ? 0.0 : gSnowK * (1.0 - smoothstep(5.0, 45.0, gDist));
          if (sp > 0.01) {
            vec3 cell = floor(gP * 24.0);
            // (A hash that holds up far from the origin: fract(sin(x)·43758) of cells ~250,000 out — the
            // High Places — had lost its precision and the glitter came out as a coarse speckle over the
            // whole near snow, the playtest.)
            vec3 hp = fract(mod(cell, 4096.0) * vec3(0.1031, 0.1030, 0.0973));
            hp += dot(hp, hp.yxz + 33.33);
            float h = fract((hp.x + hp.y) * hp.z);
            vec3 V = normalize(cameraPosition - gP);
            float tw = fract(h * 7.0 + dot(V, vec3(3.1, 1.7, 2.3)) * 5.0);
            totalEmissiveRadiance += vec3(1.0, 0.98, 0.94) * step(0.988, h) * smoothstep(0.8, 1.0, tw) * sp * 2.5;
          }
        }`,
      )
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(gNorm, 0.0)).xyz);')
  }
  return mat
}

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

/**
 * Layer order: matches tools/pack-textures.py. The first eight are splatted on
 * the ground (TerrainView writes their weights); the last are stonework.
 */
export const LAYERS = ['grass', 'drygrass', 'forest', 'mud', 'sand', 'redrock', 'rock', 'snow', 'carved', 'relief', 'bone', 'bark', 'flagstone', 'moss', 'basalt', 'hide'] as const
export type Layer = (typeof LAYERS)[number]
export const LAYER = Object.fromEntries(LAYERS.map((l, i) => [l, i])) as Record<Layer, number>

/** Metres per texture tile, up close. */
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

/** The ground material: MeshStandardMaterial with the splat patched in. */
export function makeTerrainMaterial(tex: TerrainTextures, detail: THREE.Texture): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tLayerColor = { value: tex.color }
    shader.uniforms.tLayerNormal = { value: tex.normal }
    shader.uniforms.tDetail = { value: detail }
    shader.uniforms.groundShade = groundShade
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 aSplatA;
        attribute vec4 aSplatB;
        varying vec4 vSplatA;
        varying vec4 vSplatB;
        varying vec3 vGroundPos;
        varying vec3 vGroundN;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vSplatA = aSplatA;
        vSplatB = aSplatB;
        vGroundPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
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
        varying vec4 vSplatA;
        varying vec4 vSplatB;
        varying vec3 vGroundPos;
        varying vec3 vGroundN;
        const float LSCALE[${LAYERS.length}] = float[${LAYERS.length}](${list(SCALE)});
        const float LROUGH[${LAYERS.length}] = float[${LAYERS.length}](${list(ROUGH)});
        const vec3 LTINT[${LAYERS.length}] = vec3[${LAYERS.length}](${TINT.map((t) => `vec3(${list(t)})`).join(', ')});

        // A tangent-space normal from the packed texel (Y flipped: the arrays are
        // uploaded top row first, so the image's "up" is -v).
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
          vec4 n = textureGrad(tLayerNormal, vec3(uv, float(i)), dpx.xz * s, dpy.xz * s);
          if (farT > 0.0) {
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
          float L = float(i);
          vec4 cx = textureGrad(tLayerColor, vec3(p.zy * s, L), dpx.zy * s, dpy.zy * s);
          vec4 cy = textureGrad(tLayerColor, vec3(p.xz * s, L), dpx.xz * s, dpy.xz * s);
          vec4 cz = textureGrad(tLayerColor, vec3(p.xy * s, L), dpx.xy * s, dpy.xy * s);
          vec4 nx = textureGrad(tLayerNormal, vec3(p.zy * s, L), dpx.zy * s, dpy.zy * s);
          vec4 ny = textureGrad(tLayerNormal, vec3(p.xz * s, L), dpx.xz * s, dpy.xz * s);
          vec4 nz = textureGrad(tLayerNormal, vec3(p.xy * s, L), dpx.xy * s, dpy.xy * s);
          col = cx.rgb * w.x + cy.rgb * w.y + cz.rgb * w.z;
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
        vec3 gDx = dFdx(gP);
        vec3 gDy = dFdy(gP);
        float gDist = distance(gP, cameraPosition);
        float gFar = smoothstep(25.0, 160.0, gDist);
        float gW[8] = float[8](vSplatA.x, vSplatA.y, vSplatA.z, vSplatA.w, vSplatB.x, vSplatB.y, vSplatB.z, vSplatB.w);
        // Steep is rock, decided here per pixel from the surface itself, not from
        // the (coarser, smoother) vertex weights: grass and sand projected from
        // above stretch into streaks and pale teeth down a cliff.
        // The triangle's own slope (from screen derivatives), not only the smooth
        // vertex normal: a triangle spanning a cliff's foot is steep all over,
        // where the interpolated normal would leave a pale tooth of sand or grass.
        vec3 gFlat = normalize(cross(gDx, gDy));
        // (Smooth, so the projection does not jump at every triangle edge.)
        float gSteep = 1.0 - smoothstep(0.58, 0.8, min(gN.y, abs(gFlat.y) + 0.06));
        // The facing on steep ground comes from the triangle (the smoothed normal can
        // still point up on a wall at coarse detail); only its horizontal part, so the
        // projection turns smoothly round a cliff instead of jumping at each edge.
        vec2 gHor = gFlat.xz * sign(gFlat.y + 1e-4);
        vec3 gTriN = normalize(mix(gN, vec3(gHor.x, 0.12, gHor.y) / max(1e-3, length(gHor)), gSteep * 0.9));
        if (gSteep > 0.0) {
          for (int i = 0; i < 8; i++) if (i != 5 && i != 6) gW[i] *= 1.0 - gSteep;
          gW[5] += gSteep * vColor.b;
          gW[6] += gSteep * (1.0 - vColor.b);
        }
        vec3 gCol[8];
        vec3 gNrm[8];
        float gH[8];
        float gTop = -10.0;
        for (int i = 0; i < 8; i++) {
          gH[i] = -10.0;
          if (gW[i] < 0.004) continue;
          vec3 c; vec3 n; float h;
          // Cliffs: on steep ground, project from the sides, not from above — the
          // smoothed normal leans up, and a top-down projection streaks down a wall.
          if (i == 5 || i == 6) triLayer(i, gP, gDx, gDy, gTriN, gN, c, n, h);
          else topLayer(i, gP, gDx, gDy, gN, gFar, c, n, h);
          gCol[i] = c * LTINT[i];
          gNrm[i] = n;
          // A layer's height counts for less as its weight thins out.
          gH[i] = h * 0.55 + gW[i];
          gTop = max(gTop, gH[i]);
        }
        vec3 gAlb = vec3(0.0);
        vec3 gNorm = vec3(0.0);
        float gRough = 0.0;
        float gSum = 0.0;
        for (int i = 0; i < 8; i++) {
          if (gH[i] < -5.0) continue;
          float b = max(gH[i] - gTop + 0.18, 0.0);
          gAlb += gCol[i] * b;
          gNorm += gNrm[i] * b;
          gRough += LROUGH[i] * b;
          gSum += b;
        }
        // (Nothing to blend — every layer's weight gone at a ledge's seam:
        // a mid stone, not black and mirror-smooth.)
        gAlb = gSum > 1e-4 ? gAlb / gSum : vec3(0.3, 0.29, 0.27);
        // Cliffs in strata: bands lighter and darker, thick and thin together,
        // dipping and wandering across a wall (evenly ruled stripes read as a
        // layer cake, not as rock laid down over ages).
        float gRockW = (gW[5] + gW[6]) / max(1e-4, gW[0] + gW[1] + gW[2] + gW[3] + gW[4] + gW[5] + gW[6] + gW[7]);
        float gDip = (texture2D(tDetail, gP.xz * 0.0006).r - 0.5) * 2.4 + (texture2D(tDetail, gP.xz * 0.0041 + 0.3).r - 0.5) * 0.5;
        float gBandThin = texture2D(tDetail, vec2(gP.y * 0.021 + gDip, 0.37)).r;
        float gBandThick = texture2D(tDetail, vec2(gP.y * 0.0047 + gDip * 0.6 + 0.2, 0.61)).r;
        float gBand = mix(gBandThin, gBandThick, 0.55);
        gAlb *= mix(1.0, 0.74 + 0.46 * gBand, gRockW * 0.8);
        gNorm = normalize(gNorm + gN * 1e-3);
        gRough = gSum > 1e-4 ? gRough / gSum : 0.9;
        // Far away, the normal detail would only shimmer.
        gNorm = normalize(mix(gNorm, gN, smoothstep(120.0, 600.0, gDist)));

        // Brightness varying at scales the textures do not repeat at.
        float gd2 = texture2D(tDetail, gP.xz * 0.031).r;
        float gd3 = texture2D(tDetail, gP.xz * 0.0047).r;
        gAlb *= (0.84 + 0.32 * gd2) * (0.86 + 0.28 * gd3);

        // The Old Wood from afar: a mottled canopy where the trees stop being drawn.
        // Cliffs differ by land: mossy and dark in the Old Wood, pale grey elsewhere (red in the dunes).
        gAlb = mix(gAlb, gAlb * vec3(0.66, 0.78, 0.62), gRockW * vColor.r * (1.0 - vColor.b));
        // Big, slow variation over open ground — greener and yellower swathes,
        // darker hollows — so a plain never reads as one flat sheet from afar.
        float gM1 = texture2D(tDetail, gP.xz * 0.0011).r;
        float gM2 = texture2D(tDetail, gP.xz * 0.0031 + 0.5).r;
        vec3 gWarm = gAlb * vec3(1.12, 1.04, 0.82);
        vec3 gCool = gAlb * vec3(0.86, 1.0, 0.92);
        gAlb = mix(gAlb, mix(gCool, gWarm, gM1), (1.0 - gRockW) * 0.7);
        gAlb *= 0.88 + 0.24 * gM2;
        float gCanopy = vColor.r * (1.0 - gRockW) * smoothstep(380.0, 760.0, gDist);
        float gCrowns = texture2D(tDetail, gP.xz * 0.06).r;
        gAlb = mix(gAlb, mix(vec3(0.040, 0.052, 0.024), vec3(0.085, 0.098, 0.045), gCrowns), gCanopy);
        // Ground a giant churned up, still bare (darkened in the vertex colour).
        gAlb *= vColor.g;
        // Cloud shadows drifting over the land.
        if (groundShade.w > 0.001) {
          vec2 gq = gP.xz + groundShade.xy;
          float gcs = texture2D(tDetail, gq * 0.00021).r * 0.65 + texture2D(tDetail, gq * 0.00069 + 0.37).r * 0.35;
          gAlb *= 1.0 - groundShade.w * smoothstep(groundShade.z - 0.05, groundShade.z + 0.05, gcs);
        }
        diffuseColor.rgb = gAlb;`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gRough;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(gNorm, 0.0)).xyz);')
  }
  return mat
}

// The reel's air: a warm haze that thickens near the ground and glows toward
// the sun, and a filmic grade (ACES, a little warmth, a little less
// saturation). Both are patched into three's shader chunks, so every lit
// material gets them with no extra render pass. Call before anything renders.

import * as THREE from 'three'

/** A roofed space to keep dark inside (the Undercroft): its rectangle, roof height and skylights. */
export interface DarkHall {
  x: number
  z: number
  hx: number
  hz: number
  /** The roof's height: below it (by a few metres) is inside. */
  top: number
  skylights: Array<[number, number]>
  sky: number
}

export function installAtmosphere(sunDir: THREE.Vector3, opts: { heightScale?: number; hall?: DarkHall } = {}): void {
  const H = (opts.heightScale ?? 380).toFixed(1)
  const f = (v: number) => v.toFixed(2)
  const hall = opts.hall
  // Under a roof it is dark — except under its skylights and by the stair's
  // mouth. Everything with fog (all lit materials) is dimmed alike, before the haze.
  const darkHall = hall
    ? `
  vec2 hq = vFogWorld.xz - vec2(${f(hall.x)}, ${f(hall.z)});
  float hin = (1.0 - smoothstep(-4.0, 4.0, max(abs(hq.x) - ${f(hall.hx)}, abs(hq.y) - ${f(hall.hz)})))
            * (1.0 - smoothstep(${f(hall.top - 16)}, ${f(hall.top - 8)}, vFogWorld.y));
  if (hin > 0.0) {
    float lit = 0.0;
    ${hall.skylights.map(([sx, sz]) => `{ vec2 d = abs(hq - vec2(${f(sx)}, ${f(sz)})); lit = max(lit, 1.0 - smoothstep(${f(hall.sky * 0.5)}, ${f(hall.sky * 2.8)}, max(d.x, d.y))); }`).join('\n    ')}
    lit = max(lit, (1.0 - smoothstep(-150.0, -40.0, hq.x)) * smoothstep(80.0, 105.0, hq.y) * 0.85);
    // Your lantern: a warm pool of light about you (the camera is never far).
    float lamp = 1.0 - smoothstep(3.0, 15.0, distance(vFogWorld, cameraPosition));
    vec3 dim = vec3(0.15 + 0.75 * lit) + vec3(1.0, 0.78, 0.5) * lamp * 0.45;
    gl_FragColor.rgb *= mix(vec3(1.0), dim, hin);
  }`
    : ''
  const s = sunDir.clone().normalize()
  const sun = `vec3(${s.x.toFixed(4)}, ${s.y.toFixed(4)}, ${s.z.toFixed(4)})`
  const C = THREE.ShaderChunk as unknown as Record<string, string>

  C.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
#endif`

  C.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vec4 fogW = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    fogW = instanceMatrix * fogW;
  #endif
  vFogWorld = ( modelMatrix * fogW ).xyz;
#endif`

  C.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorld;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`

  // Density falls off with height (thick in the valleys, thin on the peaks);
  // looking toward the sun, the haze is lit warm.
  C.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  ${darkHall}
  vec3 fogRay = vFogWorld - cameraPosition;
  float fogDist = length( fogRay );
  float fogH = 0.5 * ( max( cameraPosition.y, 0.0 ) + max( vFogWorld.y, 0.0 ) );
  #ifdef FOG_EXP2
    float fogDens = fogDensity * exp( - fogH / ${H} );
  #else
    float fogDens = 1.0 / max( fogFar, 1.0 );
  #endif
  float fogFactor = 1.0 - exp( - fogDens * fogDist );
  float fogSun = pow( max( dot( fogRay / max( fogDist, 1e-3 ), ${sun} ), 0.0 ), 6.0 );
  vec3 fogCol = mix( fogColor, fogColor * vec3( 1.22, 1.08, 0.88 ), fogSun * 0.7 );
  // Far away, the air goes cool and blue-grey (the paintings' distant mountains).
  fogCol = mix( fogCol, fogCol * vec3( 0.9, 0.98, 1.1 ), smoothstep( 700.0, 6000.0, fogDist ) * ( 1.0 - fogSun ) );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, fogFactor );
#endif`

  // ACES, then the grade: warm, a touch desaturated, a gentle S-curve.
  C.tonemapping_pars_fragment = C.tonemapping_pars_fragment.replace(
    'vec3 CustomToneMapping( vec3 color ) { return color; }',
    /* glsl */ `vec3 CustomToneMapping( vec3 color ) {
      vec3 c = ACESFilmicToneMapping( color );
      float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
      c = mix( vec3( l ), c, 0.9 );
      c *= vec3( 1.035, 1.0, 0.95 );
      c = c * c * ( 3.0 - 2.0 * c ) * 0.25 + c * 0.75;
      return clamp( c, 0.0, 1.0 );
    }`,
  )
}

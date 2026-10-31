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

/**
 * The scene's fog. Three hands every lit material two numbers from a linear
 * Fog (near, far) and none of our own, so they carry ours: `near` is the haze
 * density and `far` how heavy the cloud deck is — what the shader needs to
 * fade tall things into the cloud as they rise into it.
 */
export class AirFog extends THREE.Fog {
  private cover = 0
  private baseY = 255
  constructor(color: THREE.ColorRepresentation, density: number) {
    super(color, density, 0)
    this.pack()
  }
  get density(): number {
    return this.near
  }
  set density(v: number) {
    this.near = v
  }
  /** 0 clear … 1 storm: how much of a tall thing the cloud deck swallows. */
  get cloud(): number {
    return this.cover
  }
  set cloud(v: number) {
    this.cover = Math.min(0.999, Math.max(0, v))
    this.pack()
  }
  /** The cloud deck's underside (metres): it comes down in a storm. */
  get base(): number {
    return this.baseY
  }
  set base(v: number) {
    this.baseY = v
    this.pack()
  }
  /** Both ride in `far` (whole metres of base, the cover in the fraction): the shader unpacks them. */
  private pack(): void {
    this.far = Math.floor(this.baseY) + this.cover
  }
}

export function installAtmosphere(sunDir: THREE.Vector3, opts: { heightScale?: number; hall?: DarkHall; cloudBase?: number } = {}): void {
  const cloudBase = (opts.cloudBase ?? 255).toFixed(1)
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
  // The air's thickness averaged along the ray (exact for density falling
  // off exponentially with height), so a long climb up to a tall far thing
  // passes through the thick low air as well as the thin high air.
  float fogY0 = max( cameraPosition.y, 0.0 );
  float fogY1 = max( vFogWorld.y, 0.0 );
  float fogDy = fogY1 - fogY0;
  float fogFall = abs( fogDy ) > 1.0
    ? ${H} * ( exp( - fogY0 / ${H} ) - exp( - fogY1 / ${H} ) ) / fogDy
    : exp( - 0.5 * ( fogY0 + fogY1 ) / ${H} );
  #ifdef FOG_EXP2
    float fogDens = fogDensity * fogFall;
    float cloudCover = 0.0;
    float cloudY = ${cloudBase};
  #else
    // AirFog: near is the density; far packs the deck's base (whole metres) and weight (fraction).
    float fogDens = fogNear * fogFall;
    float cloudCover = fract( fogFar );
    float cloudY = floor( fogFar );
  #endif
  float fogFactor = 1.0 - exp( - fogDens * fogDist );
  // However clear the day, kilometres of air between: the far mountains,
  // and what stands beyond them, go pale and blue (aerial perspective) —
  // less so high up, where the air is thin: the colossi's heads above the
  // far range stand out darker than its hazy flanks.
  fogFactor = max( fogFactor, smoothstep( 3000.0, 12000.0, fogDist ) * 0.66 * ( 1.0 - 0.5 * smoothstep( 1500.0, 6500.0, fogY1 ) ) );
  // (The glow toward the sun is a daytime thing: it fades with the air's own
  // brightness, so at night — fog dark blue — there is none.)
  float fogSun = pow( max( dot( fogRay / max( fogDist, 1e-3 ), ${sun} ), 0.0 ), 6.0 )
    * smoothstep( 0.08, 0.3, dot( fogColor, vec3( 0.2126, 0.7152, 0.0722 ) ) );
  vec3 fogCol = mix( fogColor, fogColor * vec3( 1.22, 1.08, 0.88 ), fogSun * 0.7 );
  // Far away, the air goes cool and blue-grey (the paintings' distant mountains).
  fogCol = mix( fogCol, fogCol * vec3( 0.9, 0.98, 1.1 ), smoothstep( 700.0, 6000.0, fogDist ) * ( 1.0 - fogSun ) );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, fogFactor );
  // Up into the cloud deck, a tall thing fades into it (no hard band where a cloud layer cuts it).
  // Never quite all the way, and over a deep band: a flat fog-coloured
  // cut-out reads as a hole in the picture, a faint form inside reads as cloud.
  float cloudIn = smoothstep( cloudY - 15.0, cloudY + 220.0, vFogWorld.y ) * cloudCover * 0.86;
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor * vec3( 0.92, 0.95, 0.97 ), cloudIn );
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

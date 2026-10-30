// The reel's air: a warm haze that thickens near the ground and glows toward
// the sun, and a filmic grade (ACES, a little warmth, a little less
// saturation). Both are patched into three's shader chunks, so every lit
// material gets them with no extra render pass. Call before anything renders.

import * as THREE from 'three'

export function installAtmosphere(sunDir: THREE.Vector3, opts: { heightScale?: number } = {}): void {
  const H = (opts.heightScale ?? 380).toFixed(1)
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

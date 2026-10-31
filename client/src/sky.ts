// Sky dome, sun, aerial perspective (fog) and the image-based light that
// gives the matte, clay-render look the reel has.

import * as THREE from 'three'
import { Sky } from 'three/addons/objects/Sky.js'

export class SkySystem {
  readonly sky = new Sky()
  readonly sun = new THREE.DirectionalLight(0xffe6c2, 3.1)
  readonly sunDir = new THREE.Vector3()
  readonly fog: THREE.FogExp2
  readonly fill: THREE.HemisphereLight
  readonly counter: THREE.DirectionalLight
  private shadowRadius = 140
  private envRT: THREE.WebGLRenderTarget | null = null

  constructor(private readonly scene: THREE.Scene, private readonly renderer: THREE.WebGLRenderer) {
    this.sky.scale.setScalar(45000)
    // The reel's sky is a muted, greyish blue (about rgb 62, 84, 109 high
    // up), not the physical model's saturated cobalt: pull what we see of it
    // toward grey. (The environment bake keeps the full colour for lighting.)
    this.sky.material.fragmentShader = this.sky.material.fragmentShader.replace(
      'gl_FragColor = vec4( texColor, 1.0 );',
      `float skyL = dot( texColor, vec3( 0.2126, 0.7152, 0.0722 ) );
      vec3 skyC = mix( vec3( skyL ), texColor, 0.55 );
      // Pale only in a band at the horizon; deep, muted blue above it.
      skyC *= mix( 1.0, 0.42, smoothstep( 0.02, 0.38, max( direction.y, 0.0 ) ) );
      gl_FragColor = vec4( skyC, 1.0 );`,
    )
    const u = this.sky.material.uniforms
    // The reel's sky: deep blue overhead, a pale hazy band at the horizon.
    u.turbidity.value = 3
    u.rayleigh.value = 1.1
    u.mieCoefficient.value = 0.0025
    u.mieDirectionalG.value = 0.72
    // Its own cloud layer: scattered fair-weather cumulus far overhead and to
    // the horizon (the billboard clouds in clouds.ts are the near, low ones).
    u.cloudCoverage.value = 0.32
    u.cloudDensity.value = 0.55
    u.cloudScale.value = 0.00028
    u.cloudSpeed.value = 0.00004
    this.sky.frustumCulled = false
    // Sky.js pins its depth to the far plane (z = w). Under a reversed depth
    // buffer that is the NEAR plane, so the sky must draw before everything
    // (it never writes depth) or it paints over whatever it sorts after.
    this.sky.renderOrder = -1
    scene.add(this.sky)

    // Density for the height haze in atmosphere.ts (linear, per metre at ground level).
    this.fog = new THREE.FogExp2(0xa9bccf, 0.00012)
    scene.fog = this.fog

    const s = this.sun
    s.castShadow = true
    s.shadow.mapSize.set(4096, 4096)
    // Small biases: a 0.6 m normal bias detached the Wanderer's shadow from its feet.
    s.shadow.bias = -0.0002
    s.shadow.normalBias = 0.04
    s.shadow.camera.near = 1
    s.shadow.camera.far = 6000
    scene.add(s)
    scene.add(s.target)

    // Fill: sky from above, warm ground bounce from below. Without it, a
    // Titan seen against the sun read as a navy silhouette.
    this.fill = new THREE.HemisphereLight(0xc9c4b6, 0x8a7656, 0.34)
    scene.add(this.fill)
    // Skylight from the side away from the sun: only faces turned from the
    // sun receive it, so back-lit stone lifts without washing out the lit side.
    this.counter = new THREE.DirectionalLight(0xdcd8d0, 0.26)
    scene.add(this.counter)
    scene.add(this.counter.target)

    this.setSun(24, 215)
  }

  /** Sun elevation and azimuth in degrees; rebuilds the environment light. */
  setSun(elevationDeg: number, azimuthDeg: number): void {
    const phi = THREE.MathUtils.degToRad(90 - elevationDeg)
    const theta = THREE.MathUtils.degToRad(azimuthDeg)
    this.sunDir.setFromSphericalCoords(1, phi, theta)
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDir)

    // Horizon haze picks up a warmer tint as the sun drops.
    const low = THREE.MathUtils.smoothstep(elevationDeg, 2, 30)
    this.fog.color.setRGB(0.8 - 0.06 * low, 0.79 - 0.01 * low, 0.76 + 0.03 * low).convertSRGBToLinear()
    this.sun.intensity = 0.8 + 3.5 * low

    this.bakeEnvironment()
  }

  /** Shadow frustum size around the focus (bigger for a Titan's view). */
  setShadowRadius(r: number): void {
    this.shadowRadius = r
    const c = this.sun.shadow.camera
    c.left = -r
    c.right = r
    c.top = r
    c.bottom = -r
    c.updateProjectionMatrix()
  }

  /** Let the sky's clouds drift. */
  tick(dt: number): void {
    this.sky.material.uniforms.time.value += dt
  }

  /** Keep the shadow map centred on what the player is looking at. */
  follow(focus: THREE.Vector3, camera: THREE.Camera): void {
    this.sky.position.copy(camera.position)
    // Snap to shadow texels so the map does not shimmer as the focus moves.
    const texel = (this.shadowRadius * 2) / this.sun.shadow.mapSize.x
    const fx = Math.round(focus.x / texel) * texel
    const fz = Math.round(focus.z / texel) * texel
    this.sun.target.position.set(fx, focus.y, fz)
    this.sun.position.set(fx, focus.y, fz).addScaledVector(this.sunDir, 2500)
    this.sun.target.updateMatrixWorld()
    this.sun.updateMatrixWorld()
    this.counter.target.position.set(fx, focus.y, fz)
    this.counter.position.set(fx - this.sunDir.x * 1000, focus.y + 400, fz - this.sunDir.z * 1000)
    this.counter.target.updateMatrixWorld()
    this.counter.updateMatrixWorld()
  }

  private bakeEnvironment(): void {
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const envScene = new THREE.Scene()
    const sky = new Sky()
    sky.scale.setScalar(1000)
    // Light from a less saturated sky: shadows in the reel are neutral grey,
    // and a cobalt fill turned tan ground olive-green wherever the sun was blocked.
    sky.material.fragmentShader = sky.material.fragmentShader.replace(
      'gl_FragColor = vec4( texColor, 1.0 );',
      'float envL = dot( texColor, vec3( 0.2126, 0.7152, 0.0722 ) ); gl_FragColor = vec4( mix( vec3( envL ), texColor, 0.35 ) * vec3( 1.04, 1.0, 0.94 ), 1.0 );',
    )
    const src = this.sky.material.uniforms
    const dst = sky.material.uniforms
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) dst[k].value = src[k].value
    dst.sunPosition.value.copy(this.sunDir)
    envScene.add(sky)
    // A warm ground plane under the sky so the bounce light is not blue.
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(900, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6f6650) }),
    )
    ground.position.y = -10
    envScene.add(ground)
    this.envRT?.dispose()
    this.envRT = pmrem.fromScene(envScene, 0, 1, 2000)
    this.scene.environment = this.envRT.texture
    this.scene.environmentIntensity = 0.32
    pmrem.dispose()
    ground.geometry.dispose()
    ;(ground.material as THREE.Material).dispose()
    sky.material.dispose()
    sky.geometry.dispose()
  }
}

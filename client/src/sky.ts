// Sky dome, sun, aerial perspective (fog) and the image-based light that
// gives the matte, clay-render look the reel has.

import * as THREE from 'three'
import { Sky } from 'three/addons/objects/Sky.js'
import { AirFog } from './atmosphere'

/**
 * Day and night (user, 2026-10-31: "add day night cycle too with a bright
 * moon and starry sky"). A day lasts DAY seconds: the sun rises in the east,
 * crosses the south and sets in the west over four-fifths of it; then a short
 * night (user: "make the night much shorter than the day, day gets dim by
 * weather anyways"), the moon up opposite, bright, and the stars. The one
 * shadow-casting light is the sun by day and the moon by night.
 */
const DAY = 24 * 60
const SUN_COLOUR = new THREE.Color(0xffe6c2)
const MOON_COLOUR = new THREE.Color(0.62, 0.72, 1.0)
const NIGHT_FOG = new THREE.Color(0.03, 0.04, 0.068)
const TWILIGHT_FOG = new THREE.Color(0.15, 0.115, 0.14)
const NIGHT_FILL = new THREE.Color(0.32, 0.4, 0.62)

export class SkySystem {
  readonly sky = new Sky()
  /** The key light: the sun by day, the moon by night (it casts the shadows either way). */
  readonly sun = new THREE.DirectionalLight(0xffe6c2, 3.1)
  readonly sunDir = new THREE.Vector3()
  readonly moonDir = new THREE.Vector3()
  /** Where the key light comes from (sunDir by day, moonDir by night). */
  readonly keyDir = new THREE.Vector3()
  /** 0 … 1 through the day: 0 midnight, 0.1 sunrise, 0.5 noon, 0.9 sunset. */
  time = 0.36
  /** Does the clock run (tools hold it still)? */
  running = true
  /** 0 day … 1 full night (deep: the sun far below). */
  night = 0
  /** 0 day … 1 twilight and after (the sun at or under the horizon). */
  dusk = 0
  /**
   * The light as the time of day sets it, before the weather dims it
   * (weather.ts reads these each frame).
   */
  readonly lightBase = { sun: 3.1, fill: 0.34, fillSky: new THREE.Color(0xc9c4b6), env: 0.32, fogColor: new THREE.Color(), counter: 0.26 }
  private readonly stars: THREE.Points
  private readonly moon: THREE.Sprite
  private bakedAt = new THREE.Vector3(0, -1, 0)
  readonly fog: AirFog
  readonly fill: THREE.HemisphereLight
  readonly counter: THREE.DirectionalLight
  private shadowRadius = 140
  private envRT: THREE.WebGLRenderTarget | null = null

  constructor(private readonly scene: THREE.Scene, private readonly renderer: THREE.WebGLRenderer) {
    this.sky.scale.setScalar(45000)
    // The reel's sky is a muted, greyish blue (about rgb 62, 84, 109 high
    // up), not the physical model's saturated cobalt: pull what we see of it
    // toward grey. (The environment bake keeps the full colour for lighting.)
    this.sky.material.uniforms.uOvercast = { value: 0 }
    this.sky.material.fragmentShader = 'uniform float uOvercast;\n' + this.sky.material.fragmentShader.replace(
      'gl_FragColor = vec4( texColor, 1.0 );',
      `float skyL = dot( texColor, vec3( 0.2126, 0.7152, 0.0722 ) );
      vec3 skyC = mix( vec3( skyL ), texColor, 0.55 );
      // Pale only in a band at the horizon; deep, muted blue above it.
      skyC *= mix( 1.0, 0.42, smoothstep( 0.02, 0.38, max( direction.y, 0.0 ) ) );
      // Under cloud (weather.ts): a flat, heavy grey, darker overhead.
      vec3 grey = vec3( 0.36, 0.40, 0.42 ) * mix( 1.15, 0.75, smoothstep( 0.0, 0.6, max( direction.y, 0.0 ) ) );
      // (The sun's disk is thousands of times brighter: clamp it, or it burns through the deck.)
      skyC = mix( skyC, grey, uOvercast * 0.9 );
      skyC = mix( skyC, min( skyC, vec3( 1.2 ) ), uOvercast );
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
    this.fog = new AirFog(0xa9bccf, 0.00017)
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

    // The night sky: a few thousand stars on a far sphere, and the moon.
    this.stars = starField()
    scene.add(this.stars)
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTexture(), color: new THREE.Color(3.2, 3.3, 3.6), transparent: true, depthWrite: false, fog: false }))
    this.moon.scale.setScalar(2400)
    this.moon.renderOrder = -0.5
    scene.add(this.moon)
    this.sky.material.uniforms.uNight = { value: 0 }
    this.sky.material.uniforms.uDusk = { value: 0 }
    this.sky.material.uniforms.uSand = { value: 0 }
    this.sky.material.fragmentShader = 'uniform float uNight;\nuniform float uDusk;\nuniform float uSand;\n' + this.sky.material.fragmentShader.replace(
      'gl_FragColor = vec4( skyC, 1.0 );',
      `// Twilight (the physical sky goes black once the sun is down): deep blue-violet
      // overhead, the horizon warm where the sun went, cooler elsewhere.
      float hz = 1.0 - smoothstep( 0.0, 0.35, max( direction.y, 0.0 ) );
      float toSun = pow( max( dot( normalize( vec3( direction.x, 0.0, direction.z ) ), normalize( vec3( vSunDirection.x, 0.0, vSunDirection.z ) ) ), 0.0 ), 3.0 );
      vec3 duskC = mix( vec3( 0.05, 0.06, 0.13 ), mix( vec3( 0.16, 0.12, 0.17 ), vec3( 0.5, 0.26, 0.17 ), toSun ), hz );
      skyC = mix( skyC, duskC, uDusk );
      // Night: a deep blue-black, a little lighter at the horizon.
      vec3 nightC = mix( vec3( 0.03, 0.045, 0.08 ), vec3( 0.006, 0.01, 0.024 ), smoothstep( 0.0, 0.5, max( direction.y, 0.0 ) ) );
      skyC = mix( skyC, nightC, uNight );
      // A sandstorm (weather.ts): the whole sky ochre and thick, a little darker overhead.
      skyC = mix( skyC, vec3( 0.6, 0.45, 0.28 ) * mix( 1.0, 0.7, max( direction.y, 0.0 ) ), uSand * 0.9 );
      gl_FragColor = vec4( skyC, 1.0 );`,
    )
    this.setTime(this.time)
  }

  /** Jump to a time of day (tools; also the start). */
  setTime(t: number): void {
    this.time = ((t % 1) + 1) % 1
    this.updateDay(true)
  }

  /** Let the day go by. */
  advance(dt: number): void {
    if (!this.running) return
    this.time = (this.time + dt / DAY) % 1
    this.updateDay(false)
  }

  private updateDay(force: boolean): void {
    const t = this.time
    // The sun's arc by day (0.1 … 0.9: four-fifths of it), below the ground by night.
    const day = (t - 0.1) / 0.8
    // (No higher than 40°: a high sun washed the haze white; the land was made for a low, golden light.)
    const elev = day >= 0 && day <= 1 ? 40 * Math.sin(Math.PI * day) : -28 * Math.sin(Math.PI * (((t - 0.9 + 1) % 1) / 0.2))
    const az = 90 - 180 * Math.min(1.2, Math.max(-0.2, day))
    const phi = THREE.MathUtils.degToRad(90 - elev)
    const theta = THREE.MathUtils.degToRad(az)
    this.sunDir.setFromSphericalCoords(1, phi, theta)
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDir)
    // The moon: across the sky from the sun, riding high through the night.
    this.moonDir.set(-this.sunDir.x, Math.max(0.25, -this.sunDir.y) + 0.15, -this.sunDir.z).normalize()
    // Day → twilight (the sun at the horizon to 5° under) → night (well under).
    this.dusk = 1 - THREE.MathUtils.smoothstep(elev, -5, 4)
    this.night = 1 - THREE.MathUtils.smoothstep(elev, -16, -5)
    const daylight = THREE.MathUtils.smoothstep(elev, -5, 10)
    // Key light: whichever of the two is brighter.
    const low = THREE.MathUtils.smoothstep(elev, 2, 30)
    const sunI = (0.8 + 3.5 * low) * THREE.MathUtils.smoothstep(elev, -3, 6)
    const moonI = 0.7 * Math.max(this.night, this.dusk * 0.4)
    const lb = this.lightBase
    if (sunI >= moonI) {
      this.keyDir.copy(this.sunDir)
      this.sun.color.copy(SUN_COLOUR).lerp(new THREE.Color(1, 0.66, 0.42), 1 - low)
      lb.sun = sunI
    } else {
      this.keyDir.copy(this.moonDir)
      this.sun.color.copy(MOON_COLOUR)
      lb.sun = moonI
    }
    // The air: warm toward sunset, deep blue at night.
    lb.fogColor.setRGB(0.8 - 0.06 * low, 0.79 - 0.01 * low, 0.76 + 0.03 * low).convertSRGBToLinear()
    lb.fogColor.lerp(new THREE.Color(0.85, 0.55, 0.42), 0.35 * (1 - low) * daylight).lerp(TWILIGHT_FOG, this.dusk).lerp(NIGHT_FOG, this.night)
    lb.fill = 0.34 * (0.3 + 0.7 * daylight)
    lb.fillSky.set(0xc9c4b6).lerp(NIGHT_FILL, Math.max(this.dusk * 0.7, this.night))
    lb.env = 0.32 * (0.18 + 0.82 * daylight)
    lb.counter = 0.26 * daylight
    this.counter.intensity = lb.counter
    this.sky.material.uniforms.uNight.value = this.night
    this.sky.material.uniforms.uDusk.value = this.dusk
    ;(this.stars.material as THREE.ShaderMaterial).uniforms.uNight.value = Math.max(this.night, this.dusk * 0.35)
    this.moon.material.opacity = THREE.MathUtils.smoothstep(this.night, 0.05, 0.6)
    // The image light follows the sky, rebaked when the sun has moved a few degrees.
    if (force || this.sunDir.angleTo(this.bakedAt) > THREE.MathUtils.degToRad(3)) {
      this.bakedAt.copy(this.sunDir)
      this.bakeEnvironment()
    }
  }

  /** Sun elevation and azimuth in degrees; rebuilds the environment light. */

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
    if (Math.abs(r - this.shadowRadius) < 1) return
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
    this.sun.position.set(fx, focus.y, fz).addScaledVector(this.keyDir, 2500)
    this.sun.target.updateMatrixWorld()
    this.sun.updateMatrixWorld()
    this.counter.target.position.set(fx, focus.y, fz)
    this.counter.position.set(fx - this.keyDir.x * 1000, focus.y + 400, fz - this.keyDir.z * 1000)
    // The stars and the moon ride with you (they are infinitely far).
    this.stars.position.copy(camera.position)
    this.moon.position.copy(camera.position).addScaledVector(this.moonDir, 30000)
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
    pmrem.dispose()
    ground.geometry.dispose()
    ;(ground.material as THREE.Material).dispose()
    sky.material.dispose()
    sky.geometry.dispose()
  }
}

/** A few thousand stars on a far sphere, twinkling; brighter ones rarer; a faint band across. */
function starField(): THREE.Points {
  const n = 4200
  const pos = new Float32Array(n * 3)
  const mag = new Float32Array(n)
  let seed = 12345
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < n; i++) {
    // Uniform on the upper sphere, with a denser band (a milky way) tilted across.
    let x = rand() * 2 - 1
    let y = rand()
    let z = rand() * 2 - 1
    if (i < n * 0.4) {
      const a = rand() * Math.PI * 2
      x = Math.cos(a)
      z = Math.sin(a) * 0.35 + (rand() - 0.5) * 0.25
      y = Math.abs(Math.sin(a)) * 0.8 + (rand() - 0.5) * 0.2
    }
    const l = Math.hypot(x, y, z) || 1
    pos.set([(x / l) * 38000, (Math.max(-0.05, y) / l) * 38000, (z / l) * 38000], i * 3)
    mag[i] = Math.pow(rand(), 6)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('aMag', new THREE.BufferAttribute(mag, 1))
  const mat = new THREE.ShaderMaterial({
    uniforms: { uNight: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aMag;
      varying float vMag;
      varying float vTw;
      void main() {
        vMag = aMag;
        vTw = fract(sin(dot(position.xz, vec2(12.9898, 78.233))) * 43758.5453);
        gl_PointSize = 1.2 + aMag * 3.2;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uNight;
      varying float vMag;
      varying float vTw;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.0, length(c));
        float b = (0.35 + 1.6 * vMag) * uNight;
        gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * b * 2.0, a * min(1.0, b));
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  })
  const p = new THREE.Points(g, mat)
  p.frustumCulled = false
  p.renderOrder = -0.8
  return p
}

/** The moon: a pale disc with darker seas and a soft glow round it. */
function moonTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const glow = g.createRadialGradient(128, 128, 30, 128, 128, 128)
  glow.addColorStop(0, 'rgba(220,230,255,0.35)')
  glow.addColorStop(1, 'rgba(220,230,255,0)')
  g.fillStyle = glow
  g.fillRect(0, 0, 256, 256)
  g.fillStyle = '#eef0f4'
  g.beginPath()
  g.arc(128, 128, 34, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = 'rgba(150,160,175,0.45)'
  for (const [x, y, r] of [[118, 118, 10], [138, 130, 8], [124, 142, 6], [140, 112, 5]]) {
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// Sky dome, sun, aerial perspective (fog) and the image-based light that
// gives the matte, clay-render look the reel has.

import * as THREE from 'three'
import { Sky } from 'three/addons/objects/Sky.js'

export class SkySystem {
  readonly sky = new Sky()
  readonly sun = new THREE.DirectionalLight(0xffe6c2, 3.1)
  readonly sunDir = new THREE.Vector3()
  readonly fog: THREE.FogExp2
  private shadowRadius = 140
  private envRT: THREE.WebGLRenderTarget | null = null

  constructor(private readonly scene: THREE.Scene, private readonly renderer: THREE.WebGLRenderer) {
    this.sky.scale.setScalar(45000)
    const u = this.sky.material.uniforms
    u.turbidity.value = 2.6
    u.rayleigh.value = 1.1
    u.mieCoefficient.value = 0.0028
    u.mieDirectionalG.value = 0.82
    this.sky.frustumCulled = false
    // Sky.js pins its depth to the far plane (z = w). Under a reversed depth
    // buffer that is the NEAR plane, so the sky must draw before everything
    // (it never writes depth) or it paints over whatever it sorts after.
    this.sky.renderOrder = -1
    scene.add(this.sky)

    this.fog = new THREE.FogExp2(0xa9bccf, 0.00011)
    scene.fog = this.fog

    const s = this.sun
    s.castShadow = true
    s.shadow.mapSize.set(4096, 4096)
    s.shadow.bias = -0.0004
    s.shadow.normalBias = 0.6
    s.shadow.camera.near = 1
    s.shadow.camera.far = 6000
    scene.add(s)
    scene.add(s.target)

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
    this.fog.color.setRGB(0.78 - 0.1 * low, 0.73 + 0.02 * low, 0.66 + 0.15 * low).convertSRGBToLinear()
    this.sun.intensity = 0.6 + 2.9 * low

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
  }

  private bakeEnvironment(): void {
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const envScene = new THREE.Scene()
    const sky = new Sky()
    sky.scale.setScalar(1000)
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
    this.scene.environmentIntensity = 0.42
    pmrem.dispose()
    ground.geometry.dispose()
    ;(ground.material as THREE.Material).dispose()
    sky.material.dispose()
    sky.geometry.dispose()
  }
}

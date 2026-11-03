// The wanderer's own footprints, in sand (the giants' are craters; yours are this): a print
// at each footfall, left and right, darker where the foot pressed, fading over half a
// minute as the wind fills them. One instanced mesh, a ring of the last few hundred.

import * as THREE from 'three'

const N = 240
const LIFE = 32

export class Prints {
  readonly mesh: THREE.InstancedMesh
  private readonly age = new Float32Array(N).fill(LIFE)
  private readonly alpha: THREE.InstancedBufferAttribute
  private next = 0
  private side = 1
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly up = new THREE.Vector3(0, 1, 0)

  constructor(colour = new THREE.Color(0.24, 0.17, 0.1)) {
    const geo = new THREE.PlaneGeometry(0.18, 0.36).rotateX(-Math.PI / 2)
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(N), 1)
    geo.setAttribute('aAlpha', this.alpha)
    const mat = new THREE.ShaderMaterial({
      uniforms: { uCol: { value: colour } },
      vertexShader: /* glsl */ `
        attribute float aAlpha;
        varying float vA;
        varying vec2 vUv;
        void main() {
          vA = aAlpha;
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCol;
        varying float vA;
        varying vec2 vUv;
        void main() {
          // A sole: an oval, the heel and the ball of the foot pressed deeper.
          vec2 p = (vUv - 0.5) * vec2(2.0, 2.0);
          float sole = 1.0 - smoothstep(0.75, 1.0, length(p * vec2(1.0, 0.95)));
          float press = 0.55 + 0.45 * max(1.0 - smoothstep(0.0, 0.55, length(p - vec2(0.0, -0.55))), 1.0 - smoothstep(0.0, 0.6, length(p - vec2(0.0, 0.45))));
          float a = sole * press * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uCol, a);
        }`,
      transparent: true,
      depthWrite: false,
      // (Lifted a few centimetres off the ground rather than polygon-offset.)
    })
    this.mesh = new THREE.InstancedMesh(geo, mat, N)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 1
    for (let i = 0; i < N; i++) this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0))
  }

  /** A footfall at (x, z) on ground `y`, facing `yaw`; `k` 0 … 1 how soft the ground is. */
  step(x: number, y: number, z: number, yaw: number, k: number): void {
    this.side = -this.side
    const i = this.next
    this.next = (this.next + 1) % N
    // (To one side of the line you walk: left foot, right foot.)
    const ox = Math.cos(yaw) * 0.11 * this.side
    const oz = -Math.sin(yaw) * 0.11 * this.side
    this.q.setFromAxisAngle(this.up, yaw)
    this.m.compose(new THREE.Vector3(x + ox, y + 0.06, z + oz), this.q, new THREE.Vector3(1, 1, 1))
    this.mesh.setMatrixAt(i, this.m)
    this.mesh.instanceMatrix.needsUpdate = true
    this.age[i] = 0
    this.alpha.setX(i, 0.75 * k)
    this.strength[i] = 0.75 * k
  }

  private readonly strength = new Float32Array(N)

  update(dt: number): void {
    let changed = false
    for (let i = 0; i < N; i++) {
      if (this.age[i] >= LIFE) continue
      this.age[i] += dt
      const a = this.strength[i] * (1 - Math.min(1, this.age[i] / LIFE)) ** 1.5
      this.alpha.setX(i, a)
      changed = true
    }
    if (changed) this.alpha.needsUpdate = true
  }
}

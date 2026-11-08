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
  /** Where the sun is (world, unit): main sets it each frame. */
  readonly sun = { value: new THREE.Vector3(0.4, 0.8, 0.3) }

  constructor(colour = new THREE.Color(0.24, 0.17, 0.1)) {
    const geo = new THREE.PlaneGeometry(0.2, 0.36).rotateX(-Math.PI / 2)
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(N), 1)
    geo.setAttribute('aAlpha', this.alpha)
    // (A hollow pressed in, lit by the sun — not a dark smudge: the tour's desert shots read the old
    // flat dark ovals as dirt on the lens. A crisp rim; the wall away from the sun in shadow, the lip
    // facing it a little lit; the floor only slightly darker than the sand; a foot's shape.)
    const mat = new THREE.ShaderMaterial({
      uniforms: { uCol: { value: colour }, uSun: this.sun },
      vertexShader: /* glsl */ `
        uniform vec3 uSun;
        attribute float aAlpha;
        varying float vA;
        varying vec2 vUv;
        varying vec2 vSunL;
        void main() {
          vA = aAlpha;
          vUv = uv;
          // The sun's way across the ground, in the print's own frame.
          vec3 sl = transpose(mat3(instanceMatrix)) * uSun;
          vSunL = normalize(vec2(sl.x, -sl.z) + 1e-4);
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCol;
        varying float vA;
        varying vec2 vUv;
        varying vec2 vSunL;
        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          // A foot: the ball wide, the waist narrower, the heel round.
          float w = mix(0.62, 0.85, smoothstep(-0.4, 0.4, p.y)) * (1.0 - 0.18 * exp(-p.y * p.y * 9.0));
          float r = length(vec2(p.x / w, p.y * 0.95));
          float inside = 1.0 - smoothstep(0.86, 0.92, r);
          float rimBand = smoothstep(0.72, 0.88, r) * (1.0 - smoothstep(0.9, 1.0, r));
          float lipBand = smoothstep(0.9, 0.95, r) * (1.0 - smoothstep(0.95, 1.08, r));
          vec2 n = normalize(vec2(p.x / (w * w), p.y) + 1e-4);
          float toSun = dot(n, vSunL);
          // Shadow: the floor a little, the wall on the far side from the sun most.
          float shade = inside * (0.3 + 0.75 * rimBand * smoothstep(-0.2, 0.8, -toSun));
          // Light: the lip and the near wall where the sun catches them.
          float lit = (lipBand * 0.6 + rimBand * 0.4) * smoothstep(0.1, 0.9, toSun);
          if (shade * vA < 0.01 && lit * vA < 0.01) discard;
          if (lit > shade) gl_FragColor = vec4(vec3(1.0, 0.96, 0.88), lit * 0.35 * vA);
          else gl_FragColor = vec4(uCol, shade * vA);
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

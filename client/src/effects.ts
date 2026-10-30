// Cosmetic, client-only effects: dust billows and flying rock debris when a
// Titan's foot lands, and dust kicked up along the dragging foot. Nothing
// here is simulated by the server — it never changes the world.
//
// Both pools are fixed-size InstancedMeshes, so a footfall allocates nothing.

import * as THREE from 'three'
import { mulberry32 } from '@titans/shared'

const DUST = 260
const ROCKS = 140

function dustMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(0xb5a684) } },
    vertexShader: /* glsl */ `
      attribute float aAlpha;
      varying float vAlpha;
      varying vec2 vUv;
      void main() {
        vec3 c = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float s = length(instanceMatrix[0].xyz);
        vec4 mv = viewMatrix * vec4(c, 1.0);
        mv.xy += position.xy * s;
        gl_Position = projectionMatrix * mv;
        vUv = uv;
        vAlpha = aAlpha;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vAlpha;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = dot(p, p);
        if (r > 1.0) discard;
        float a = (1.0 - r) * (1.0 - r) * vAlpha;
        gl_FragColor = vec4(uColor * (0.85 + 0.15 * (1.0 - r)), a);
        #include <colorspace_fragment>
      }`,
  })
}

interface Puff {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  size: number
  grow: number
  age: number
  life: number
  alpha: number
}

interface Rock {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  rx: number
  ry: number
  spin: number
  size: number
  age: number
  life: number
}

export class Effects {
  readonly group = new THREE.Group()
  private readonly dust: THREE.InstancedMesh
  private readonly alpha: THREE.InstancedBufferAttribute
  private readonly rocks: THREE.InstancedMesh
  private readonly puffs: Puff[] = []
  private readonly stones: Rock[] = []
  private nextPuff = 0
  private nextRock = 0
  private readonly rand = mulberry32(99)
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly e = new THREE.Euler()
  private readonly v = new THREE.Vector3()
  private readonly s = new THREE.Vector3()

  constructor(private readonly groundAt: (x: number, z: number) => number) {
    const plane = new THREE.PlaneGeometry(1, 1)
    this.dust = new THREE.InstancedMesh(plane, dustMaterial(), DUST)
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(DUST), 1)
    plane.setAttribute('aAlpha', this.alpha)
    this.dust.frustumCulled = false
    this.dust.renderOrder = 2
    for (let i = 0; i < DUST; i++) {
      this.puffs.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0, grow: 0, age: 1, life: 1, alpha: 0 })
      this.dust.setMatrixAt(i, this.m.makeScale(0, 0, 0))
    }

    const rockGeo = new THREE.IcosahedronGeometry(1, 0)
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8070, roughness: 0.95, flatShading: true })
    this.rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCKS)
    this.rocks.castShadow = true
    this.rocks.frustumCulled = false
    for (let i = 0; i < ROCKS; i++) {
      this.stones.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, spin: 0, size: 0, age: 1, life: 1 })
      this.rocks.setMatrixAt(i, this.m.makeScale(0, 0, 0))
    }
    this.group.add(this.dust, this.rocks)
  }

  /** A foot landing: a ring of billowing dust and a spray of rocks. `scale` is the Titan height. */
  impact(x: number, y: number, z: number, scale: number): void {
    const r = this.rand
    for (let i = 0; i < 46; i++) {
      const a = r() * Math.PI * 2
      const sp = scale * (0.05 + r() * 0.1)
      this.puff(
        x + Math.cos(a) * scale * 0.06,
        y + scale * 0.01,
        z + Math.sin(a) * scale * 0.06,
        Math.cos(a) * sp,
        scale * (0.01 + r() * 0.03),
        Math.sin(a) * sp,
        scale * (0.05 + r() * 0.05),
        scale * 0.06,
        4 + r() * 4,
        0.55,
      )
    }
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2
      const sp = scale * (0.06 + r() * 0.14)
      const s = this.stones[this.nextRock]
      this.nextRock = (this.nextRock + 1) % ROCKS
      s.x = x
      s.y = y + scale * 0.02
      s.z = z
      s.vx = Math.cos(a) * sp
      s.vz = Math.sin(a) * sp
      s.vy = scale * (0.12 + r() * 0.18)
      s.rx = r() * 6
      s.ry = r() * 6
      s.spin = (r() - 0.5) * 8
      s.size = scale * (0.004 + r() * 0.01)
      s.age = 0
      s.life = 6 + r() * 3
    }
  }

  /** Dust kicked up along a dragging foot. */
  drag(x: number, y: number, z: number, scale: number): void {
    const r = this.rand
    for (let i = 0; i < 6; i++) {
      this.puff(
        x + (r() - 0.5) * scale * 0.06,
        y + scale * 0.01,
        z + (r() - 0.5) * scale * 0.06,
        (r() - 0.5) * scale * 0.02,
        scale * (0.006 + r() * 0.01),
        (r() - 0.5) * scale * 0.02,
        scale * (0.03 + r() * 0.03),
        scale * 0.03,
        3 + r() * 2,
        0.4,
      )
    }
  }

  private puff(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, grow: number, life: number, alpha: number): void {
    const p = this.puffs[this.nextPuff]
    this.nextPuff = (this.nextPuff + 1) % DUST
    p.x = x
    p.y = y
    p.z = z
    p.vx = vx
    p.vy = vy
    p.vz = vz
    p.size = size
    p.grow = grow
    p.age = 0
    p.life = life
    p.alpha = alpha
  }

  update(dt: number): void {
    const m = this.m
    for (let i = 0; i < DUST; i++) {
      const p = this.puffs[i]
      if (p.age >= p.life) {
        this.alpha.setX(i, 0)
        continue
      }
      p.age += dt
      const drag = Math.exp(-1.6 * dt)
      p.vx *= drag
      p.vz *= drag
      p.vy *= Math.exp(-0.8 * dt)
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      p.size += p.grow * dt
      const t = p.age / p.life
      this.alpha.setX(i, p.alpha * Math.min(1, t * 6) * (1 - t) * (1 - t))
      m.makeScale(p.size, p.size, p.size)
      m.setPosition(p.x, p.y, p.z)
      this.dust.setMatrixAt(i, m)
    }
    this.dust.instanceMatrix.needsUpdate = true
    this.alpha.needsUpdate = true

    for (let i = 0; i < ROCKS; i++) {
      const s = this.stones[i]
      if (s.age >= s.life) continue
      s.age += dt
      const ground = this.groundAt(s.x, s.z)
      if (s.y > ground + s.size * 0.5 || s.vy > 0) {
        s.vy -= 9.8 * dt
        s.x += s.vx * dt
        s.y += s.vy * dt
        s.z += s.vz * dt
        s.rx += s.spin * dt
        s.ry += s.spin * 0.7 * dt
      } else {
        // Landed: settle, then sink out of sight as it fades.
        s.y = ground + s.size * 0.3 - Math.max(0, s.age - s.life + 1.5) * s.size
        s.vx = s.vz = s.vy = 0
      }
      this.e.set(s.rx, s.ry, 0)
      this.q.setFromEuler(this.e)
      const k = s.age >= s.life ? 0 : s.size
      this.rocks.setMatrixAt(i, m.compose(this.v.set(s.x, s.y, s.z), this.q, this.s.set(k, k * 0.8, k)))
    }
    this.rocks.instanceMatrix.needsUpdate = true
  }
}

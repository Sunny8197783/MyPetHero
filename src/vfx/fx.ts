import * as THREE from 'three';
import { fxRng } from '../core/rng';
import { particleAtlas } from './particles';

const FLAT_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const TAIL = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

const RING_FRAG = /* glsl */ `
uniform float uProgress;
uniform vec3 uColor;
uniform float uThick;
uniform float uFill;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float d = length(p);
  float r = mix(0.06, 0.97, uProgress);
  float edge = smoothstep(r - uThick, r - uThick * 0.3, d) * (1.0 - smoothstep(r, r + 0.02, d));
  float ang = d > 1e-4 ? atan(p.y, p.x) : 0.0;
  float ripple = 0.72 + 0.28 * sin(ang * 16.0 + uProgress * 18.0);
  float fill = (1.0 - smoothstep(0.0, r, d)) * uFill;
  float fade = 1.0 - uProgress * uProgress;
  float a = clamp((edge * ripple + fill) * fade, 0.0, 1.0);
  gl_FragColor = vec4(uColor * (0.55 + edge * 0.75), a * 0.85);
  ${TAIL}
}`;

const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uLife;
uniform float uTime;
uniform float uTele;
varying vec2 vUv;
void main() {
  float v = abs(vUv.y - 0.5) * 2.0;
  float ends = smoothstep(0.0, 0.03, vUv.x) * (1.0 - smoothstep(0.88, 1.0, vUv.x));
  if (uTele > 0.5) {
    float stripe = step(0.5, fract(vUv.x * 10.0 - uTime * 2.5));
    float a = (0.2 + 0.16 * stripe) * (1.0 - smoothstep(0.75, 1.0, v)) * uLife;
    gl_FragColor = vec4(uColor, a);
  } else {
    float core = 1.0 - smoothstep(0.0, 0.42, v);
    float glow = exp(-v * v * 4.5);
    float n = 0.78 + 0.22 * sin(vUv.x * 46.0 - uTime * 34.0);
    float a = clamp((core * 1.5 + glow * 0.75 * n) * ends * uLife, 0.0, 1.0);
    gl_FragColor = vec4(mix(uColor, vec3(1.0), core * 0.6) * 1.35, a * 0.9);
  }
  ${TAIL}
}`;

const DECAL_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uCell;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 cell = vec2(mod(uCell, 4.0), floor(uCell / 4.0));
  vec2 uv = vec2((cell.x + vUv.x) / 4.0, 1.0 - (cell.y + 1.0 - vUv.y) / 4.0);
  float m = texture2D(uMap, uv).a;
  vec2 p = vUv * 2.0 - 1.0;
  float halo = exp(-dot(p, p) * 2.6) * 0.18;
  float pulse = 0.8 + 0.2 * sin(uTime * 9.0);
  float a = clamp((m * pulse + halo) * uAlpha, 0.0, 1.0);
  gl_FragColor = vec4(uColor * (0.5 + m * 0.8), a * 0.8);
  ${TAIL}
}`;

const WHIRL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  float band = sin((vUv.x * 3.0 + vUv.y * 1.6 - uTime * 2.2) * 6.2831);
  float a = smoothstep(0.1, 0.9, band) * (1.0 - vUv.y) * smoothstep(0.0, 0.12, vUv.y) * uAlpha;
  gl_FragColor = vec4(uColor * 0.9, a * 0.7);
  ${TAIL}
}`;

const AURA_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vPos;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  vPos = position;
  gl_Position = projectionMatrix * mv;
}`;

const AURA_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uStrength;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vPos;
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
void main() {
  // 정규화한 두 벡터의 내적은 반올림 오차로 1 을 살짝 넘을 수 있다. 음수의 pow(NaN)를 막기 위해 0~1 로 자른다.
  vec3 nrm = vNormal * inversesqrt(max(dot(vNormal, vNormal), 1e-8));
  vec3 viw = vView * inversesqrt(max(dot(vView, vView), 1e-8));
  float fres = pow(clamp(1.0 - abs(dot(nrm, viw)), 0.0, 1.0), 1.8);
  float n = noise(vPos * 2.6 + vec3(0.0, -uTime * 2.4, 0.0)) * 0.6 + noise(vPos * 5.5 + vec3(0.0, -uTime * 3.6, uTime)) * 0.4;
  float flame = smoothstep(0.25, 0.9, n + vPos.y * 0.25);
  float a = clamp(fres * (0.4 + flame * 1.0) * uStrength, 0.0, 0.8);
  gl_FragColor = vec4(uColor * (0.7 + flame * 0.9), a);
  ${TAIL}
}`;

function flatPlane(): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(1, 1);
  g.rotateX(-Math.PI / 2);
  return g;
}

function additive(fragmentShader: string, uniforms: Record<string, THREE.IUniform>, vertexShader = FLAT_VERT): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

function linearColor(hex: number): THREE.Color {
  return new THREE.Color(hex);
}

interface Ring {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  age: number;
  life: number;
}

export interface BeamHandle {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  age: number;
  life: number;
  alive: boolean;
  /** 지속형(스윕) 광선은 직접 수명을 관리한다. */
  held: boolean;
}

interface Bolt {
  mesh: THREE.Mesh;
  age: number;
  life: number;
}

export interface DecalHandle {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  age: number;
  life: number;
  alive: boolean;
}

const BOLT_SEG = 10;

/** 씬 하나에 붙는 이펙트 메시 풀: 충격파 링, 광선, 번개, 바닥 데칼. */
export class Fx {
  readonly group = new THREE.Group();
  private readonly rings: Ring[] = [];
  private readonly beams: BeamHandle[] = [];
  private readonly bolts: Bolt[] = [];
  private readonly decals: DecalHandle[] = [];
  private readonly plane = flatPlane();
  private time = 0;

  constructor() {
    this.group.name = 'fx';
    for (let i = 0; i < 18; i++) {
      const mat = additive(RING_FRAG, {
        uProgress: { value: 0 },
        uColor: { value: new THREE.Color(1, 1, 1) },
        uThick: { value: 0.18 },
        uFill: { value: 0.1 },
      });
      const mesh = new THREE.Mesh(this.plane, mat);
      mesh.visible = false;
      mesh.renderOrder = 8;
      this.group.add(mesh);
      this.rings.push({ mesh, mat, age: 0, life: 1 });
    }
    for (let i = 0; i < 10; i++) {
      const mat = additive(BEAM_FRAG, {
        uColor: { value: new THREE.Color(1, 1, 1) },
        uLife: { value: 1 },
        uTime: { value: 0 },
        uTele: { value: 0 },
      });
      const mesh = new THREE.Mesh(this.plane, mat);
      mesh.visible = false;
      mesh.renderOrder = 9;
      this.group.add(mesh);
      this.beams.push({ mesh, mat, age: 0, life: 1, alive: false, held: false });
    }
    for (let i = 0; i < 16; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((BOLT_SEG + 1) * 2 * 3), 3));
      const idx: number[] = [];
      for (let s = 0; s < BOLT_SEG; s++) {
        const a = s * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      geo.setIndex(idx);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 10;
      this.group.add(mesh);
      this.bolts.push({ mesh, age: 0, life: 1 });
    }
    for (let i = 0; i < 14; i++) {
      const mat = additive(DECAL_FRAG, {
        uMap: { value: particleAtlas() },
        uCell: { value: 5 },
        uColor: { value: new THREE.Color(1, 1, 1) },
        uAlpha: { value: 1 },
        uTime: { value: 0 },
      });
      const mesh = new THREE.Mesh(this.plane, mat);
      mesh.visible = false;
      mesh.renderOrder = 7;
      this.group.add(mesh);
      this.decals.push({ mesh, mat, age: 0, life: 1, alive: false });
    }
  }

  /** 바닥에 퍼지는 충격파 링. */
  ring(x: number, z: number, radius: number, color: number, life = 0.45, thick = 0.2, fill = 0.12, y = 0.14): void {
    let r = this.rings[0];
    for (const c of this.rings) {
      if (!c.mesh.visible) {
        r = c;
        break;
      }
      if (c.age / c.life > r.age / r.life) r = c;
    }
    r.age = 0;
    r.life = life;
    r.mesh.visible = true;
    r.mesh.position.set(x, y, z);
    r.mesh.scale.set(radius * 2, 1, radius * 2);
    r.mat.uniforms.uProgress.value = 0;
    (r.mat.uniforms.uColor.value as THREE.Color).copy(linearColor(color));
    r.mat.uniforms.uThick.value = thick;
    r.mat.uniforms.uFill.value = fill;
  }

  private place(mesh: THREE.Mesh, x0: number, z0: number, x1: number, z1: number, width: number, y: number): void {
    const dx = x1 - x0;
    const dz = z1 - z0;
    mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    mesh.rotation.y = -Math.atan2(dz, dx);
    mesh.scale.set(Math.max(0.01, Math.hypot(dx, dz)), 1, width);
  }

  /** 두 점을 잇는 광선. held=true 면 release 할 때까지 유지된다. telegraph=true 면 경고 줄무늬. */
  beam(x0: number, z0: number, x1: number, z1: number, width: number, color: number, life = 0.22, held = false, telegraph = false): BeamHandle {
    let b = this.beams.find((c) => !c.alive);
    if (!b) b = this.beams[0];
    b.alive = true;
    b.held = held;
    b.age = 0;
    b.life = life;
    b.mesh.visible = true;
    this.place(b.mesh, x0, z0, x1, z1, width, telegraph ? 0.09 : 0.9);
    (b.mat.uniforms.uColor.value as THREE.Color).copy(linearColor(color));
    b.mat.uniforms.uLife.value = 1;
    b.mat.uniforms.uTele.value = telegraph ? 1 : 0;
    b.mat.blending = telegraph ? THREE.NormalBlending : THREE.AdditiveBlending;
    return b;
  }

  moveBeam(b: BeamHandle, x0: number, z0: number, x1: number, z1: number, width: number): void {
    this.place(b.mesh, x0, z0, x1, z1, width, b.mat.uniforms.uTele.value > 0.5 ? 0.09 : 0.9);
  }

  releaseBeam(b: BeamHandle): void {
    b.held = false;
    b.age = 0;
    b.life = 0.12;
  }

  /** 지그재그 번개. */
  bolt(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, life = 0.16, width = 0.22, jitter = 0.7): void {
    let b = this.bolts[0];
    for (const c of this.bolts) {
      if (!c.mesh.visible) {
        b = c;
        break;
      }
      if (c.age / c.life > b.age / b.life) b = c;
    }
    b.age = 0;
    b.life = life;
    b.mesh.visible = true;
    const mat = b.mesh.material as THREE.MeshBasicMaterial;
    mat.color.set(color).multiplyScalar(2.0);
    mat.opacity = 1;
    const pos = b.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz) || 1;
    // 리본의 폭 방향: 진행 방향에 수직(수평면). 수직 낙뢰는 x축을 쓴다.
    const nx = len > 0.2 ? -dz / len : 1;
    const nz = len > 0.2 ? dx / len : 0;
    for (let s = 0; s <= BOLT_SEG; s++) {
      const t = s / BOLT_SEG;
      const edge = s === 0 || s === BOLT_SEG ? 0 : 1;
      const j = (fxRng.next() - 0.5) * 2 * jitter * edge;
      const jy = (fxRng.next() - 0.5) * jitter * 0.6 * edge;
      const cx = x0 + dx * t + nx * j;
      const cy = y0 + (y1 - y0) * t + jy;
      const cz = z0 + dz * t + nz * j;
      const w = width * (0.6 + 0.4 * Math.sin(t * Math.PI));
      const o = s * 6;
      arr[o] = cx + nx * w;
      arr[o + 1] = cy;
      arr[o + 2] = cz + nz * w;
      arr[o + 3] = cx - nx * w;
      arr[o + 4] = cy;
      arr[o + 5] = cz - nz * w;
    }
    pos.needsUpdate = true;
  }

  /** 바닥 데칼(발도장, 경고 원 등). 아틀라스 칸 번호를 쓴다. */
  decal(x: number, z: number, radius: number, color: number, life: number, cell: number, rotation = 0): DecalHandle {
    let d = this.decals.find((c) => !c.alive);
    if (!d) d = this.decals[0];
    d.alive = true;
    d.age = 0;
    d.life = life;
    d.mesh.visible = true;
    d.mesh.position.set(x, 0.1, z);
    d.mesh.rotation.y = rotation;
    d.mesh.scale.set(radius * 2, 1, radius * 2);
    d.mat.uniforms.uCell.value = cell;
    (d.mat.uniforms.uColor.value as THREE.Color).copy(linearColor(color));
    d.mat.uniforms.uAlpha.value = 0;
    return d;
  }

  update(dt: number): void {
    this.time += dt;
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.age += dt;
      const t = r.age / r.life;
      if (t >= 1) {
        r.mesh.visible = false;
        continue;
      }
      r.mat.uniforms.uProgress.value = 1 - Math.pow(1 - t, 2.4);
    }
    for (const b of this.beams) {
      if (!b.alive) continue;
      b.age += dt;
      b.mat.uniforms.uTime.value = this.time;
      if (b.held) {
        b.mat.uniforms.uLife.value = Math.min(1, b.age / 0.08);
        continue;
      }
      const t = b.age / b.life;
      if (t >= 1) {
        b.alive = false;
        b.mesh.visible = false;
        continue;
      }
      b.mat.uniforms.uLife.value = b.mat.uniforms.uTele.value > 0.5 ? 1 : 1 - t * t;
    }
    for (const b of this.bolts) {
      if (!b.mesh.visible) continue;
      b.age += dt;
      const t = b.age / b.life;
      if (t >= 1) {
        b.mesh.visible = false;
        continue;
      }
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * (0.6 + 0.4 * Math.sin(this.time * 90));
    }
    for (const d of this.decals) {
      if (!d.alive) continue;
      d.age += dt;
      const t = d.age / d.life;
      if (t >= 1) {
        d.alive = false;
        d.mesh.visible = false;
        continue;
      }
      d.mat.uniforms.uTime.value = this.time;
      d.mat.uniforms.uAlpha.value = Math.min(1, d.age / 0.15) * (t > 0.8 ? (1 - t) / 0.2 : 1);
    }
  }

  dispose(): void {
    this.plane.dispose();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (m.geometry !== this.plane) m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
  }
}

/** 회오리(꼬리 회오리 무기) 시각 효과용 메시. */
export function makeWhirl(color: number): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(0.75, 0.22, 1.9, 14, 1, true);
  geo.translate(0, 0.95, 0);
  const mesh = new THREE.Mesh(
    geo,
    additive(WHIRL_FRAG, { uColor: { value: linearColor(color) }, uTime: { value: 0 }, uAlpha: { value: 1 } }),
  );
  mesh.renderOrder = 9;
  return mesh;
}

/** 초능력 각성 오라: 프레넬 + 흐르는 노이즈. */
export class Aura {
  readonly mesh: THREE.Mesh;
  strength = 0;
  target = 0;
  private readonly mat: THREE.ShaderMaterial;

  constructor(color: number, radius = 1) {
    this.mat = additive(
      AURA_FRAG,
      { uColor: { value: linearColor(color) }, uTime: { value: 0 }, uStrength: { value: 0 } },
      AURA_VERT,
    );
    this.mat.side = THREE.FrontSide;
    this.mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 3), this.mat);
    this.mesh.visible = false;
    this.mesh.renderOrder = 11;
  }

  setColor(color: number): void {
    (this.mat.uniforms.uColor.value as THREE.Color).set(color);
  }

  update(realDt: number, time: number): void {
    this.strength += (this.target - this.strength) * Math.min(1, realDt * 8);
    this.mesh.visible = this.strength > 0.01;
    this.mat.uniforms.uStrength.value = this.strength;
    this.mat.uniforms.uTime.value = time;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

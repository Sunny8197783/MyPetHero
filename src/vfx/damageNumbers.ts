import * as THREE from 'three';
import { feel } from '../data';
import { easeOutBack, fxRng } from '../core/rng';

const CELL = 64;
const GLYPHS = '0123456789!+-';

function drawDigits(fontFamily: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = CELL * 4;
  c.height = CELL * 4;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 54px ${fontFamily}`;
  g.lineJoin = 'round';
  for (let i = 0; i < GLYPHS.length; i++) {
    const x = (i % 4) * CELL + CELL / 2;
    const y = Math.floor(i / 4) * CELL + CELL / 2 + 3;
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(20,12,30,0.95)';
    g.strokeText(GLYPHS[i], x, y);
    g.fillStyle = '#fff';
    g.fillText(GLYPHS[i], x, y);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const VERT = /* glsl */ `
attribute vec4 iPosSize;
attribute vec4 iColor;
attribute vec2 iGlyph; // x: 글자 번호, y: 글자 가로 위치(글자 폭 단위)
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 mv = viewMatrix * vec4(iPosSize.xyz, 1.0);
  mv.xy += (position.xy + vec2(iGlyph.y * 0.62, 0.0)) * iPosSize.w;
  gl_Position = projectionMatrix * mv;
  vec2 cell = vec2(mod(iGlyph.x, 4.0), floor(iGlyph.x / 4.0));
  vUv = vec2((cell.x + uv.x) / 4.0, 1.0 - (cell.y + 1.0 - uv.y) / 4.0);
  vColor = iColor;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float a = t.a * vColor.a;
  if (a < 0.02) discard;
  // 외곽선(어두운 부분)은 색을 입히지 않는다.
  vec3 rgb = mix(t.rgb * 0.08, vColor.rgb, t.r);
  gl_FragColor = vec4(rgb, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** 튀어오르며 사라지는 데미지 숫자. 숫자 한 글자가 인스턴스 하나다. */
export class DamageNumbers {
  readonly mesh: THREE.Mesh;
  enabled = true;
  max: number;

  private count = 0;
  private spawnedThisFrame = 0;
  private readonly cap: number;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly z: Float32Array;
  private readonly vx: Float32Array;
  private readonly age: Float32Array;
  private readonly size: Float32Array;
  private readonly glyph: Float32Array;
  private readonly offset: Float32Array;
  private readonly r: Float32Array;
  private readonly g: Float32Array;
  private readonly b: Float32Array;
  private readonly aPosSize: THREE.InstancedBufferAttribute;
  private readonly aColor: THREE.InstancedBufferAttribute;
  private readonly aGlyph: THREE.InstancedBufferAttribute;
  private readonly geometry: THREE.InstancedBufferGeometry;

  constructor(cap = 800, fontFamily = 'HeroRound, sans-serif') {
    this.cap = cap;
    this.max = cap;
    const f = (): Float32Array => new Float32Array(cap);
    this.x = f();
    this.y = f();
    this.z = f();
    this.vx = f();
    this.age = f();
    this.size = f();
    this.glyph = f();
    this.offset = f();
    this.r = f();
    this.g = f();
    this.b = f();
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.index = quad.index;
    this.geometry.setAttribute('position', quad.getAttribute('position'));
    this.geometry.setAttribute('uv', quad.getAttribute('uv'));
    this.aPosSize = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.aGlyph = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2);
    for (const a of [this.aPosSize, this.aColor, this.aGlyph]) a.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('iPosSize', this.aPosSize);
    this.geometry.setAttribute('iColor', this.aColor);
    this.geometry.setAttribute('iGlyph', this.aGlyph);
    this.geometry.instanceCount = 0;
    this.mesh = new THREE.Mesh(
      this.geometry,
      new THREE.ShaderMaterial({
        uniforms: { uMap: { value: drawDigits(fontFamily) } },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: false,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 30;
  }

  /** kind: 0 일반, 1 치명타, 2 플레이어 피해, 3 회복 */
  spawn(x: number, y: number, z: number, value: number, kind: 0 | 1 | 2 | 3): void {
    const cfg = feel.damageNumbers;
    if (!this.enabled || !cfg.enabled) return;
    if (kind === 0 && this.spawnedThisFrame >= cfg.maxPerFrame) return;
    this.spawnedThisFrame++;
    const text = (kind === 3 ? '+' : '') + Math.max(1, Math.round(value)).toString() + (kind === 1 ? '!' : '');
    if (this.count + text.length > Math.min(this.cap, this.max)) return;
    const hex = kind === 1 ? cfg.critColor : kind === 2 ? cfg.playerColor : kind === 3 ? cfg.healColor : cfg.normalColor;
    const col = parseInt(hex.slice(1), 16);
    const boost = kind === 1 ? 1.6 : 1.1;
    const cr = Math.pow(((col >> 16) & 255) / 255, 2.2) * boost;
    const cg = Math.pow(((col >> 8) & 255) / 255, 2.2) * boost;
    const cb = Math.pow((col & 255) / 255, 2.2) * boost;
    const size = kind === 1 ? cfg.critSize : cfg.size;
    const jx = (fxRng.next() - 0.5) * 0.8;
    const jz = (fxRng.next() - 0.5) * 0.5;
    const drift = (fxRng.next() - 0.5) * 1.6;
    const half = (text.length - 1) / 2;
    for (let k = 0; k < text.length; k++) {
      const i = this.count++;
      this.x[i] = x + jx;
      this.y[i] = y;
      this.z[i] = z + jz;
      this.vx[i] = drift;
      this.age[i] = 0;
      this.size[i] = size;
      this.glyph[i] = GLYPHS.indexOf(text[k]);
      this.offset[i] = k - half;
      this.r[i] = cr;
      this.g[i] = cg;
      this.b[i] = cb;
    }
  }

  update(dt: number): void {
    this.spawnedThisFrame = 0;
    const cfg = feel.damageNumbers;
    const ps = this.aPosSize.array as Float32Array;
    const col = this.aColor.array as Float32Array;
    const gl = this.aGlyph.array as Float32Array;
    let n = this.count;
    for (let i = 0; i < n; ) {
      const age = (this.age[i] += dt);
      if (age >= cfg.life) {
        n--;
        if (i !== n) {
          this.x[i] = this.x[n]; this.y[i] = this.y[n]; this.z[i] = this.z[n];
          this.vx[i] = this.vx[n]; this.age[i] = this.age[n]; this.size[i] = this.size[n];
          this.glyph[i] = this.glyph[n]; this.offset[i] = this.offset[n];
          this.r[i] = this.r[n]; this.g[i] = this.g[n]; this.b[i] = this.b[n];
        }
        continue;
      }
      const t = age / cfg.life;
      const pop = easeOutBack(Math.min(1, age / 0.14));
      const rise = cfg.rise * (1 - Math.pow(1 - t, 2.2));
      const o = i * 4;
      ps[o] = this.x[i] + this.vx[i] * t;
      ps[o + 1] = this.y[i] + rise;
      ps[o + 2] = this.z[i];
      ps[o + 3] = this.size[i] * pop * (t > 0.75 ? 1 - (t - 0.75) * 1.6 : 1);
      col[o] = this.r[i];
      col[o + 1] = this.g[i];
      col[o + 2] = this.b[i];
      col[o + 3] = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
      gl[i * 2] = this.glyph[i];
      gl[i * 2 + 1] = this.offset[i];
      i++;
    }
    this.count = n;
    this.geometry.instanceCount = n;
    if (n > 0) {
      this.aPosSize.needsUpdate = true;
      this.aColor.needsUpdate = true;
      this.aGlyph.needsUpdate = true;
    }
  }

  clear(): void {
    this.count = 0;
    this.geometry.instanceCount = 0;
  }

  dispose(): void {
    this.geometry.dispose();
    const m = this.mesh.material as THREE.ShaderMaterial;
    (m.uniforms.uMap.value as THREE.Texture).dispose();
    m.dispose();
  }
}

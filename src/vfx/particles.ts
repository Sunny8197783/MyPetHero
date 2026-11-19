import * as THREE from 'three';
import { fxRng } from '../core/rng';

/** 파티클 아틀라스(4×4)의 칸 번호. */
export const SPR = {
  soft: 0,
  spark: 1,
  star: 2,
  smoke: 3,
  ring: 4,
  paw: 5,
  shard: 6,
  heart: 7,
  dog: 8,
  zzz: 9,
  leaf: 10,
  note: 11,
  bone: 12,
  bang: 13,
  flame: 14,
  square: 15,
} as const;

const CELL = 128;

function drawAtlas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = CELL * 4;
  c.height = CELL * 4;
  const g = c.getContext('2d')!;
  const cell = (i: number, draw: (cx: number, cy: number) => void): void => {
    const cx = (i % 4) * CELL + CELL / 2;
    const cy = Math.floor(i / 4) * CELL + CELL / 2;
    g.save();
    g.beginPath();
    g.rect(cx - CELL / 2, cy - CELL / 2, CELL, CELL);
    g.clip();
    draw(cx, cy);
    g.restore();
  };
  const radial = (cx: number, cy: number, r: number, stops: [number, string][]): void => {
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    for (const [o, col] of stops) grad.addColorStop(o, col);
    g.fillStyle = grad;
    g.fillRect(cx - r, cy - r, r * 2, r * 2);
  };
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';

  cell(SPR.soft, (x, y) => radial(x, y, 60, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]));
  cell(SPR.spark, (x, y) => {
    g.translate(x, y);
    g.scale(1, 0.16);
    radial(0, 0, 60, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']]);
  });
  cell(SPR.star, (x, y) => {
    radial(x, y, 40, [[0, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]);
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 === 0 ? 58 : 9;
      g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  });
  cell(SPR.smoke, (x, y) => {
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4;
      const r = 14 + (i % 3) * 6;
      radial(x + Math.cos(a) * r, y + Math.sin(a) * r, 34, [[0, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
    }
    radial(x, y, 46, [[0, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]);
  });
  cell(SPR.ring, (x, y) => {
    g.lineWidth = 7;
    g.shadowColor = '#fff';
    g.shadowBlur = 8;
    g.beginPath();
    g.arc(x, y, 46, 0, Math.PI * 2);
    g.stroke();
  });
  cell(SPR.paw, (x, y) => {
    g.beginPath();
    g.ellipse(x, y + 16, 26, 22, 0, 0, Math.PI * 2);
    g.fill();
    for (const [dx, dy, r] of [[-30, -10, 11], [-11, -30, 12], [11, -30, 12], [30, -10, 11]] as const) {
      g.beginPath();
      g.ellipse(x + dx, y + dy, r, r + 3, 0, 0, Math.PI * 2);
      g.fill();
    }
  });
  cell(SPR.shard, (x, y) => {
    g.beginPath();
    g.moveTo(x, y - 46);
    g.lineTo(x + 26, y + 8);
    g.lineTo(x - 6, y + 44);
    g.lineTo(x - 28, y - 4);
    g.closePath();
    g.fill();
  });
  cell(SPR.heart, (x, y) => {
    g.beginPath();
    g.moveTo(x, y + 40);
    g.bezierCurveTo(x - 62, y - 4, x - 34, y - 54, x, y - 22);
    g.bezierCurveTo(x + 34, y - 54, x + 62, y - 4, x, y + 40);
    g.fill();
  });
  cell(SPR.dog, (x, y) => {
    g.beginPath();
    g.ellipse(x - 4, y + 4, 34, 17, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(x + 34, y - 10, 17, 14, -0.3, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(x + 26, y - 20);
    g.lineTo(x + 30, y - 42);
    g.lineTo(x + 40, y - 22);
    g.fill();
    g.beginPath();
    g.moveTo(x + 44, y - 4);
    g.lineTo(x + 60, y - 2);
    g.lineTo(x + 46, y + 4);
    g.fill();
    g.lineWidth = 9;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x - 36, y);
    g.quadraticCurveTo(x - 58, y - 14, x - 50, y - 34);
    g.stroke();
    for (const lx of [-26, -12, 10, 22]) {
      g.beginPath();
      g.moveTo(x + lx, y + 12);
      g.lineTo(x + lx + (lx < 0 ? -6 : 6), y + 40);
      g.stroke();
    }
  });
  cell(SPR.zzz, (x, y) => {
    g.font = 'bold 96px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('Z', x, y + 4);
  });
  cell(SPR.leaf, (x, y) => {
    g.beginPath();
    g.moveTo(x - 46, y);
    g.quadraticCurveTo(x, y - 34, x + 46, y);
    g.quadraticCurveTo(x, y + 34, x - 46, y);
    g.fill();
  });
  cell(SPR.note, (x, y) => {
    g.beginPath();
    g.ellipse(x - 12, y + 26, 18, 13, -0.4, 0, Math.PI * 2);
    g.fill();
    g.fillRect(x + 2, y - 44, 7, 70);
    g.beginPath();
    g.moveTo(x + 2, y - 44);
    g.quadraticCurveTo(x + 40, y - 34, x + 34, y - 4);
    g.quadraticCurveTo(x + 30, y - 22, x + 2, y - 26);
    g.fill();
  });
  cell(SPR.bone, (x, y) => {
    g.fillRect(x - 34, y - 9, 68, 18);
    for (const [dx, dy] of [[-36, -11], [-36, 11], [36, -11], [36, 11]] as const) {
      g.beginPath();
      g.arc(x + dx, y + dy, 13, 0, Math.PI * 2);
      g.fill();
    }
  });
  cell(SPR.bang, (x, y) => {
    g.font = 'bold 104px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('!', x, y + 4);
  });
  cell(SPR.flame, (x, y) => {
    const grad = g.createRadialGradient(x, y + 16, 2, x, y + 6, 54);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.75)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(x, y - 56);
    g.bezierCurveTo(x + 46, y - 8, x + 40, y + 50, x, y + 52);
    g.bezierCurveTo(x - 40, y + 50, x - 46, y - 8, x, y - 56);
    g.fill();
  });
  cell(SPR.square, (x, y) => g.fillRect(x - 40, y - 40, 80, 80));
  return c;
}

let atlasTexture: THREE.CanvasTexture | null = null;
let atlasCanvas: HTMLCanvasElement | null = null;
export function particleAtlas(): THREE.CanvasTexture {
  if (!atlasTexture) {
    atlasCanvas = drawAtlas();
    atlasTexture = new THREE.CanvasTexture(atlasCanvas);
    atlasTexture.colorSpace = THREE.SRGBColorSpace;
    atlasTexture.generateMipmaps = true;
  }
  return atlasTexture;
}

/** 아틀라스의 한 칸을 CSS 배경으로 쓸 수 있는 data URL (UI 아이콘용). */
export function atlasCanvasEl(): HTMLCanvasElement {
  particleAtlas();
  return atlasCanvas!;
}

const VERT = /* glsl */ `
attribute vec4 iPosSize;
attribute vec4 iColor;
attribute vec4 iMisc;
varying vec2 vUv;
varying vec4 vColor;
varying float vAdd;
void main() {
  float c = cos(iMisc.x), s = sin(iMisc.x);
  vec2 corner = position.xy * iPosSize.w;
  corner = vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y);
  vec4 mv = viewMatrix * vec4(iPosSize.xyz, 1.0);
  mv.xy += corner;
  gl_Position = projectionMatrix * mv;
  vec2 cell = vec2(mod(iMisc.y, 4.0), floor(iMisc.y / 4.0));
  vUv = vec2((cell.x + uv.x) / 4.0, 1.0 - (cell.y + 1.0 - uv.y) / 4.0);
  vColor = iColor;
  vAdd = iMisc.z;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
varying vec4 vColor;
varying float vAdd;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float a = t.a * vColor.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor.rgb * t.rgb * a, a * (1.0 - vAdd));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * CPU 시뮬레이션 + GPU 인스턴싱 파티클. 가산(additive)과 일반 알파를 한 드로우콜에 섞는다.
 * 핫 패스에서 객체를 만들지 않도록 emit 은 숫자 인자만 받는다.
 */
export class Particles {
  readonly mesh: THREE.Mesh;
  /** 품질 옵션에 따른 방출량 배율. */
  scale = 1;
  count = 0;

  private readonly max: number;
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly pz: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly size0: Float32Array;
  private readonly size1: Float32Array;
  private readonly cr: Float32Array;
  private readonly cg: Float32Array;
  private readonly cb: Float32Array;
  private readonly alpha: Float32Array;
  private readonly sprite: Float32Array;
  private readonly add: Float32Array;
  private readonly grav: Float32Array;
  private readonly drag: Float32Array;
  private readonly rot: Float32Array;
  private readonly rotVel: Float32Array;
  private readonly aPosSize: THREE.InstancedBufferAttribute;
  private readonly aColor: THREE.InstancedBufferAttribute;
  private readonly aMisc: THREE.InstancedBufferAttribute;
  private readonly geometry: THREE.InstancedBufferGeometry;

  constructor(max = 4096) {
    this.max = max;
    const f = (): Float32Array => new Float32Array(max);
    this.px = f();
    this.py = f();
    this.pz = f();
    this.vx = f();
    this.vy = f();
    this.vz = f();
    this.age = f();
    this.life = f();
    this.size0 = f();
    this.size1 = f();
    this.cr = f();
    this.cg = f();
    this.cb = f();
    this.alpha = f();
    this.sprite = f();
    this.add = f();
    this.grav = f();
    this.drag = f();
    this.rot = f();
    this.rotVel = f();

    const quad = new THREE.PlaneGeometry(1, 1);
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.index = quad.index;
    this.geometry.setAttribute('position', quad.getAttribute('position'));
    this.geometry.setAttribute('uv', quad.getAttribute('uv'));
    this.aPosSize = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    for (const a of [this.aPosSize, this.aColor, this.aMisc]) a.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('iPosSize', this.aPosSize);
    this.geometry.setAttribute('iColor', this.aColor);
    this.geometry.setAttribute('iMisc', this.aMisc);
    this.geometry.instanceCount = 0;

    const material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: particleAtlas() } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendEquation: THREE.AddEquation,
    });
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
  }

  /** 파티클 하나를 낸다. color 는 0xRRGGBB, intensity 는 블룸용 밝기 배율. */
  emit(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    life: number, size: number, sizeEnd: number,
    color: number, intensity: number, alpha: number,
    sprite: number, additive: number,
    gravity = 0, drag = 0, rot = 0, rotVel = 0,
  ): void {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.age[i] = 0;
    this.life[i] = life;
    this.size0[i] = size;
    this.size1[i] = sizeEnd;
    // sRGB → 선형 근사 (감마 2.2)
    this.cr[i] = Math.pow(((color >> 16) & 255) / 255, 2.2) * intensity;
    this.cg[i] = Math.pow(((color >> 8) & 255) / 255, 2.2) * intensity;
    this.cb[i] = Math.pow((color & 255) / 255, 2.2) * intensity;
    this.alpha[i] = alpha;
    this.sprite[i] = sprite;
    this.add[i] = additive;
    this.grav[i] = gravity;
    this.drag[i] = drag;
    this.rot[i] = rot;
    this.rotVel[i] = rotVel;
  }

  /** 한 점에서 사방으로 튀는 묶음. */
  burst(
    x: number, y: number, z: number, n: number, speed: number, life: number, size: number,
    color: number, intensity: number, sprite: number, additive: number, gravity = 0, drag = 2, up = 0.6,
  ): void {
    const count = Math.max(1, Math.round(n * this.scale));
    for (let k = 0; k < count; k++) {
      const a = fxRng.next() * Math.PI * 2;
      const s = speed * (0.35 + fxRng.next() * 0.65);
      this.emit(
        x, y, z,
        Math.cos(a) * s, (fxRng.next() * 0.8 + 0.2) * speed * up, Math.sin(a) * s,
        life * (0.6 + fxRng.next() * 0.4), size * (0.6 + fxRng.next() * 0.6), 0,
        color, intensity, 1, sprite, additive, gravity, drag, fxRng.next() * 6.28, (fxRng.next() - 0.5) * 8,
      );
    }
  }

  update(dt: number): void {
    const ps = this.aPosSize.array as Float32Array;
    const col = this.aColor.array as Float32Array;
    const misc = this.aMisc.array as Float32Array;
    let n = this.count;
    for (let i = 0; i < n; ) {
      const age = (this.age[i] += dt);
      if (age >= this.life[i]) {
        n--;
        if (i !== n) {
          this.px[i] = this.px[n]; this.py[i] = this.py[n]; this.pz[i] = this.pz[n];
          this.vx[i] = this.vx[n]; this.vy[i] = this.vy[n]; this.vz[i] = this.vz[n];
          this.age[i] = this.age[n]; this.life[i] = this.life[n];
          this.size0[i] = this.size0[n]; this.size1[i] = this.size1[n];
          this.cr[i] = this.cr[n]; this.cg[i] = this.cg[n]; this.cb[i] = this.cb[n];
          this.alpha[i] = this.alpha[n]; this.sprite[i] = this.sprite[n]; this.add[i] = this.add[n];
          this.grav[i] = this.grav[n]; this.drag[i] = this.drag[n];
          this.rot[i] = this.rot[n]; this.rotVel[i] = this.rotVel[n];
        }
        continue;
      }
      const d = this.drag[i];
      if (d > 0) {
        const k = Math.max(0, 1 - d * dt);
        this.vx[i] *= k;
        this.vy[i] *= k;
        this.vz[i] *= k;
      }
      this.vy[i] -= this.grav[i] * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      if (this.py[i] < 0.03 && this.grav[i] > 0) {
        this.py[i] = 0.03;
        this.vy[i] *= -0.35;
        this.vx[i] *= 0.6;
        this.vz[i] *= 0.6;
      }
      this.rot[i] += this.rotVel[i] * dt;
      const t = age / this.life[i];
      const o = i * 4;
      ps[o] = this.px[i];
      ps[o + 1] = this.py[i];
      ps[o + 2] = this.pz[i];
      ps[o + 3] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      col[o] = this.cr[i];
      col[o + 1] = this.cg[i];
      col[o + 2] = this.cb[i];
      col[o + 3] = this.alpha[i] * (1 - t * t);
      misc[o] = this.rot[i];
      misc[o + 1] = this.sprite[i];
      misc[o + 2] = this.add[i];
      i++;
    }
    this.count = n;
    this.geometry.instanceCount = n;
    if (n > 0) {
      this.aPosSize.needsUpdate = true;
      this.aColor.needsUpdate = true;
      this.aMisc.needsUpdate = true;
    }
  }

  clear(): void {
    this.count = 0;
    this.geometry.instanceCount = 0;
  }

  dispose(): void {
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

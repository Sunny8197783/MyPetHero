import * as THREE from 'three';
import { balance, feel } from '../data';

const MAX_GEMS = 700;
/** 등급별 색: 1, 3, 10 경험치, 3번은 간식(회복). */
const TIER_COLORS = [0x4fd8ff, 0x7dff8a, 0xffc94d, 0xff7aa8];
const TIER_SIZE = [0.34, 0.42, 0.56, 0.6];
export const GEM_SNACK = 3;

/** 경험치 보석: 떨어질 때 튀고, 가까이 가면 자석처럼 빨려 온다. */
export class Gems {
  readonly mesh: THREE.InstancedMesh;
  count = 0;
  private readonly x = new Float32Array(MAX_GEMS);
  private readonly y = new Float32Array(MAX_GEMS);
  private readonly z = new Float32Array(MAX_GEMS);
  private readonly vx = new Float32Array(MAX_GEMS);
  private readonly vy = new Float32Array(MAX_GEMS);
  private readonly vz = new Float32Array(MAX_GEMS);
  private readonly age = new Float32Array(MAX_GEMS);
  private readonly value = new Float32Array(MAX_GEMS);
  private readonly tier = new Uint8Array(MAX_GEMS);
  private readonly pulled = new Uint8Array(MAX_GEMS);
  private readonly colors: THREE.Color[];
  /** 전부 끌어당기는 중(새벽, 보스 처치). */
  vacuum = false;

  constructor() {
    const geo = new THREE.OctahedronGeometry(0.5, 0);
    geo.scale(0.72, 1, 0.72);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_GEMS);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.colors = TIER_COLORS.map((c) => new THREE.Color(c).multiplyScalar(1.9));
  }

  drop(x: number, z: number, xp: number, tier?: number): void {
    const values = balance.xp.gemValues;
    const t = tier ?? (xp >= values[2] ? 2 : xp >= values[1] ? 1 : 0);
    if (this.count >= MAX_GEMS) {
      // 가득 차면 마지막 보석에 값을 합친다.
      this.value[this.count - 1] += xp;
      return;
    }
    const i = this.count++;
    const a = Math.random() * Math.PI * 2;
    const s = feel.death.gemPop * (0.3 + Math.random() * 0.5);
    this.x[i] = x;
    this.y[i] = 0.6;
    this.z[i] = z;
    this.vx[i] = Math.cos(a) * s * 0.5;
    this.vy[i] = s;
    this.vz[i] = Math.sin(a) * s * 0.5;
    this.age[i] = 0;
    this.value[i] = xp;
    this.tier[i] = t;
    this.pulled[i] = 0;
  }

  update(
    dt: number, time: number, px: number, pz: number, magnet: number,
    onCollect: (value: number, tier: number, x: number, z: number) => void,
  ): void {
    const g = feel.gems;
    const m = this.mesh.instanceMatrix.array as Float32Array;
    const col = this.mesh.instanceColor!.array as Float32Array;
    const magnet2 = magnet * magnet;
    const collect2 = g.collectRadius * g.collectRadius;
    let n = this.count;
    for (let i = 0; i < n; ) {
      this.age[i] += dt;
      const dx = px - this.x[i];
      const dz = pz - this.z[i];
      const d2 = dx * dx + dz * dz;
      if (!this.pulled[i] && this.age[i] > 0.25 && (d2 < magnet2 || this.vacuum)) this.pulled[i] = 1;
      if (this.pulled[i]) {
        const d = Math.sqrt(d2) || 0.001;
        const sp = Math.min(g.maxSpeed, Math.hypot(this.vx[i], this.vz[i]) + g.magnetAccel * dt);
        this.vx[i] = (dx / d) * sp;
        this.vz[i] = (dz / d) * sp;
        this.x[i] += this.vx[i] * dt;
        this.z[i] += this.vz[i] * dt;
        this.y[i] += (0.7 - this.y[i]) * Math.min(1, dt * 10);
      } else {
        this.vy[i] -= 22 * dt;
        this.x[i] += this.vx[i] * dt;
        this.y[i] += this.vy[i] * dt;
        this.z[i] += this.vz[i] * dt;
        if (this.y[i] < 0.4) {
          this.y[i] = 0.4;
          this.vy[i] *= -0.35;
          this.vx[i] *= 0.5;
          this.vz[i] *= 0.5;
        }
      }
      const expired = this.age[i] > balance.xp.gemLifetime && !this.pulled[i];
      if ((this.pulled[i] && d2 < collect2) || expired) {
        if (!expired) onCollect(this.value[i], this.tier[i], this.x[i], this.z[i]);
        n--;
        if (i !== n) {
          this.x[i] = this.x[n]; this.y[i] = this.y[n]; this.z[i] = this.z[n];
          this.vx[i] = this.vx[n]; this.vy[i] = this.vy[n]; this.vz[i] = this.vz[n];
          this.age[i] = this.age[n]; this.value[i] = this.value[n]; this.tier[i] = this.tier[n]; this.pulled[i] = this.pulled[n];
        }
        continue;
      }
      const t = this.tier[i];
      const s = TIER_SIZE[t] * Math.min(1, this.age[i] / 0.12) * (1 + 0.08 * Math.sin(time * 6 + i));
      const a = time * 2.4 + i;
      const cos = Math.cos(a) * s;
      const sin = Math.sin(a) * s;
      const o = i * 16;
      m[o] = cos; m[o + 1] = 0; m[o + 2] = -sin; m[o + 3] = 0;
      m[o + 4] = 0; m[o + 5] = s; m[o + 6] = 0; m[o + 7] = 0;
      m[o + 8] = sin; m[o + 9] = 0; m[o + 10] = cos; m[o + 11] = 0;
      m[o + 12] = this.x[i]; m[o + 13] = this.y[i] + Math.sin(time * 3 + i) * 0.06; m[o + 14] = this.z[i]; m[o + 15] = 1;
      const c = this.colors[t];
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      i++;
    }
    this.count = n;
    this.mesh.count = n;
    if (n > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor!.needsUpdate = true;
    }
  }

  /** 가장 가까운 보석 위치(테스트 봇용). 없으면 null. */
  nearest(px: number, pz: number, maxR: number): { x: number; z: number } | null {
    let best = -1;
    let bestD = maxR * maxR;
    for (let i = 0; i < this.count; i++) {
      const d = (this.x[i] - px) ** 2 + (this.z[i] - pz) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best < 0 ? null : { x: this.x[best], z: this.z[best] };
  }

  clear(): void {
    this.count = 0;
    this.mesh.count = 0;
    this.vacuum = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

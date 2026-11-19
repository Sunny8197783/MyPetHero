import * as THREE from 'three';

const MAX_SHOTS = 256;

/** 적 탄환(마법사의 구슬, 보스 탄막). 인스턴스 구체 + 플레이어 충돌. */
export class EnemyShots {
  readonly mesh: THREE.InstancedMesh;
  count = 0;
  private readonly x = new Float32Array(MAX_SHOTS);
  private readonly z = new Float32Array(MAX_SHOTS);
  private readonly vx = new Float32Array(MAX_SHOTS);
  private readonly vz = new Float32Array(MAX_SHOTS);
  private readonly life = new Float32Array(MAX_SHOTS);
  private readonly dmg = new Float32Array(MAX_SHOTS);
  private readonly size = new Float32Array(MAX_SHOTS);
  private readonly color = new Float32Array(MAX_SHOTS * 3);
  private readonly tmp = new THREE.Color();

  constructor() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 1), mat, MAX_SHOTS);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  spawn(x: number, z: number, vx: number, vz: number, damage: number, life: number, size: number, color: number): void {
    if (this.count >= MAX_SHOTS) return;
    const i = this.count++;
    this.x[i] = x;
    this.z[i] = z;
    this.vx[i] = vx;
    this.vz[i] = vz;
    this.dmg[i] = damage;
    this.life[i] = life;
    this.size[i] = size;
    this.tmp.set(color).multiplyScalar(2.6);
    this.color[i * 3] = this.tmp.r;
    this.color[i * 3 + 1] = this.tmp.g;
    this.color[i * 3 + 2] = this.tmp.b;
  }

  /** 탄을 움직이고, 플레이어에 닿은 탄의 피해량을 onHit 로 알린다. */
  update(dt: number, px: number, pz: number, pr: number, time: number, onHit: (damage: number, x: number, z: number) => void): void {
    const m = this.mesh.instanceMatrix.array as Float32Array;
    const col = this.mesh.instanceColor!.array as Float32Array;
    let n = this.count;
    for (let i = 0; i < n; ) {
      this.life[i] -= dt;
      this.x[i] += this.vx[i] * dt;
      this.z[i] += this.vz[i] * dt;
      const dx = this.x[i] - px;
      const dz = this.z[i] - pz;
      const rr = pr + this.size[i] * 0.5;
      let dead = this.life[i] <= 0;
      if (!dead && dx * dx + dz * dz < rr * rr) {
        onHit(this.dmg[i], this.x[i], this.z[i]);
        dead = true;
      }
      if (dead) {
        n--;
        if (i !== n) {
          this.x[i] = this.x[n]; this.z[i] = this.z[n]; this.vx[i] = this.vx[n]; this.vz[i] = this.vz[n];
          this.life[i] = this.life[n]; this.dmg[i] = this.dmg[n]; this.size[i] = this.size[n];
          this.color[i * 3] = this.color[n * 3]; this.color[i * 3 + 1] = this.color[n * 3 + 1]; this.color[i * 3 + 2] = this.color[n * 3 + 2];
        }
        continue;
      }
      const s = this.size[i] * (0.9 + 0.12 * Math.sin(time * 14 + i));
      const o = i * 16;
      m[o] = s; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0;
      m[o + 4] = 0; m[o + 5] = s; m[o + 6] = 0; m[o + 7] = 0;
      m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = s; m[o + 11] = 0;
      m[o + 12] = this.x[i]; m[o + 13] = 0.9; m[o + 14] = this.z[i]; m[o + 15] = 1;
      col[i * 3] = this.color[i * 3];
      col[i * 3 + 1] = this.color[i * 3 + 1];
      col[i * 3 + 2] = this.color[i * 3 + 2];
      i++;
    }
    this.count = n;
    this.mesh.count = n;
    if (n > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor!.needsUpdate = true;
    }
  }

  clear(): void {
    this.count = 0;
    this.mesh.count = 0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

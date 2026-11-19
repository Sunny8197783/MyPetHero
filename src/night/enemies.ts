import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { assets } from '../core/assets';
import { balance, eliteTuning, enemyTypes, feel, type EnemyTypeDef } from '../data';
import { bakeVat, makeEnemyMaterial, prepareProp, type VatData } from './vat';

export const MAX_ENEMIES = 512;
export const WEAPON_SLOTS = 8;
const CELL = 3;
const GRID_HALF = 72;
const GRID_N = Math.ceil((GRID_HALF * 2) / CELL);
const MAX_RADIUS = 2.4;

interface TypeRenderer {
  def: EnemyTypeDef;
  mesh: THREE.InstancedMesh;
  anim: THREE.InstancedBufferAttribute;
  n: number;
  clipDuration: number;
  tint: THREE.Color;
}

export interface Obstacle {
  x: number;
  z: number;
  r: number;
}

export interface EnemyCallbacks {
  /** 적이 플레이어에게 닿았을 때. */
  onTouch(index: number): void;
  /** 원거리 적이 쏠 때. */
  onShoot(index: number): void;
}

const eliteTint = new THREE.Color(eliteTuning.tint);
const tmpColor = new THREE.Color();
const burnTint = new THREE.Color(1, 0.75, 0.4);

/**
 * 적 수백 마리를 구조체 배열(SoA)로 관리한다.
 *  - 공간 해시 그리드로 범위 질의와 분리(separation)를 처리 (물리 엔진 없음)
 *  - 종류별 InstancedMesh 1개 + VAT 로 스키닝 애니메이션을 GPU 에서 재생
 * 시뮬레이션 상태는 여기 배열에만 있고, 메시는 매 프레임 그 상태를 받아 쓴다.
 */
export class EnemySystem {
  readonly group = new THREE.Group();
  readonly x = new Float32Array(MAX_ENEMIES);
  readonly z = new Float32Array(MAX_ENEMIES);
  readonly y = new Float32Array(MAX_ENEMIES);
  readonly kx = new Float32Array(MAX_ENEMIES);
  readonly kz = new Float32Array(MAX_ENEMIES);
  readonly hp = new Float32Array(MAX_ENEMIES);
  readonly maxHp = new Float32Array(MAX_ENEMIES);
  readonly speed = new Float32Array(MAX_ENEMIES);
  readonly damage = new Float32Array(MAX_ENEMIES);
  readonly radius = new Float32Array(MAX_ENEMIES);
  readonly mass = new Float32Array(MAX_ENEMIES);
  readonly flash = new Float32Array(MAX_ENEMIES);
  readonly squash = new Float32Array(MAX_ENEMIES);
  readonly squashV = new Float32Array(MAX_ENEMIES);
  readonly phase = new Float32Array(MAX_ENEMIES);
  readonly angle = new Float32Array(MAX_ENEMIES);
  readonly stun = new Float32Array(MAX_ENEMIES);
  readonly touchCd = new Float32Array(MAX_ENEMIES);
  readonly shootCd = new Float32Array(MAX_ENEMIES);
  readonly age = new Float32Array(MAX_ENEMIES);
  readonly burn = new Float32Array(MAX_ENEMIES);
  readonly type = new Uint8Array(MAX_ENEMIES);
  readonly alive = new Uint8Array(MAX_ENEMIES);
  readonly elite = new Uint8Array(MAX_ENEMIES);
  /** 1 이면 외부(보스 컨트롤러)가 이동과 렌더를 맡는다. */
  readonly external = new Uint8Array(MAX_ENEMIES);
  /** 무기 슬롯별 마지막 피격 시각(틱 피해용). */
  readonly lastHit = new Float32Array(MAX_ENEMIES * WEAPON_SLOTS);
  count = 0;
  high = 0;
  obstacles: Obstacle[] = [];
  /** 새벽: 남은 적이 플레이어에게서 달아난다. */
  flee = false;

  private readonly free: number[] = [];
  private readonly cellStart = new Int32Array(GRID_N * GRID_N + 1);
  private readonly cellItems = new Int16Array(MAX_ENEMIES);
  private readonly cellOf = new Int32Array(MAX_ENEMIES);
  private readonly renderers: TypeRenderer[] = [];
  private readonly shadow: THREE.InstancedMesh;
  private readonly vats: VatData[] = [];
  private time = 0;

  constructor(private readonly callbacks: EnemyCallbacks, blobTexture: THREE.Texture, private readonly detail = 1) {
    for (let i = MAX_ENEMIES - 1; i >= 0; i--) this.free.push(i);
    this.group.name = 'enemies';
    for (const def of enemyTypes) this.renderers.push(this.buildRenderer(def));

    const shadowGeo = new THREE.PlaneGeometry(1, 1);
    shadowGeo.rotateX(-Math.PI / 2);
    this.shadow = new THREE.InstancedMesh(
      shadowGeo,
      new THREE.MeshBasicMaterial({ map: blobTexture, transparent: true, opacity: 0.55, depthWrite: false, color: 0x000000 }),
      MAX_ENEMIES,
    );
    this.shadow.frustumCulled = false;
    this.shadow.count = 0;
    this.shadow.renderOrder = 2;
    this.group.add(this.shadow);
  }

  private buildRenderer(def: EnemyTypeDef): TypeRenderer {
    let geometry: THREE.BufferGeometry;
    let material: THREE.MeshLambertMaterial;
    let clipDuration = 1;
    if (def.clip) {
      const vat = bakeVat(assets.glb(`kaykit-skeletons/${def.visual}.glb`), def.clip, this.detail);
      this.vats.push(vat);
      geometry = vat.geometry;
      material = makeEnemyMaterial({ map: vat.map, vat, rim: 0x7fb0ff, rimStrength: 0.75 });
      clipDuration = vat.duration;
    } else {
      const parts = assets.geometries('kaykit-halloween', def.visual);
      const merged = mergeGeometries(parts, false) ?? parts[0];
      for (const p of parts) p.dispose();
      geometry = prepareProp(merged);
      material = makeEnemyMaterial({ map: assets.kitMaterial('kaykit-halloween').map, rim: 0xff9a4a, rimStrength: 0.55 });
    }
    const mesh = new THREE.InstancedMesh(geometry, material, MAX_ENEMIES);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const anim = new THREE.InstancedBufferAttribute(new Float32Array(MAX_ENEMIES * 4), 4);
    anim.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aAnim', anim);
    this.group.add(mesh);
    return { def, mesh, anim, n: 0, clipDuration, tint: new THREE.Color(def.color) };
  }

  spawn(typeIndex: number, x: number, z: number, elite: boolean, hpMult: number, dmgMult: number): number {
    const i = this.free.pop();
    if (i === undefined) return -1;
    const def = enemyTypes[typeIndex];
    this.alive[i] = 1;
    this.external[i] = 0;
    this.type[i] = typeIndex;
    this.elite[i] = elite ? 1 : 0;
    this.x[i] = x;
    this.z[i] = z;
    this.y[i] = 0;
    this.kx[i] = 0;
    this.kz[i] = 0;
    const hp = def.hp * hpMult * (elite ? eliteTuning.hpMult : 1);
    this.hp[i] = hp;
    this.maxHp[i] = hp;
    this.speed[i] = def.speed * (elite ? 0.9 : 1);
    this.damage[i] = def.damage * dmgMult * (elite ? eliteTuning.damageMult : 1);
    this.radius[i] = def.radius * (elite ? eliteTuning.scaleMult : 1);
    this.mass[i] = def.mass * (elite ? eliteTuning.massMult : 1);
    this.flash[i] = 0;
    this.squash[i] = 0.3;
    this.squashV[i] = 0;
    this.phase[i] = Math.random();
    this.angle[i] = 0;
    this.stun[i] = 0;
    this.touchCd[i] = 0;
    this.shootCd[i] = def.ranged ? def.ranged.cooldown * (0.4 + Math.random() * 0.6) : 0;
    this.age[i] = 0;
    this.burn[i] = 0;
    this.lastHit.fill(-99, i * WEAPON_SLOTS, (i + 1) * WEAPON_SLOTS);
    this.count++;
    if (i >= this.high) this.high = i + 1;
    return i;
  }

  /** 보스처럼 외부에서 움직이는 개체를 슬롯에 등록한다(무기 판정 대상이 되도록). */
  spawnExternal(x: number, z: number, hp: number, radius: number, mass: number, damage: number): number {
    const i = this.spawn(0, x, z, false, 1, 1);
    if (i < 0) return -1;
    this.external[i] = 1;
    this.hp[i] = hp;
    this.maxHp[i] = hp;
    this.radius[i] = radius;
    this.mass[i] = mass;
    this.damage[i] = damage;
    this.squash[i] = 1;
    return i;
  }

  remove(i: number): void {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.count--;
    this.free.push(i);
    while (this.high > 0 && !this.alive[this.high - 1]) this.high--;
  }

  /** 피해를 주고 반응(플래시, 넉백, 스쿼시)을 건다. 죽었으면 true. 제거는 호출자가 한다. */
  applyHit(i: number, amount: number, kx: number, kz: number): boolean {
    this.hp[i] -= amount;
    this.flash[i] = 1;
    const k = feel.knockback;
    const inv = k.scale / this.mass[i];
    this.kx[i] += kx * inv;
    this.kz[i] += kz * inv;
    if (!this.external[i]) {
      this.squash[i] = Math.min(this.squash[i], k.squash);
      this.squashV[i] = 0;
    }
    return this.hp[i] <= 0;
  }

  rebuildGrid(): void {
    const start = this.cellStart;
    start.fill(0);
    for (let i = 0; i < this.high; i++) {
      if (!this.alive[i]) continue;
      const cx = Math.min(GRID_N - 1, Math.max(0, Math.floor((this.x[i] + GRID_HALF) / CELL)));
      const cz = Math.min(GRID_N - 1, Math.max(0, Math.floor((this.z[i] + GRID_HALF) / CELL)));
      const c = cz * GRID_N + cx;
      this.cellOf[i] = c;
      start[c + 1]++;
    }
    for (let c = 0; c < GRID_N * GRID_N; c++) start[c + 1] += start[c];
    // 채우기: cellStart 를 커서로 쓰고 다시 되돌린다.
    for (let i = 0; i < this.high; i++) {
      if (!this.alive[i]) continue;
      this.cellItems[start[this.cellOf[i]]++] = i;
    }
    for (let c = GRID_N * GRID_N; c > 0; c--) start[c] = start[c - 1];
    start[0] = 0;
  }

  /** 원 안의 적 인덱스를 out 에 담고 개수를 돌려준다(적의 반지름 포함). */
  queryCircle(x: number, z: number, r: number, out: Int16Array): number {
    const reach = r + MAX_RADIUS;
    const x0 = Math.max(0, Math.floor((x - reach + GRID_HALF) / CELL));
    const x1 = Math.min(GRID_N - 1, Math.floor((x + reach + GRID_HALF) / CELL));
    const z0 = Math.max(0, Math.floor((z - reach + GRID_HALF) / CELL));
    const z1 = Math.min(GRID_N - 1, Math.floor((z + reach + GRID_HALF) / CELL));
    let n = 0;
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = cz * GRID_N + cx;
        for (let k = this.cellStart[c]; k < this.cellStart[c + 1]; k++) {
          const i = this.cellItems[k];
          if (!this.alive[i]) continue;
          const dx = this.x[i] - x;
          const dz = this.z[i] - z;
          const rr = r + this.radius[i];
          if (dx * dx + dz * dz <= rr * rr && n < out.length) out[n++] = i;
        }
      }
    }
    return n;
  }

  /** 가장 가까운 적. skip 에 든 인덱스는 건너뛴다. 없으면 -1. */
  nearest(x: number, z: number, maxR: number, skip?: Set<number>): number {
    let best = -1;
    let bestD = maxR * maxR;
    for (let i = 0; i < this.high; i++) {
      if (!this.alive[i] || (skip && skip.has(i))) continue;
      const dx = this.x[i] - x;
      const dz = this.z[i] - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  update(dt: number, px: number, pz: number, playerRadius: number): void {
    this.time += dt;
    const k = feel.knockback;
    const friction = Math.max(0, 1 - k.friction * dt);
    const bound = balance.night.bounds + 8;
    this.rebuildGrid();
    for (let i = 0; i < this.high; i++) {
      if (!this.alive[i]) continue;
      this.age[i] += dt;
      if (this.flash[i] > 0) this.flash[i] = Math.max(0, this.flash[i] - dt / feel.flash.duration);
      if (this.touchCd[i] > 0) this.touchCd[i] -= dt;
      // 스쿼시 스프링 (튕기며 1 로 복귀)
      const sv = (this.squashV[i] += (1 - this.squash[i]) * k.squashRecover * 14 * dt);
      this.squashV[i] = sv * Math.max(0, 1 - 9 * dt);
      this.squash[i] += this.squashV[i] * dt;

      this.kx[i] *= friction;
      this.kz[i] *= friction;
      if (this.external[i]) continue;

      const def = enemyTypes[this.type[i]];
      let dx = px - this.x[i];
      let dz = pz - this.z[i];
      const dist = Math.hypot(dx, dz) || 0.0001;
      dx /= dist;
      dz /= dist;
      let move = this.speed[i];
      if (this.stun[i] > 0) {
        this.stun[i] -= dt;
        move = 0;
      } else if (this.flee) {
        dx = -dx;
        dz = -dz;
        move *= 1.6;
      } else if (def.ranged) {
        if (dist < def.ranged.range * 0.8) move = dist < def.ranged.range * 0.45 ? -this.speed[i] * 0.5 : 0;
        this.shootCd[i] -= dt;
        if (this.shootCd[i] <= 0 && dist < def.ranged.range) {
          this.shootCd[i] = def.ranged.cooldown;
          this.callbacks.onShoot(i);
        }
      }
      if (def.hop) {
        const hop = Math.abs(Math.sin(this.phase[i] * Math.PI * 2));
        this.y[i] = hop * 0.9;
        move *= 0.35 + hop * 1.1;
        if (hop < 0.12 && this.squash[i] > 0.9) this.squash[i] = 0.78;
      } else if (def.float) {
        this.y[i] = 1.0 + Math.sin(this.time * 3 + i) * 0.25;
        // 살짝 휘어 들어오는 궤도
        const side = Math.sin(this.time * 1.7 + i * 1.3) * 0.5;
        const ox = -dz * side;
        const oz = dx * side;
        dx += ox;
        dz += oz;
      }
      this.phase[i] = (this.phase[i] + (dt * (def.hop ? 1.5 : Math.max(0.4, Math.abs(move) / 2.4))) / 1) % 1;
      this.x[i] += (dx * move + this.kx[i]) * dt;
      this.z[i] += (dz * move + this.kz[i]) * dt;

      // 서로 겹치지 않게 밀어낸다 (주변 3×3 칸)
      const c = this.cellOf[i];
      const ccx = c % GRID_N;
      const ccz = (c - ccx) / GRID_N;
      for (let oz = -1; oz <= 1; oz++) {
        const nz = ccz + oz;
        if (nz < 0 || nz >= GRID_N) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const nx = ccx + ox;
          if (nx < 0 || nx >= GRID_N) continue;
          const cc = nz * GRID_N + nx;
          for (let q = this.cellStart[cc]; q < this.cellStart[cc + 1]; q++) {
            const j = this.cellItems[q];
            if (j === i || !this.alive[j]) continue;
            const ex = this.x[i] - this.x[j];
            const ez = this.z[i] - this.z[j];
            const rr = this.radius[i] + this.radius[j];
            const d2 = ex * ex + ez * ez;
            if (d2 < rr * rr && d2 > 1e-6) {
              const d = Math.sqrt(d2);
              const push = ((rr - d) / d) * 0.5 * (this.external[j] ? 2 : this.mass[j] / (this.mass[i] + this.mass[j]));
              this.x[i] += ex * push;
              this.z[i] += ez * push;
            }
          }
        }
      }
      // 고정 장애물
      for (const o of this.obstacles) {
        const ex = this.x[i] - o.x;
        const ez = this.z[i] - o.z;
        const rr = o.r + this.radius[i];
        if (Math.abs(ex) > rr || Math.abs(ez) > rr) continue;
        const d2 = ex * ex + ez * ez;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          this.x[i] = o.x + (ex / d) * rr;
          this.z[i] = o.z + (ez / d) * rr;
        }
      }
      if (this.x[i] > bound) this.x[i] = bound;
      else if (this.x[i] < -bound) this.x[i] = -bound;
      if (this.z[i] > bound) this.z[i] = bound;
      else if (this.z[i] < -bound) this.z[i] = -bound;

      // 바라보는 방향 (모델은 +Z 가 정면)
      const target = Math.atan2(dx, dz);
      let diff = target - this.angle[i];
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.angle[i] += diff * Math.min(1, dt * 8);

      if (this.touchCd[i] <= 0 && !this.flee) {
        const rr = this.radius[i] + playerRadius;
        if (dist < rr) {
          this.touchCd[i] = 0.7;
          this.callbacks.onTouch(i);
        }
      }
    }
  }

  /** 시뮬레이션 상태를 인스턴스 버퍼에 쓴다. */
  sync(): void {
    for (const r of this.renderers) r.n = 0;
    const sm = this.shadow.instanceMatrix.array as Float32Array;
    let sn = 0;
    for (let i = 0; i < this.high; i++) {
      if (!this.alive[i] || this.external[i]) continue;
      const r = this.renderers[this.type[i]];
      const n = r.n++;
      const grow = Math.min(1, this.age[i] / 0.25);
      const s = r.def.scale * (this.elite[i] ? eliteTuning.scaleMult : 1) * (0.2 + 0.8 * grow);
      const a = this.angle[i];
      const cos = Math.cos(a) * s;
      const sin = Math.sin(a) * s;
      const m = r.mesh.instanceMatrix.array as Float32Array;
      const o = n * 16;
      m[o] = cos; m[o + 1] = 0; m[o + 2] = -sin; m[o + 3] = 0;
      m[o + 4] = 0; m[o + 5] = s; m[o + 6] = 0; m[o + 7] = 0;
      m[o + 8] = sin; m[o + 9] = 0; m[o + 10] = cos; m[o + 11] = 0;
      m[o + 12] = this.x[i]; m[o + 13] = this.y[i]; m[o + 14] = this.z[i]; m[o + 15] = 1;
      const an = r.anim.array as Float32Array;
      const ao = n * 4;
      an[ao] = this.phase[i];
      an[ao + 1] = this.flash[i];
      an[ao + 2] = this.squash[i];
      const col = r.mesh.instanceColor!.array as Float32Array;
      tmpColor.copy(this.elite[i] ? eliteTint : r.tint);
      if (this.burn[i] > 0) tmpColor.lerp(burnTint, Math.min(1, this.burn[i]));
      col[n * 3] = tmpColor.r;
      col[n * 3 + 1] = tmpColor.g;
      col[n * 3 + 2] = tmpColor.b;

      const so = sn++ * 16;
      const ss = this.radius[i] * 2.4 * (1 - Math.min(0.5, this.y[i] * 0.3));
      sm[so] = ss; sm[so + 1] = 0; sm[so + 2] = 0; sm[so + 3] = 0;
      sm[so + 4] = 0; sm[so + 5] = 1; sm[so + 6] = 0; sm[so + 7] = 0;
      sm[so + 8] = 0; sm[so + 9] = 0; sm[so + 10] = ss; sm[so + 11] = 0;
      sm[so + 12] = this.x[i]; sm[so + 13] = 0.05; sm[so + 14] = this.z[i]; sm[so + 15] = 1;
    }
    for (const r of this.renderers) {
      r.mesh.count = r.n;
      if (r.n > 0) {
        r.mesh.instanceMatrix.needsUpdate = true;
        r.anim.needsUpdate = true;
        r.mesh.instanceColor!.needsUpdate = true;
      }
    }
    this.shadow.count = sn;
    if (sn > 0) this.shadow.instanceMatrix.needsUpdate = true;
  }

  typeDef(i: number): EnemyTypeDef {
    return enemyTypes[this.type[i]];
  }

  clear(): void {
    for (let i = 0; i < this.high; i++) if (this.alive[i]) this.remove(i);
    this.flee = false;
  }

  dispose(): void {
    for (const r of this.renderers) {
      r.mesh.geometry.dispose();
      (r.mesh.material as THREE.Material).dispose();
    }
    for (const v of this.vats) v.texture.dispose();
    this.shadow.geometry.dispose();
    (this.shadow.material as THREE.Material).dispose();
  }
}

import * as THREE from 'three';
import { assets } from '../core/assets';
import { audio } from '../audio/audio';
import { evolutionById, feel, weaponById, type EvolutionDef, type WeaponDef, type WeaponKind, type WeaponStats } from '../data';
import { makeWhirl, type BeamHandle, type DecalHandle } from '../vfx/fx';
import { SPR } from '../vfx/particles';
import type { NightContext } from './context';
import { WEAPON_SLOTS } from './enemies';

interface Projectile {
  mesh: THREE.Object3D;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** 부메랑: 0 나가는 중, 1 돌아오는 중 */
  phase: number;
  travelled: number;
  bounces: number;
  life: number;
  target: number;
  last: number;
}

interface Zone {
  x: number;
  z: number;
  r: number;
  life: number;
  tick: number;
  decal: DecalHandle | null;
  explode: number;
  damage: number;
}

export interface OwnedWeapon {
  id: string;
  def: WeaponDef;
  evo: EvolutionDef | null;
  level: number;
  kind: WeaponKind;
  stats: WeaponStats;
  color: number;
  slot: number;
  timer: number;
  // 종류별 상태
  active: number;
  angle: number;
  tick: number;
  aux: number;
  whirls: THREE.Mesh[];
  beams: BeamHandle[];
  projectiles: Projectile[];
  zones: Zone[];
  pending: { at: number; fn: () => void }[];
}

const hexToInt = (hex: string): number => parseInt(hex.slice(1), 16);
const query = new Int16Array(512);

/** 자동 공격 무기 8종 + 진화. 수치는 weapons.json, 동작은 kind 별 함수. */
export class WeaponSystem {
  readonly owned: OwnedWeapon[] = [];
  private boneGeo: THREE.BufferGeometry | null = null;
  private boneMat: THREE.Material | null = null;
  private goldMat: THREE.Material | null = null;
  private readonly ballGeo = new THREE.IcosahedronGeometry(0.38, 1);

  constructor(private readonly ctx: NightContext) {}

  get(id: string): OwnedWeapon | undefined {
    return this.owned.find((w) => w.id === id);
  }

  add(id: string): OwnedWeapon {
    const def = weaponById.get(id)!;
    const w: OwnedWeapon = {
      id,
      def,
      evo: null,
      level: 1,
      kind: def.kind,
      stats: def.levels[0],
      color: hexToInt(def.color),
      slot: this.owned.length % WEAPON_SLOTS,
      timer: 0.4,
      active: 0,
      angle: 0,
      tick: 0,
      aux: 0,
      whirls: [],
      beams: [],
      projectiles: [],
      zones: [],
      pending: [],
    };
    this.owned.push(w);
    return w;
  }

  levelUp(id: string): void {
    const w = this.get(id);
    if (!w || w.evo) return;
    w.level = Math.min(w.def.levels.length, w.level + 1);
    w.stats = w.def.levels[w.level - 1];
  }

  evolve(id: string): void {
    const w = this.get(id);
    if (!w) return;
    const evo = evolutionById.get(w.def.evolve.into);
    if (!evo) return;
    w.evo = evo;
    w.stats = evo.stats;
    w.color = hexToInt(evo.color);
    w.timer = 0.2;
    this.resetState(w);
  }

  private resetState(w: OwnedWeapon): void {
    for (const m of w.whirls) m.visible = false;
    for (const b of w.beams) this.ctx.fx.releaseBeam(b);
    w.beams.length = 0;
    w.active = 0;
  }

  private area(w: OwnedWeapon): number {
    return w.stats.area * this.ctx.player.areaMult;
  }

  update(dt: number): void {
    const p = this.ctx.player;
    p.speedBoost = 0;
    p.dashInvuln = false;
    for (const w of this.owned) {
      for (let k = w.pending.length - 1; k >= 0; k--) {
        if (this.ctx.time >= w.pending[k].at) {
          w.pending[k].fn();
          w.pending.splice(k, 1);
        }
      }
      switch (w.kind) {
        case 'nova':
          if ((w.timer -= dt) <= 0) {
            w.timer = w.stats.cooldown * p.cooldownMult;
            this.fireNova(w);
          }
          break;
        case 'orbit':
          this.updateOrbit(w, dt);
          break;
        case 'beam':
          this.updateBeam(w, dt);
          break;
        case 'boomerang':
        case 'bounce':
          if ((w.timer -= dt) <= 0) {
            w.timer = w.stats.cooldown * p.cooldownMult;
            this.fireProjectiles(w);
          }
          this.updateProjectiles(w, dt);
          break;
        case 'zone':
          this.updateZones(w, dt);
          break;
        case 'chain':
          if ((w.timer -= dt) <= 0) {
            w.timer = w.stats.cooldown * p.cooldownMult;
            this.fireChain(w);
          }
          break;
        case 'dash':
          this.updateDash(w, dt);
          break;
      }
    }
  }

  // ---------- 짖기 충격파 ----------
  private fireNova(w: OwnedWeapon): void {
    const { ctx } = this;
    const p = ctx.player;
    const s = w.stats;
    const rings = s.rings ?? 1;
    const blast = (radius: number, damage: number): void => {
      const n = ctx.enemies.queryCircle(p.x, p.z, radius, query);
      for (let k = 0; k < n; k++) {
        const i = query[k];
        const dx = ctx.enemies.x[i] - p.x;
        const dz = ctx.enemies.z[i] - p.z;
        const d = Math.hypot(dx, dz) || 1;
        ctx.hit(i, damage, dx / d, dz / d, s.knockback, { color: w.color, stun: s.stun, heavy: !!w.evo });
      }
      ctx.fx.ring(p.x, p.z, radius, w.color, 0.42, 0.2, 0.03);
      ctx.particles.burst(p.x, 0.5, p.z, 12, radius * 2.2, 0.35, 0.45, w.color, 1.4, SPR.spark, 1, 0, 3, 0.15);
      ctx.rig.addTrauma(feel.shake.nova * (w.evo ? 1.8 : 1));
      ctx.rig.punch(feel.camera.fovPunch.nova * (w.evo ? 2 : 1));
    };
    const r = this.area(w);
    blast(r, s.damage);
    audio.synth('bark', { volume: 0.7, rate: w.evo ? 0.8 : 1 });
    audio.synth('thump', { volume: 0.35 });
    p.dog.root.scale.set(1.18, 0.88, 1.18);
    for (let k = 1; k < rings; k++) {
      w.pending.push({ at: ctx.time + 0.16 * k, fn: () => blast(r * (1 + 0.22 * k), s.damage * 0.6) });
    }
    if (s.bolts) {
      // 진화: 주변 적에게 낙뢰
      const n = ctx.enemies.queryCircle(p.x, p.z, r * 1.4, query);
      const picks = Math.min(s.bolts, n);
      for (let k = 0; k < picks; k++) {
        const i = query[Math.floor(ctx.rng.next() * n)];
        const ex = ctx.enemies.x[i];
        const ez = ctx.enemies.z[i];
        w.pending.push({
          at: ctx.time + 0.08 + k * 0.07,
          fn: () => {
            ctx.fx.bolt(ex + ctx.rng.range(-1, 1), 14, ez - 2, ex, 0.4, ez, 0xfff7c2, 0.2, 0.3, 1.1);
            ctx.fx.ring(ex, ez, 2.2, 0xfff7c2, 0.3, 0.3, 0.08);
            const m = ctx.enemies.queryCircle(ex, ez, 2.2, query);
            for (let q = 0; q < m; q++) ctx.hit(query[q], s.damage * 0.8, 0, 0, 2, { color: 0xfff7c2, stun: s.stun });
            audio.synth('zap', { volume: 0.5, pan: ctx.pan(ex) });
          },
        });
      }
    }
  }

  // ---------- 꼬리 회오리 ----------
  private updateOrbit(w: OwnedWeapon, dt: number): void {
    const { ctx } = this;
    const p = ctx.player;
    const s = w.stats;
    const count = s.count ?? 1;
    while (w.whirls.length < count) {
      const m = makeWhirl(w.color);
      m.visible = false;
      ctx.layer.add(m);
      w.whirls.push(m);
    }
    const permanent = (s.duration ?? 0) > 100;
    if (w.active <= 0 && !permanent) {
      if ((w.timer -= dt) <= 0) {
        w.active = s.duration ?? 3;
        w.timer = s.cooldown * p.cooldownMult;
        audio.synth('whoosh', { volume: 0.5 });
      }
    }
    const on = permanent || w.active > 0;
    if (!on) {
      for (const m of w.whirls) m.visible = false;
      return;
    }
    w.active -= dt;
    w.angle += dt * 3.4;
    const r = this.area(w);
    const fade = permanent ? 1 : Math.min(1, w.active / 0.3, ((s.duration ?? 3) - w.active) / 0.25);
    for (let k = 0; k < w.whirls.length; k++) {
      const m = w.whirls[k];
      m.visible = k < count;
      if (!m.visible) continue;
      const a = w.angle + (k / count) * Math.PI * 2;
      const wx = p.x + Math.cos(a) * r;
      const wz = p.z + Math.sin(a) * r;
      m.position.set(wx, 0, wz);
      m.rotation.y = -ctx.time * 9;
      const sc = (w.evo ? 1.35 : 1) * Math.max(0.05, fade);
      m.scale.set(sc, sc, sc);
      const mat = m.material as THREE.ShaderMaterial;
      mat.uniforms.uTime.value = ctx.time;
      mat.uniforms.uAlpha.value = fade;
      (mat.uniforms.uColor.value as THREE.Color).set(w.color);
      if (ctx.rng.chance(0.5)) ctx.particles.emit(wx + ctx.rng.range(-0.4, 0.4), 0.2, wz + ctx.rng.range(-0.4, 0.4), 0, 2.5, 0, 0.4, 0.22, 0, w.color, 1.2, 0.7, SPR.soft, 1);
      const n = ctx.enemies.queryCircle(wx, wz, 1.05 * sc, query);
      for (let q = 0; q < n; q++) {
        const i = query[q];
        const li = i * WEAPON_SLOTS + w.slot;
        if (s.pull) {
          ctx.enemies.kx[i] += ((wx - ctx.enemies.x[i]) * s.pull * dt) / Math.max(0.5, ctx.enemies.mass[i]);
          ctx.enemies.kz[i] += ((wz - ctx.enemies.z[i]) * s.pull * dt) / Math.max(0.5, ctx.enemies.mass[i]);
        }
        if (ctx.time - ctx.enemies.lastHit[li] < (s.tick ?? 0.45)) continue;
        ctx.enemies.lastHit[li] = ctx.time;
        const dx = ctx.enemies.x[i] - p.x;
        const dz = ctx.enemies.z[i] - p.z;
        const d = Math.hypot(dx, dz) || 1;
        ctx.hit(i, s.damage, dx / d, dz / d, s.pull ? 0 : s.knockback, { color: w.color, quiet: true });
      }
    }
  }

  // ---------- 레이저 눈빛 ----------
  private beamDamage(w: OwnedWeapon, x0: number, z0: number, dirX: number, dirZ: number, len: number, width: number, damage: number, tick: boolean): void {
    const { ctx } = this;
    const e = ctx.enemies;
    const half = width / 2;
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i]) continue;
      const rx = e.x[i] - x0;
      const rz = e.z[i] - z0;
      const along = rx * dirX + rz * dirZ;
      if (along < -e.radius[i] || along > len + e.radius[i]) continue;
      const perp = Math.abs(rx * -dirZ + rz * dirX);
      if (perp > half + e.radius[i]) continue;
      if (tick) {
        const li = i * WEAPON_SLOTS + w.slot;
        if (ctx.time - e.lastHit[li] < (w.stats.tick ?? 0.15)) continue;
        e.lastHit[li] = ctx.time;
      }
      ctx.hit(i, damage, dirX, dirZ, w.stats.knockback, { color: w.color, quiet: tick });
    }
  }

  private updateBeam(w: OwnedWeapon, dt: number): void {
    const { ctx } = this;
    const p = ctx.player;
    const s = w.stats;
    const len = this.area(w);
    const width = s.width ?? 0.8;
    const eyeY = 0;
    if (s.sweep) {
      // 진화: 두 줄기 광선이 주위를 쓸고 지나간다.
      if (w.active <= 0) {
        if ((w.timer -= dt) <= 0) {
          w.active = s.sweep;
          w.timer = s.cooldown * p.cooldownMult;
          const t = ctx.enemies.nearest(p.x, p.z, 30);
          w.angle = t >= 0 ? Math.atan2(ctx.enemies.z[t] - p.z, ctx.enemies.x[t] - p.x) : p.facing;
          for (let k = 0; k < (s.count ?? 2); k++) w.beams.push(ctx.fx.beam(p.x, p.z, p.x, p.z, width * 1.6, w.color, 1, true));
          audio.synth('laser', { volume: 0.6, rate: 0.7 });
        }
        return;
      }
      w.active -= dt;
      w.angle += dt * 2.8;
      w.beams.forEach((b, k) => {
        const a = w.angle + (k / w.beams.length) * Math.PI * 2;
        const dx = Math.cos(a);
        const dz = Math.sin(a);
        ctx.fx.moveBeam(b, p.x + dx * 0.6, p.z + dz * 0.6, p.x + dx * len, p.z + dz * len, width * 1.6);
        this.beamDamage(w, p.x, p.z, dx, dz, len, width, s.damage, true);
        if (ctx.rng.chance(0.4)) ctx.particles.emit(p.x + dx * len * ctx.rng.next(), 0.5 + eyeY, p.z + dz * len * ctx.rng.next(), 0, 2, 0, 0.3, 0.3, 0, w.color, 3, 1, SPR.spark, 1);
      });
      if (w.active <= 0) {
        for (const b of w.beams) ctx.fx.releaseBeam(b);
        w.beams.length = 0;
      }
      return;
    }
    if ((w.timer -= dt) > 0) return;
    const first = ctx.enemies.nearest(p.x, p.z, len + 4);
    if (first < 0) {
      w.timer = 0.25;
      return;
    }
    w.timer = s.cooldown * p.cooldownMult;
    const used = new Set<number>();
    let target = first;
    for (let k = 0; k < (s.count ?? 1) && target >= 0; k++) {
      used.add(target);
      let dx = ctx.enemies.x[target] - p.x;
      let dz = ctx.enemies.z[target] - p.z;
      const d = Math.hypot(dx, dz) || 1;
      dx /= d;
      dz /= d;
      ctx.fx.beam(p.x + dx * 0.7, p.z + dz * 0.7, p.x + dx * len, p.z + dz * len, width * 1.5, w.color, 0.24);
      this.beamDamage(w, p.x, p.z, dx, dz, len, width, s.damage, false);
      ctx.particles.burst(p.x + dx * 0.9, 0.9, p.z + dz * 0.9, 6, 5, 0.25, 0.3, w.color, 3, SPR.spark, 1);
      // 두 번째 광선은 다른 방향의 적을 고른다.
      target = -1;
      let best = 1e9;
      for (let i = 0; i < ctx.enemies.high; i++) {
        if (!ctx.enemies.alive[i] || used.has(i)) continue;
        const ex = ctx.enemies.x[i] - p.x;
        const ez = ctx.enemies.z[i] - p.z;
        const ed = Math.hypot(ex, ez);
        if (ed > len + 4 || (ex * dx + ez * dz) / (ed || 1) > 0.5) continue;
        if (ed < best) {
          best = ed;
          target = i;
        }
      }
    }
    p.dog.eyeTarget = 1;
    w.pending.push({ at: ctx.time + 0.3, fn: () => (p.dog.eyeTarget = p.awakened ? 1 : 0) });
    audio.synth('laser', { volume: 0.55 });
    ctx.rig.addTrauma(0.08);
  }

  // ---------- 뼈다귀 부메랑 / 튕기는 공 ----------
  private makeProjectileMesh(w: OwnedWeapon): THREE.Object3D {
    if (w.kind === 'boomerang') {
      if (!this.boneGeo) {
        this.boneGeo = assets.geometries('kaykit-halloween', 'bone_A')[0];
        this.boneGeo.center();
        const base = assets.kitMaterial('kaykit-halloween');
        this.boneMat = new THREE.MeshBasicMaterial({ map: base.map, color: new THREE.Color(1.5, 1.5, 1.45) });
        this.goldMat = new THREE.MeshBasicMaterial({ map: base.map, color: new THREE.Color(2.0, 1.5, 0.4) });
      }
      const m = new THREE.Mesh(this.boneGeo, w.evo ? this.goldMat! : this.boneMat!);
      m.scale.setScalar(1.8 * (w.stats.size ?? 1));
      return m;
    }
    const m = new THREE.Mesh(this.ballGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(w.color).multiplyScalar(w.evo ? 2.6 : 1.7) }));
    m.scale.setScalar(w.evo ? 1.5 : 1);
    return m;
  }

  private fireProjectiles(w: OwnedWeapon): void {
    const { ctx } = this;
    const p = ctx.player;
    const s = w.stats;
    const count = s.count ?? 1;
    const range = this.area(w);
    const used = new Set<number>();
    for (let k = 0; k < count; k++) {
      const t = ctx.enemies.nearest(p.x, p.z, range + 6, used);
      let dx: number;
      let dz: number;
      if (t >= 0) {
        used.add(t);
        dx = ctx.enemies.x[t] - p.x;
        dz = ctx.enemies.z[t] - p.z;
      } else if (k === 0) {
        w.timer = 0.3;
        return;
      } else {
        const a = p.facing + (k - (count - 1) / 2) * 0.6;
        dx = Math.sin(a);
        dz = Math.cos(a);
      }
      const d = Math.hypot(dx, dz) || 1;
      let proj = w.projectiles.find((q) => q.life <= 0);
      if (!proj) {
        proj = { mesh: this.makeProjectileMesh(w), x: 0, z: 0, vx: 0, vz: 0, phase: 0, travelled: 0, bounces: 0, life: 0, target: -1, last: -1 };
        ctx.layer.add(proj.mesh);
        w.projectiles.push(proj);
      }
      const sp = s.speed ?? 16;
      proj.x = p.x;
      proj.z = p.z;
      proj.vx = (dx / d) * sp;
      proj.vz = (dz / d) * sp;
      proj.phase = 0;
      proj.travelled = 0;
      proj.bounces = s.bounces ?? 0;
      proj.life = w.kind === 'bounce' ? 3.5 : 5;
      proj.target = t;
      proj.last = -1;
      proj.mesh.visible = true;
    }
    if (w.kind === 'boomerang') audio.synth('whoosh', { volume: 0.4, rate: 1.5 });
    else audio.synth('squeak', { volume: 0.5 });
  }

  private updateProjectiles(w: OwnedWeapon, dt: number): void {
    const { ctx } = this;
    const p = ctx.player;
    const e = ctx.enemies;
    const s = w.stats;
    const range = this.area(w);
    const speed = s.speed ?? 16;
    const hitR = w.kind === 'boomerang' ? 0.75 * (s.size ?? 1) : 0.55;
    for (const proj of w.projectiles) {
      if (proj.life <= 0) continue;
      proj.life -= dt;
      if (w.kind === 'boomerang') {
        if (proj.phase === 0 && proj.travelled >= range) proj.phase = 1;
        if (proj.phase === 1) {
          const dx = p.x - proj.x;
          const dz = p.z - proj.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.9) {
            proj.life = 0;
            proj.mesh.visible = false;
            continue;
          }
          const k = Math.min(1, dt * 9);
          proj.vx += ((dx / d) * speed * 1.25 - proj.vx) * k;
          proj.vz += ((dz / d) * speed * 1.25 - proj.vz) * k;
        } else {
          // 나갈수록 느려졌다가 돌아온다.
          const slow = 1 - 0.55 * Math.min(1, proj.travelled / range);
          const sp = Math.hypot(proj.vx, proj.vz) || 1;
          proj.vx = (proj.vx / sp) * speed * slow;
          proj.vz = (proj.vz / sp) * speed * slow;
        }
        proj.mesh.rotation.y += dt * 22;
      } else if (proj.target >= 0 && e.alive[proj.target]) {
        const dx = e.x[proj.target] - proj.x;
        const dz = e.z[proj.target] - proj.z;
        const d = Math.hypot(dx, dz) || 1;
        proj.vx = (dx / d) * speed;
        proj.vz = (dz / d) * speed;
      }
      const step = Math.hypot(proj.vx, proj.vz) * dt;
      proj.x += proj.vx * dt;
      proj.z += proj.vz * dt;
      proj.travelled += step;
      proj.mesh.position.set(proj.x, w.kind === 'bounce' ? 0.8 + Math.abs(Math.sin(ctx.time * 12)) * 0.5 : 0.9, proj.z);
      if (ctx.rng.chance(0.7)) {
        ctx.particles.emit(proj.x, 0.8, proj.z, 0, 0.4, 0, 0.28, w.kind === 'bounce' ? 0.5 : 0.36, 0, w.color, w.evo ? 3 : 1.6, 0.7, w.evo && w.kind === 'bounce' ? SPR.flame : SPR.soft, 1);
      }
      const n = e.queryCircle(proj.x, proj.z, hitR, query);
      for (let q = 0; q < n; q++) {
        const i = query[q];
        if (w.kind === 'boomerang') {
          const li = i * WEAPON_SLOTS + w.slot;
          if (ctx.time - e.lastHit[li] < 0.3) continue;
          e.lastHit[li] = ctx.time;
          const sp = Math.hypot(proj.vx, proj.vz) || 1;
          ctx.hit(i, s.damage, proj.vx / sp, proj.vz / sp, s.knockback, { color: w.color, critBonus: s.critBonus, heavy: !!w.evo });
        } else {
          if (i === proj.last) continue;
          const sp = Math.hypot(proj.vx, proj.vz) || 1;
          ctx.hit(i, s.damage, proj.vx / sp, proj.vz / sp, s.knockback, { color: w.color });
          if (s.explodeRadius) {
            ctx.fx.ring(proj.x, proj.z, s.explodeRadius, w.color, 0.3, 0.3, 0.06);
            ctx.particles.burst(proj.x, 0.6, proj.z, 8, 7, 0.4, 0.5, 0xff9a3c, 1.5, SPR.flame, 1, -3, 2);
            const m = e.queryCircle(proj.x, proj.z, s.explodeRadius, query);
            for (let r = 0; r < m; r++) if (query[r] !== i) ctx.hit(query[r], s.damage * 0.6, 0, 0, 3, { color: 0xff9a3c, quiet: true });
            ctx.rig.addTrauma(feel.shake.explosion * 0.5, proj.x, proj.z);
            audio.synth('boom', { volume: 0.25, rate: 1.6, pan: ctx.pan(proj.x) });
          }
          audio.synth('squeak', { volume: 0.3, pan: ctx.pan(proj.x) });
          proj.last = i;
          proj.bounces--;
          if (proj.bounces < 0) {
            proj.life = 0;
            proj.mesh.visible = false;
          } else {
            const skip = new Set<number>([i]);
            proj.target = e.nearest(proj.x, proj.z, 10, skip);
            if (proj.target < 0) proj.life = Math.min(proj.life, 0.5);
          }
          break;
        }
      }
      if (proj.life <= 0) proj.mesh.visible = false;
    }
  }

  // ---------- 발바닥 낙인 ----------
  private updateZones(w: OwnedWeapon, dt: number): void {
    const { ctx } = this;
    const p = ctx.player;
    const e = ctx.enemies;
    const s = w.stats;
    if ((w.timer -= dt) <= 0) {
      w.timer = s.cooldown * p.cooldownMult;
      const r = this.area(w);
      const used = new Set<number>();
      for (let k = 0; k < (s.count ?? 1); k++) {
        const t = e.nearest(p.x, p.z, 12, used);
        let zx = p.x + ctx.rng.range(-4, 4);
        let zz = p.z + ctx.rng.range(-4, 4);
        if (t >= 0) {
          used.add(t);
          zx = e.x[t];
          zz = e.z[t];
        }
        const decal = ctx.fx.decal(zx, zz, r, w.color, s.duration ?? 3, SPR.paw, ctx.rng.range(0, 6.28));
        w.zones.push({ x: zx, z: zz, r, life: s.duration ?? 3, tick: 0, decal, explode: s.explode ?? 0, damage: s.damage });
        ctx.fx.ring(zx, zz, r, w.color, 0.3, 0.3, 0.04);
        ctx.particles.burst(zx, 0.3, zz, 6, 4, 0.4, 0.45, w.color, 1.3, SPR.flame, 1, -2, 2);
      }
      audio.synth('fire', { volume: 0.5 });
    }
    if (s.trail) {
      // 진화: 걷는 자리에 불길이 남는다.
      w.aux -= dt;
      if (w.aux <= 0 && Math.hypot(p.vx, p.vz) > 2) {
        w.aux = 0.22;
        w.zones.push({ x: p.x, z: p.z, r: 1.3, life: 1.6, tick: 0, decal: null, explode: 0, damage: s.damage * 0.7 });
      }
    }
    for (let k = w.zones.length - 1; k >= 0; k--) {
      const z = w.zones[k];
      z.life -= dt;
      z.tick -= dt;
      if (ctx.rng.chance(z.decal ? 0.55 : 0.35)) {
        const a = ctx.rng.range(0, 6.28);
        const rr = z.r * Math.sqrt(ctx.rng.next());
        ctx.particles.emit(z.x + Math.cos(a) * rr, 0.15, z.z + Math.sin(a) * rr, 0, ctx.rng.range(1.5, 3.2), 0, 0.5, 0.5, 0.05, ctx.rng.chance(0.5) ? w.color : 0xffd166, 1.1, 0.7, SPR.flame, 1);
      }
      if (z.tick <= 0) {
        z.tick = s.tick ?? 0.4;
        const n = e.queryCircle(z.x, z.z, z.r, query);
        for (let q = 0; q < n; q++) {
          const i = query[q];
          e.burn[i] = 1;
          ctx.hit(i, z.damage, 0, 0, 0, { color: w.color, quiet: true });
        }
      }
      if (z.life <= 0) {
        if (z.explode > 0) {
          ctx.fx.ring(z.x, z.z, z.r * 1.4, 0xffb347, 0.35, 0.3, 0.08);
          ctx.particles.burst(z.x, 0.5, z.z, 12, 9, 0.5, 0.6, 0xff7a1f, 1.5, SPR.flame, 1, -4, 2);
          const n = e.queryCircle(z.x, z.z, z.r * 1.4, query);
          for (let q = 0; q < n; q++) {
            const i = query[q];
            const dx = e.x[i] - z.x;
            const dz = e.z[i] - z.z;
            const d = Math.hypot(dx, dz) || 1;
            ctx.hit(i, z.explode, dx / d, dz / d, 7, { color: 0xffb347, heavy: true });
          }
          ctx.rig.addTrauma(feel.shake.explosion, z.x, z.z);
          audio.synth('boom', { volume: 0.4, pan: ctx.pan(z.x) });
        }
        w.zones.splice(k, 1);
      }
    }
  }

  // ---------- 정전기 털 (연쇄 번개) ----------
  private fireChain(w: OwnedWeapon): void {
    const { ctx } = this;
    const p = ctx.player;
    const e = ctx.enemies;
    const s = w.stats;
    const used = new Set<number>();
    let fired = false;
    for (let c = 0; c < (s.count ?? 1); c++) {
      let t = e.nearest(p.x, p.z, this.area(w), used);
      if (t < 0) break;
      fired = true;
      let fx = p.x;
      let fy = 1.0;
      let fz = p.z;
      for (let j = 0; j <= (s.jumps ?? 2) && t >= 0; j++) {
        used.add(t);
        const tx = e.x[t];
        const tz = e.z[t];
        ctx.fx.bolt(fx, fy, fz, tx, 0.9, tz, w.color, 0.18, 0.2, 0.8);
        ctx.particles.burst(tx, 0.9, tz, 5, 5, 0.25, 0.3, w.color, 3, SPR.spark, 1);
        const dx = tx - fx;
        const dz = tz - fz;
        const d = Math.hypot(dx, dz) || 1;
        ctx.hit(t, s.damage * Math.pow(0.9, j), dx / d, dz / d, s.knockback, { color: w.color, stun: s.stun });
        fx = tx;
        fy = 0.9;
        fz = tz;
        t = e.nearest(fx, fz, 6.5, used);
      }
    }
    if (fired) {
      audio.synth('zap', { volume: 0.55 });
      ctx.rig.addTrauma(0.1);
    } else {
      w.timer = 0.3;
    }
  }

  // ---------- 우다다 (폭주 대시) ----------
  private updateDash(w: OwnedWeapon, dt: number): void {
    const { ctx } = this;
    const p = ctx.player;
    const e = ctx.enemies;
    const s = w.stats;
    if (w.active <= 0) {
      if ((w.timer -= dt) <= 0) {
        w.active = s.duration ?? 2;
        w.timer = s.cooldown * p.cooldownMult;
        audio.synth('whoosh', { volume: 0.7, rate: 0.8 });
        ctx.rig.punch(3);
        p.dog.root.scale.set(0.85, 1.1, 1.3);
      }
      return;
    }
    w.active -= dt;
    p.speedBoost = s.speedBoost ?? 0.45;
    p.dashInvuln = !!s.invuln;
    w.aux -= dt;
    if (w.aux <= 0) {
      // 잔상: 개 실루엣 스프라이트
      w.aux = 0.045;
      const dirScreen = Math.atan2(-p.vz, p.vx);
      ctx.particles.emit(p.x, 0.75, p.z, 0, 0, 0, 0.32, 2.3, 2.0, w.color, 1.8, 0.55, SPR.dog, 1, 0, 0, dirScreen, 0);
      ctx.particles.emit(p.x + ctx.rng.range(-0.3, 0.3), 0.15, p.z + ctx.rng.range(-0.3, 0.3), 0, 1.2, 0, 0.4, 0.5, 0.9, 0xcfd8e8, 0.6, 0.35, SPR.smoke, 0);
    }
    w.tick -= dt;
    if (w.tick <= 0) {
      w.tick = s.tick ?? 0.25;
      const r = this.area(w);
      const n = e.queryCircle(p.x, p.z, r, query);
      for (let q = 0; q < n; q++) {
        const i = query[q];
        const dx = e.x[i] - p.x;
        const dz = e.z[i] - p.z;
        const d = Math.hypot(dx, dz) || 1;
        ctx.hit(i, s.damage, dx / d, dz / d, s.knockback, { color: w.color });
      }
    }
    if (w.active <= 0 && s.endNova) {
      const r = this.area(w) * 2.6;
      ctx.fx.ring(p.x, p.z, r, w.color, 0.45, 0.22, 0.05);
      const n = e.queryCircle(p.x, p.z, r, query);
      for (let q = 0; q < n; q++) {
        const i = query[q];
        const dx = e.x[i] - p.x;
        const dz = e.z[i] - p.z;
        const d = Math.hypot(dx, dz) || 1;
        ctx.hit(i, s.endNova, dx / d, dz / d, 14, { color: w.color, heavy: true });
      }
      ctx.rig.addTrauma(feel.shake.explosion);
      ctx.rig.punch(feel.camera.fovPunch.heavy);
      audio.synth('boom', { volume: 0.5 });
    }
  }

  dispose(): void {
    for (const w of this.owned) {
      for (const m of w.whirls) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
      for (const proj of w.projectiles) {
        const mesh = proj.mesh as THREE.Mesh;
        if (mesh.geometry !== this.boneGeo && mesh.geometry !== this.ballGeo) mesh.geometry?.dispose();
        if (w.kind === 'bounce') (mesh.material as THREE.Material).dispose();
      }
    }
    this.boneGeo?.dispose();
    this.boneMat?.dispose();
    this.goldMat?.dispose();
    this.ballGeo.dispose();
  }
}

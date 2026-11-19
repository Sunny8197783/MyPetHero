import * as THREE from 'three';
import { assets } from '../core/assets';
import { audio } from '../audio/audio';
import { bossTuning, feel, type BossDef } from '../data';
import { Aura, type BeamHandle } from '../vfx/fx';
import { SPR } from '../vfx/particles';
import type { NightContext } from './context';
import { patchCharacterMaterial, type CharacterShading } from './vat';

type Mode = 'intro' | 'chase' | 'windup-charge' | 'charge' | 'windup-slam' | 'jump' | 'cast' | 'dead';

const hex = (s: string): number => parseInt(s.slice(1), 16);

/** 매 밤 마지막에 나오는 보스. 적 슬롯 하나를 차지해 무기 판정을 받고, 이동·공격·연출은 여기서 한다. */
export class Boss {
  readonly root = new THREE.Group();
  readonly index: number;
  readonly glow: number;
  x: number;
  z: number;
  y = 0;
  mode: Mode = 'intro';
  dead = false;

  private readonly shadings: CharacterShading[] = [];
  private readonly mixer: THREE.AnimationMixer | null = null;
  private readonly clips = new Map<string, THREE.AnimationClip>();
  private currentClip = '';
  private readonly visual: THREE.Object3D;
  private readonly aura: Aura;
  private readonly coreParts: THREE.Mesh[] = [];
  private timer = 1.8;
  private attackCd = 2.2;
  private castCd = 2;
  private summonCd = bossTuning.summonCooldown;
  private contactCd = 0;
  private dirX = 0;
  private dirZ = 1;
  private targetX = 0;
  private targetZ = 0;
  private fromX = 0;
  private fromZ = 0;
  private telegraph: BeamHandle | null = null;
  private spiral = 0;
  private spiralCd = 0;
  private facing = 0;
  private hopPhase = 0;
  private alt = 0;
  private deathT = 0;
  private readonly scale: number;

  constructor(private readonly ctx: NightContext, readonly def: BossDef, x: number, z: number) {
    this.x = x;
    this.z = z;
    this.glow = hex(def.glow);
    this.scale = def.scale;
    this.index = ctx.enemies.spawnExternal(x, z, def.hp, def.radius, 40, def.damage);

    if (def.kind === 'skinned') {
      const { root, clips } = assets.skinned(`kaykit-skeletons/${def.visual}.glb`);
      this.visual = root;
      this.clips = clips;
      this.mixer = new THREE.AnimationMixer(root);
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.frustumCulled = false;
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mat.color.multiply(new THREE.Color(def.tint));
        mesh.material = mat;
        this.shadings.push(patchCharacterMaterial(mat, this.glow, 1.4));
      });
    } else if (def.kind === 'prop') {
      this.visual = assets.model('kaykit-halloween', def.visual);
      this.visual.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = (mesh.material as THREE.MeshLambertMaterial).clone();
        mat.emissive = new THREE.Color(this.glow);
        mat.emissiveIntensity = 0.25;
        mesh.material = mat;
        mesh.castShadow = false;
        this.shadings.push(patchCharacterMaterial(mat, this.glow, 1.2));
      });
    } else {
      // 운석 핵: 빛나는 결정 + 주위를 도는 파편
      const g = new THREE.Group();
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(this.glow).multiplyScalar(2.6) }));
      core.position.y = 1.3;
      g.add(core);
      this.coreParts.push(core);
      const shell = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.0, 1),
        new THREE.MeshLambertMaterial({ color: 0x1b2a4a, emissive: new THREE.Color(this.glow), emissiveIntensity: 0.5, flatShading: true, transparent: true, opacity: 0.82 }),
      );
      shell.position.y = 1.3;
      g.add(shell);
      this.coreParts.push(shell);
      this.shadings.push(patchCharacterMaterial(shell.material as THREE.MeshLambertMaterial, this.glow, 2.0));
      for (let k = 0; k < 6; k++) {
        const shard = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(this.glow).multiplyScalar(1.8) }));
        g.add(shard);
        this.coreParts.push(shard);
      }
      this.visual = g;
    }
    this.visual.scale.setScalar(0.01);
    this.root.add(this.visual);
    this.aura = new Aura(this.glow, def.radius * 1.25);
    this.aura.mesh.position.y = def.radius * 0.9;
    this.aura.target = 0.55;
    this.root.add(this.aura.mesh);
    this.root.position.set(x, 0, z);
    this.play('Taunt');
    audio.synth('boom', { volume: 0.6, rate: 0.7 });
    ctx.fx.ring(x, z, def.radius * 4, this.glow, 0.8, 0.2, 0.3);
    ctx.particles.burst(x, 1, z, 30, 10, 0.9, 0.9, this.glow, 2.6, SPR.star, 1, 0, 1.5);
  }

  get hp(): number {
    return Math.max(0, this.ctx.enemies.hp[this.index]);
  }

  get maxHp(): number {
    return this.ctx.enemies.maxHp[this.index];
  }

  private play(name: string, once = false): void {
    if (!this.mixer || (name === this.currentClip && !once)) return;
    const clip = this.clips.get(name);
    if (!clip) return;
    const next = this.mixer.clipAction(clip);
    const prev = this.currentClip ? this.mixer.clipAction(this.clips.get(this.currentClip)!) : null;
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    if (prev && prev !== next) next.crossFadeFrom(prev, 0.15, false);
    next.play();
    this.currentClip = name;
  }

  private setFlash(v: number): void {
    for (const s of this.shadings) s.flash.value = v;
  }

  private clearTelegraph(): void {
    if (this.telegraph) {
      this.telegraph.held = false;
      this.telegraph.life = 0.05;
      this.telegraph.age = 0;
      this.telegraph = null;
    }
  }

  private face(dx: number, dz: number, dt: number): void {
    const target = Math.atan2(dx, dz);
    let diff = target - this.facing;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.facing += diff * Math.min(1, dt * 7);
  }

  private radial(count: number, speed: number, offset: number, size = 0.75): void {
    for (let k = 0; k < count; k++) {
      const a = offset + (k / count) * Math.PI * 2;
      this.ctx.shots.spawn(this.x, this.z, Math.cos(a) * speed, Math.sin(a) * speed, this.def.damage * 0.55, 6, size, this.glow);
    }
    audio.synth('zap', { volume: 0.5, rate: 0.6, pan: this.ctx.pan(this.x) });
  }

  private startCharge(): void {
    const p = this.ctx.player;
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const d = Math.hypot(dx, dz) || 1;
    this.dirX = dx / d;
    this.dirZ = dz / d;
    this.mode = 'windup-charge';
    this.timer = bossTuning.chargeWindup;
    const len = bossTuning.chargeSpeed * bossTuning.chargeDuration;
    this.telegraph = this.ctx.fx.beam(this.x, this.z, this.x + this.dirX * len, this.z + this.dirZ * len, this.def.radius * 2.2, 0xff4040, 1, true, true);
    this.play('Taunt', true);
    audio.synth('warn', { volume: 0.5, pan: this.ctx.pan(this.x) });
  }

  private startSlam(): void {
    const p = this.ctx.player;
    this.mode = 'windup-slam';
    this.timer = bossTuning.slamWindup;
    this.targetX = p.x;
    this.targetZ = p.z;
    this.ctx.fx.decal(this.targetX, this.targetZ, bossTuning.slamRadius, 0xff4040, bossTuning.slamWindup + bossTuning.slamAir, SPR.ring);
    audio.synth('warn', { volume: 0.5, pan: this.ctx.pan(this.x) });
  }

  private land(): void {
    const { ctx } = this;
    const r = bossTuning.slamRadius;
    ctx.fx.ring(this.x, this.z, r, this.glow, 0.5, 0.25, 0.3);
    ctx.fx.ring(this.x, this.z, r * 0.6, 0xffffff, 0.35, 0.3, 0.2);
    ctx.particles.burst(this.x, 0.3, this.z, 26, 12, 0.7, 0.9, 0xcbb89a, 0.9, SPR.smoke, 0, 0, 2.5, 0.3);
    ctx.particles.burst(this.x, 0.4, this.z, 14, 14, 0.5, 0.5, this.glow, 2.6, SPR.shard, 1, 18, 1);
    ctx.rig.addTrauma(feel.shake.bossSlam, this.x, this.z);
    ctx.rig.punch(feel.camera.fovPunch.bossSlam);
    audio.synth('boom', { volume: 0.8, pan: ctx.pan(this.x) });
    const p = ctx.player;
    if (Math.hypot(p.x - this.x, p.z - this.z) < r) ctx.hurtPlayer(this.def.damage * 1.3, this.x, this.z);
  }

  update(dt: number, realDt: number): void {
    const { ctx } = this;
    const e = ctx.enemies;
    const p = ctx.player;
    const i = this.index;
    this.mixer?.update(dt);
    this.aura.update(realDt, ctx.time);
    for (const s of this.shadings) if (s.flash.value > 0) s.flash.value = Math.max(0, s.flash.value - dt / 0.1);
    if (e.flash[i] > 0.9) this.setFlash(1);

    if (this.dead) {
      this.deathT += realDt;
      const k = Math.max(0, 1 - this.deathT / 1.6);
      this.visual.scale.setScalar(this.scale * k);
      this.visual.rotation.y += realDt * 12;
      this.aura.target = 0;
      if (ctx.rng.chance(0.6)) ctx.particles.burst(this.x, 1.2, this.z, 3, 9, 0.6, 0.7, this.glow, 3, SPR.star, 1, 0, 1.2);
      return;
    }

    // 넉백은 아주 조금만 받는다.
    this.x += e.kx[i] * 0.12 * dt;
    this.z += e.kz[i] * 0.12 * dt;
    let dx = p.x - this.x;
    let dz = p.z - this.z;
    const dist = Math.hypot(dx, dz) || 1;
    dx /= dist;
    dz /= dist;
    const hpRatio = this.hp / this.maxHp;
    const rage = 1 + (1 - hpRatio) * 0.35;
    const behavior = this.def.behavior;
    this.contactCd -= dt;

    switch (this.mode) {
      case 'intro': {
        this.timer -= realDt;
        const k = Math.min(1, 1 - this.timer / 1.8);
        this.visual.scale.setScalar(this.scale * (0.2 + 0.8 * k) * (1 + 0.15 * Math.sin(k * Math.PI)));
        this.face(dx, dz, realDt);
        if (this.timer <= 0) {
          this.visual.scale.setScalar(this.scale);
          this.mode = 'chase';
        }
        break;
      }
      case 'chase': {
        const keepAway = behavior === 'caster' && dist < 9 ? -0.6 : 1;
        const sp = this.def.speed * rage * (behavior === 'final' ? 0.8 : 1) * keepAway;
        this.x += dx * sp * dt;
        this.z += dz * sp * dt;
        this.face(dx, dz, dt);
        this.play(this.def.speed > 3.4 ? 'Running_A' : 'Walking_A');
        this.attackCd -= dt * rage;
        this.castCd -= dt * rage;
        if (this.def.summon && (this.summonCd -= dt) <= 0) {
          this.summonCd = bossTuning.summonCooldown;
          for (let k = 0; k < bossTuning.summonCount; k++) {
            const a = (k / bossTuning.summonCount) * Math.PI * 2;
            ctx.spawnEnemy(this.def.summon, this.x + Math.cos(a) * 3.5, this.z + Math.sin(a) * 3.5);
          }
          ctx.fx.ring(this.x, this.z, 4, this.glow, 0.4);
        }
        if (behavior === 'charger' || (behavior === 'hybrid' && this.alt % 2 === 0)) {
          if (this.attackCd <= 0 && dist < 22) {
            this.attackCd = bossTuning.chargeCooldown;
            this.alt++;
            this.startCharge();
          }
        } else if (behavior === 'slammer' || (behavior === 'final' && hpRatio < 0.66)) {
          if (this.attackCd <= 0 && dist < 24) {
            this.attackCd = bossTuning.slamCooldown;
            this.startSlam();
          }
        } else if (behavior === 'hybrid' && this.attackCd <= 0) {
          this.attackCd = bossTuning.chargeCooldown * 0.7;
          this.alt++;
          this.castCd = 0;
        }
        if ((behavior === 'caster' || behavior === 'hybrid' || behavior === 'final') && this.castCd <= 0) {
          this.castCd = bossTuning.castCooldown;
          this.mode = 'cast';
          this.timer = 0.45;
          this.play('Spellcast_Shoot', true);
        }
        if (behavior === 'final') {
          // 나선 탄막
          this.spiralCd -= dt;
          if (this.spiralCd <= 0) {
            this.spiralCd = hpRatio < 0.33 ? 0.09 : 0.14;
            this.spiral += 0.42;
            const sp2 = bossTuning.castSpeed * 0.9;
            ctx.shots.spawn(this.x, this.z, Math.cos(this.spiral) * sp2, Math.sin(this.spiral) * sp2, this.def.damage * 0.45, 6, 0.6, this.glow);
            if (hpRatio < 0.5) ctx.shots.spawn(this.x, this.z, -Math.cos(this.spiral) * sp2, -Math.sin(this.spiral) * sp2, this.def.damage * 0.45, 6, 0.6, 0xff6bd6);
          }
        }
        break;
      }
      case 'windup-charge': {
        this.timer -= dt;
        this.face(this.dirX, this.dirZ, dt);
        this.setFlash(0.25 + 0.25 * Math.sin(ctx.time * 40));
        if (this.timer <= 0) {
          this.clearTelegraph();
          this.mode = 'charge';
          this.timer = bossTuning.chargeDuration;
          this.play('Running_A');
          audio.synth('whoosh', { volume: 0.7, rate: 0.6, pan: ctx.pan(this.x) });
        }
        break;
      }
      case 'charge': {
        this.timer -= dt;
        this.x += this.dirX * bossTuning.chargeSpeed * dt;
        this.z += this.dirZ * bossTuning.chargeSpeed * dt;
        if (ctx.rng.chance(0.8)) ctx.particles.emit(this.x, 0.2, this.z, -this.dirX * 2, 1.5, -this.dirZ * 2, 0.5, 0.9, 1.8, 0xcbb89a, 0.8, 0.4, SPR.smoke, 0);
        if (this.timer <= 0) {
          this.mode = 'chase';
          ctx.rig.addTrauma(0.2, this.x, this.z);
        }
        break;
      }
      case 'windup-slam': {
        this.timer -= dt;
        this.visual.scale.set(this.scale * 1.15, this.scale * 0.78, this.scale * 1.15);
        if (this.timer <= 0) {
          this.mode = 'jump';
          this.timer = bossTuning.slamAir;
          this.fromX = this.x;
          this.fromZ = this.z;
          this.visual.scale.setScalar(this.scale);
          audio.file('jump', { volume: 0.8, rate: 0.6, pan: ctx.pan(this.x) });
        }
        break;
      }
      case 'jump': {
        this.timer -= dt;
        const k = 1 - Math.max(0, this.timer / bossTuning.slamAir);
        this.x = this.fromX + (this.targetX - this.fromX) * k;
        this.z = this.fromZ + (this.targetZ - this.fromZ) * k;
        this.y = Math.sin(k * Math.PI) * 7;
        if (this.timer <= 0) {
          this.y = 0;
          this.mode = 'chase';
          this.visual.scale.set(this.scale * 1.25, this.scale * 0.7, this.scale * 1.25);
          this.land();
        }
        break;
      }
      case 'cast': {
        this.timer -= dt;
        this.face(dx, dz, dt);
        if (this.timer <= 0) {
          this.spiral += 0.37;
          this.radial(bossTuning.castBullets + (hpRatio < 0.5 ? 6 : 0), bossTuning.castSpeed, this.spiral);
          for (const off of [-0.22, 0, 0.22]) {
            const a = Math.atan2(dz, dx) + off;
            ctx.shots.spawn(this.x, this.z, Math.cos(a) * bossTuning.castSpeed * 1.5, Math.sin(a) * bossTuning.castSpeed * 1.5, this.def.damage * 0.6, 5, 0.85, 0xffffff);
          }
          ctx.fx.ring(this.x, this.z, 3, this.glow, 0.3);
          this.mode = 'chase';
        }
        break;
      }
      default:
        break;
    }

    // 몸통 박치기
    if (this.mode !== 'intro' && this.contactCd <= 0 && this.y < 1.5 && dist < this.def.radius + 0.6) {
      this.contactCd = 0.8;
      ctx.hurtPlayer(this.def.damage * (this.mode === 'charge' ? 1.5 : 1), this.x, this.z);
    }

    // 스쿼시 복원, 소품 보스의 통통 튀는 걸음
    if (this.mode !== 'windup-slam' && this.mode !== 'intro') {
      const sx = this.visual.scale.x + (this.scale - this.visual.scale.x) * Math.min(1, dt * 9);
      const sy = this.visual.scale.y + (this.scale - this.visual.scale.y) * Math.min(1, dt * 9);
      this.visual.scale.set(sx, sy, sx);
    }
    let hop = 0;
    if (this.def.kind === 'prop' && this.mode === 'chase') {
      this.hopPhase += dt * 5.5;
      hop = Math.abs(Math.sin(this.hopPhase)) * 1.1;
    } else if (this.def.kind === 'core') {
      hop = 0.4 + Math.sin(ctx.time * 2) * 0.25;
      this.coreParts[0].rotation.y = ctx.time * 2.2;
      this.coreParts[1].rotation.set(ctx.time * 0.6, -ctx.time * 0.9, 0);
      for (let k = 2; k < this.coreParts.length; k++) {
        const a = ctx.time * 1.8 + ((k - 2) / 6) * Math.PI * 2;
        this.coreParts[k].position.set(Math.cos(a) * 1.7, 1.3 + Math.sin(a * 2) * 0.4, Math.sin(a) * 1.7);
        this.coreParts[k].rotation.set(a, a * 2, 0);
      }
    }
    e.x[i] = this.x;
    e.z[i] = this.z;
    this.root.position.set(this.x, this.y + hop, this.z);
    this.root.rotation.y = this.facing;
  }

  /** 처치 연출 시작. 실제 제거는 씬이 한다. */
  die(): void {
    this.dead = true;
    this.mode = 'dead';
    this.clearTelegraph();
    this.play('Death_A', true);
    this.setFlash(1);
  }

  dispose(): void {
    this.clearTelegraph();
    this.aura.dispose();
    this.mixer?.stopAllAction();
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh !== this.aura.mesh) (mesh.material as THREE.Material).dispose();
    });
    for (const m of this.coreParts) m.geometry.dispose();
  }
}

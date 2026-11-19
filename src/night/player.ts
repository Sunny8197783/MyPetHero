import { Dog, turnToward } from '../core/actors';
import { input } from '../core/input';
import { balance, passiveById, type NightModifiers } from '../data';
import type { Obstacle } from './enemies';

/** 밤 전투의 플레이어 상태. 낮 스탯(NightModifiers)과 패시브로 수치가 정해진다. */
export class NightPlayer {
  readonly dog = new Dog('dog');
  x = 0;
  z = 0;
  vx = 0;
  vz = 0;
  facing = 0;
  hp = 100;
  maxHp = 100;
  invuln = 0;
  /** 우다다(대시) 무기가 거는 값. */
  speedBoost = 0;
  dashInvuln = false;
  might = 1;
  cooldownMult = 1;
  areaMult = 1;
  speed = 7;
  critChance = 0.05;
  critMult = 2;
  armor = 0;
  regen = 0;
  magnet = 3;
  dodge = 0;
  awakenLeft = 0;
  awakenDuration = 0;
  awakenUses = 1;
  awakenMight = 1.5;
  awakenHeal = 0;
  damageTaken = 0;
  private readonly radius = balance.player.radius;

  constructor(private readonly mods: NightModifiers) {
    this.recompute(new Map());
    this.hp = Math.round(this.maxHp * mods.startHpRatio);
    this.awakenUses = mods.awakenUses;
    this.awakenDuration = mods.awakenDuration;
    this.awakenMight = mods.awakenMight;
    this.awakenHeal = mods.awakenHeal;
  }

  /** 패시브 레벨이 바뀔 때마다 다시 계산한다. */
  recompute(passiveLevels: Map<string, number>): void {
    const p = balance.player;
    const sum = { might: 0, cooldown: 0, area: 0, speed: 0, magnet: 0, maxHp: 0, crit: 0, armor: 0 };
    let regen = 0;
    for (const [id, level] of passiveLevels) {
      const def = passiveById.get(id);
      if (!def) continue;
      sum[def.stat] += def.perLevel * level;
      if (def.regen) regen += def.regen * level;
    }
    const prevMax = this.maxHp;
    this.maxHp = Math.round(this.mods.maxHp * (1 + sum.maxHp));
    if (this.maxHp > prevMax && prevMax > 0) this.hp += this.maxHp - prevMax;
    this.might = this.mods.might * (1 + sum.might);
    this.cooldownMult = Math.max(0.35, this.mods.cooldown * (1 + sum.cooldown));
    this.areaMult = 1 + sum.area;
    this.speed = this.mods.speed * (1 + sum.speed);
    this.critChance = p.critChance + sum.crit;
    this.critMult = p.critMult;
    this.armor = sum.armor;
    this.regen = regen;
    this.magnet = p.magnetRadius * (1 + sum.magnet);
    this.dodge = this.mods.dodge;
  }

  get awakened(): boolean {
    return this.awakenLeft > 0;
  }

  /** 현재 공격력 배율(각성 포함). */
  get power(): number {
    return this.might * (this.awakened ? this.awakenMight : 1);
  }

  update(dt: number, obstacles: Obstacle[]): void {
    const p = balance.player;
    const max = this.speed * (1 + this.speedBoost) * (this.awakened ? 1.15 : 1);
    const tx = input.moveX * max;
    const tz = input.moveY * max;
    const moving = Math.abs(input.moveX) + Math.abs(input.moveY) > 0.01;
    // 가속은 빠르게, 감속은 살짝 미끄러지게 (입력 반응 커브)
    const rate = (moving ? p.accel : p.decel) * dt;
    const dvx = tx - this.vx;
    const dvz = tz - this.vz;
    const dv = Math.hypot(dvx, dvz);
    if (dv <= rate || dv === 0) {
      this.vx = tx;
      this.vz = tz;
    } else {
      this.vx += (dvx / dv) * rate;
      this.vz += (dvz / dv) * rate;
    }
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    for (const o of obstacles) {
      const ex = this.x - o.x;
      const ez = this.z - o.z;
      const rr = o.r + this.radius;
      if (Math.abs(ex) > rr || Math.abs(ez) > rr) continue;
      const d2 = ex * ex + ez * ez;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        this.x = o.x + (ex / d) * rr;
        this.z = o.z + (ez / d) * rr;
      }
    }
    const b = balance.night.bounds;
    this.x = Math.max(-b, Math.min(b, this.x));
    this.z = Math.max(-b, Math.min(b, this.z));

    const sp = Math.hypot(this.vx, this.vz);
    if (sp > 0.4) this.facing = turnToward(this.facing, Math.atan2(this.vx, this.vz), p.turnRate, dt);
    if (this.invuln > 0) this.invuln -= dt;
    if (this.awakenLeft > 0) this.awakenLeft -= dt;
    if (this.regen > 0 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.regen * dt);

    const ratio = sp / Math.max(0.1, this.speed);
    this.dog.setGait(ratio < 0.08 ? 0 : Math.min(1, 0.5 + ratio * 0.5), dt);
    this.dog.root.position.set(this.x, 0, this.z);
    this.dog.root.rotation.y = this.facing;
    this.dog.update(dt, 0.9 + ratio * 0.9);
  }
}

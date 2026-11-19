import * as THREE from 'three';
import { audio } from '../audio/audio';
import { blobShadowTexture } from '../core/actors';
import type { Engine, GameScene } from '../core/engine';
import { input } from '../core/input';
import { Rng, damp } from '../core/rng';
import { EMPTY_HUD, setGame, toast, type HudWeapon, type LevelUpChoice, type NightResult } from '../core/store';
import {
  balance, bossById, enemyTypeIndex, enemyTypes, eliteTuning, feel, nightDef, nightModifiers, passiveById, xpNeeded,
  type NightDef, type QualityDef, type Stats,
} from '../data';
import { CameraRig } from '../vfx/cameraRig';
import { DamageNumbers } from '../vfx/damageNumbers';
import { Aura, Fx } from '../vfx/fx';
import { Particles, SPR } from '../vfx/particles';
import type { PostFx } from '../vfx/postfx';
import { Sky } from '../vfx/sky';
import { Boss } from './boss';
import type { HitOpts, NightContext } from './context';
import { EnemySystem } from './enemies';
import { Gems, GEM_SNACK } from './gems';
import { rollChoices, tallyNight } from './levelup';
import { buildNightMap, HOME, CRATER, type NightMap } from './map';
import { NightPlayer } from './player';
import { EnemyShots } from './shots';
import { WeaponSystem } from './weapons';

export interface NightOptions {
  night: number;
  stats: Stats;
  seed: number;
  quality: QualityDef;
  onEnd(result: NightResult): void;
}

type Phase = 'fight' | 'bossintro' | 'dawn' | 'done';

const ONE = new THREE.Vector3(1, 1, 1);
const query = new Int16Array(512);

export class NightScene implements GameScene, NightContext {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(feel.camera.fov, 1, 0.5, 500);
  readonly rig: CameraRig;
  readonly enemies: EnemySystem;
  readonly fx = new Fx();
  readonly particles = new Particles(4096);
  readonly numbers = new DamageNumbers(900);
  readonly shots = new EnemyShots();
  readonly gems = new Gems();
  readonly player: NightPlayer;
  readonly weapons: WeaponSystem;
  readonly layer = new THREE.Group();
  readonly rng: Rng;
  readonly passives = new Map<string, number>();
  time = 0;
  phase: Phase = 'fight';
  boss: Boss | null = null;
  god = false;

  private readonly sky = new Sky('night');
  private readonly map: NightMap;
  private readonly def: NightDef;
  private readonly aura = new Aura(0x7df9ff, 1.25);
  private readonly moon: THREE.DirectionalLight;
  private readonly playerLight: THREE.PointLight;
  private readonly beacon: THREE.Mesh;
  private readonly halo: THREE.Mesh;
  private realTime = 0;
  private level = 1;
  private xp = 0;
  private pendingLevels = 0;
  private levelUpOpen = false;
  private choices: LevelUpChoice[] = [];
  private kills = 0;
  private eliteKills = 0;
  private yardKills = 0;
  private bossKilled = false;
  private bossEscaped = false;
  private bossSpawned = false;
  private bossName = '';
  private spawnAcc = 0;
  private eliteTimer: number;
  private burstsDone = 0;
  private hudTimer = 0;
  private loadoutDirty = true;
  private hudWeapons: HudWeapon[] = [];
  private hudPassives: { id: string; name: string; icon: string; level: number }[] = [];
  private lastHitstop = -1;
  private hurtFlash = 0;
  private introTimer = 0;
  private slowTimer = 0;
  private bossDeathTimer = 0;
  private lateTimer = 0;
  private dawnT = 0;
  private endTimer = -1;
  private knockedOut = false;
  private gemCombo = 0;
  private gemComboTimer = 0;
  private fireflyAcc = 0;
  private fogAcc = 0;
  private focusX = 0;
  private focusZ = 0;
  private ended = false;
  private focus = 1;
  private focusLock = false;
  private bot = false;
  private botAngle = 0;

  constructor(private readonly engine: Engine, private readonly postfx: PostFx, private readonly opts: NightOptions) {
    this.rng = new Rng(opts.seed + opts.night * 7919);
    this.def = nightDef(opts.night);
    this.eliteTimer = this.def.eliteEvery;
    this.rig = new CameraRig(this.camera);

    this.scene.fog = new THREE.FogExp2(this.sky.fogColor.getHex(), opts.quality.fog ? 0.0105 : 0.004);
    this.scene.add(this.sky.mesh);
    this.scene.add(new THREE.HemisphereLight(0x4a5aa8, 0x1a1d33, 1.25));
    this.moon = new THREE.DirectionalLight(0xa9c1ff, 1.5);
    this.moon.position.set(-18, 30, -14);
    if (opts.quality.shadows) {
      this.moon.castShadow = true;
      this.moon.shadow.mapSize.set(2048, 2048);
      const c = this.moon.shadow.camera;
      c.left = -34;
      c.right = 34;
      c.top = 34;
      c.bottom = -34;
      c.far = 90;
      this.moon.shadow.bias = -0.0015;
    }
    this.scene.add(this.moon, this.moon.target);
    this.playerLight = new THREE.PointLight(0xffc890, 18, 17, 1.6);
    this.scene.add(this.playerLight);

    this.map = buildNightMap(opts.seed, opts.night);
    this.map.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.receiveShadow = opts.quality.shadows;
    });
    this.scene.add(this.map.group);

    this.enemies = new EnemySystem(
      {
        onTouch: (i) => this.hurtPlayer(this.enemies.damage[i], this.enemies.x[i], this.enemies.z[i]),
        onShoot: (i) => this.enemyShoot(i),
      },
      blobShadowTexture(),
      opts.quality.enemyDetail,
    );
    this.enemies.obstacles = this.map.obstacles;
    this.scene.add(this.enemies.group);

    this.player = new NightPlayer(nightModifiers(opts.stats));
    this.player.x = HOME.x;
    this.player.z = HOME.z + 2.5;
    this.player.dog.setEyeColor(0x7df9ff);
    this.player.dog.shading.rimStrength.value = 0.55;
    this.scene.add(this.player.dog.root);
    // 발밑의 은은한 빛: 무리 속에서도 개의 위치가 잘 보이게 한다.
    const haloGeo = new THREE.PlaneGeometry(4.2, 4.2);
    haloGeo.rotateX(-Math.PI / 2);
    this.halo = new THREE.Mesh(
      haloGeo,
      new THREE.MeshBasicMaterial({ map: blobShadowTexture(), color: new THREE.Color(0.25, 0.9, 1.0), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.halo.position.y = 0.07;
    this.halo.renderOrder = 4;
    this.player.dog.root.add(this.halo);
    this.aura.mesh.scale.set(1, 0.8, 1.5);
    this.aura.mesh.position.y = 0.7;
    this.player.dog.root.add(this.aura.mesh);

    this.scene.add(this.layer, this.gems.mesh, this.shots.mesh, this.fx.group, this.particles.mesh, this.numbers.mesh);
    this.weapons = new WeaponSystem(this);
    this.weapons.add(balance.player.startWeapon);
    // 시작하자마자 싸울 수 있게 첫 무리를 가까이에 둔다.
    for (let k = 0; k < 7; k++) {
      const a = 0.9 + (k / 7) * 1.4;
      this.spawnEnemy('minion', this.player.x + Math.cos(a) * (12 + (k % 3) * 1.5), this.player.z + Math.sin(a) * (12 + (k % 3) * 1.5));
    }

    // 새벽 귀가 지점 표시(빛 기둥)
    const beaconGeo = new THREE.CylinderGeometry(1.4, 1.9, 16, 20, 1, true);
    beaconGeo.translate(0, 8, 0);
    this.beacon = new THREE.Mesh(
      beaconGeo,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.2, 0.6), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    this.beacon.position.set(HOME.x, 0, HOME.z);
    this.scene.add(this.beacon);

    // 밤이 깊어질수록 시작이 버거우므로, 두 밤마다 레벨업 한 번을 미리 준다.
    this.pendingLevels = Math.floor((opts.night - 1) / balance.player.headStartNights);
    this.level += this.pendingLevels;
    this.particles.scale = opts.quality.particleScale;
    this.numbers.max = opts.quality.maxDamageNumbers;
    this.rig.snap(this.player.x, this.player.z);
    this.focusX = this.player.x;
    this.focusZ = this.player.z;
    this.postfx.setLook('night', 0.6);
    audio.playMusic('night');
    setGame({ hud: { ...EMPTY_HUD, night: opts.night, duration: this.def.duration, timeLeft: this.def.duration, fatigueLabel: nightModifiers(opts.stats).fatigueLabel } });
    if (this.player.hp < this.player.maxHp) toast('피곤해서 몸이 무겁다…');
  }

  // ---------- NightContext ----------

  pan(x: number): number {
    return Math.max(-1, Math.min(1, (x - this.rig.focus.x) / 16));
  }

  hitstop(ms: number): void {
    const h = feel.hitstop;
    if (!h.enabled || ms <= 0) return;
    if (this.realTime - this.lastHitstop < h.minIntervalMs / 1000) return;
    this.lastHitstop = this.realTime;
    this.engine.hitstop(ms, h.scale);
  }

  spawnEnemy(typeId: string, x: number, z: number, elite = false): number {
    const t = enemyTypeIndex.get(typeId);
    if (t === undefined || this.enemies.count >= balance.night.maxEnemies) return -1;
    const n = balance.night;
    const progress = Math.min(1, this.time / this.def.duration);
    const hpMult = (1 + n.hpPerNight * (this.opts.night - 1)) * (1 + n.hpOverTime * progress);
    const dmgMult = 1 + n.damagePerNight * (this.opts.night - 1);
    const b = n.bounds + 6;
    return this.enemies.spawn(t, Math.max(-b, Math.min(b, x)), Math.max(-b, Math.min(b, z)), elite, hpMult, dmgMult);
  }

  hit(i: number, damage: number, dirX: number, dirZ: number, knock: number, opts?: HitOpts): boolean {
    const e = this.enemies;
    if (!e.alive[i]) return false;
    const p = this.player;
    let dmg = damage * p.power * this.rng.range(0.92, 1.08);
    const crit = this.rng.chance(p.critChance + (opts?.critBonus ?? 0));
    if (crit) dmg *= p.critMult;
    const external = e.external[i] === 1;
    const x = e.x[i];
    const z = e.z[i];
    const killed = e.applyHit(i, dmg, dirX * knock, dirZ * knock);
    if (opts?.stun && !external) e.stun[i] = Math.max(e.stun[i], opts.stun);
    const quiet = !!opts?.quiet && !crit && !killed;
    const color = opts?.color ?? 0xffffff;

    if (!quiet) {
      this.numbers.spawn(x, 1.5 + e.radius[i], z, dmg, crit ? 1 : 0);
      this.particles.burst(x, 0.9, z, crit ? 7 : 3, crit ? 8 : 5.5, 0.22, crit ? 0.42 : 0.3, crit ? 0xfff0a8 : color, 1.9, SPR.spark, 1, 0, 3);
      const heavy = opts?.heavy ? 0.9 : crit ? 0.65 : external ? 0.5 : 0.15;
      audio.impact(this.pan(x), heavy);
      const s = feel.shake;
      this.rig.addTrauma(crit ? s.crit : s.hit, x, z);
      const h = feel.hitstop;
      this.hitstop(external ? h.bossHitMs : opts?.heavy ? h.heavyMs : crit ? h.critMs : h.hitMs);
      if (crit) this.rig.punch(feel.camera.fovPunch.crit);
    } else if (this.rng.chance(0.3)) {
      this.particles.emit(x, 0.9, z, this.rng.range(-2, 2), 2.5, this.rng.range(-2, 2), 0.2, 0.25, 0, color, 2.4, 1, SPR.spark, 1);
    }
    if (killed) this.kill(i, crit, dirX, dirZ);
    return killed;
  }

  hurtPlayer(amount: number, fromX: number, fromZ: number): void {
    const p = this.player;
    if (this.phase !== 'fight' || this.knockedOut || p.invuln > 0 || p.dashInvuln || this.god) return;
    if (this.rng.chance(p.dodge)) {
      p.invuln = 0.2;
      this.particles.burst(p.x, 0.8, p.z, 5, 5, 0.3, 0.3, 0xbfe9ff, 2, SPR.star, 1);
      return;
    }
    const dmg = Math.max(1, amount - p.armor);
    p.hp -= dmg;
    p.damageTaken += dmg;
    p.invuln = balance.player.invulnAfterHit;
    p.dog.shading.flash.value = 1;
    p.dog.root.scale.set(1.25, 0.75, 1.25);
    this.hurtFlash = 1;
    this.numbers.spawn(p.x, 1.8, p.z, dmg, 2);
    this.particles.burst(p.x, 0.8, p.z, 8, 6, 0.35, 0.35, 0xff5a5a, 2.2, SPR.shard, 1, 12, 1);
    this.rig.addTrauma(feel.shake.playerHit);
    this.hitstop(feel.hitstop.playerHitMs);
    input.rumble(feel.input.rumble.hitMs, feel.input.rumble.hitStrong);
    audio.synth('yelp', { volume: 0.6 });
    audio.synth('thump', { volume: 0.6 });
    // 맞으면 주변 적을 살짝 밀어내 숨 돌릴 틈을 준다.
    const n = this.enemies.queryCircle(p.x, p.z, 2.6, query);
    for (let k = 0; k < n; k++) {
      const i = query[k];
      const dx = this.enemies.x[i] - p.x;
      const dz = this.enemies.z[i] - p.z;
      const d = Math.hypot(dx, dz) || 1;
      this.enemies.kx[i] += ((dx / d) * 9) / this.enemies.mass[i];
      this.enemies.kz[i] += ((dz / d) * 9) / this.enemies.mass[i];
    }
    void fromX;
    void fromZ;

    const a = balance.nightEffects.awaken;
    if (p.hp > 0 && p.hp / p.maxHp < a.hpThreshold && p.awakenUses > 0 && !p.awakened) this.awaken();
    if (p.hp <= 0) {
      if (p.awakenUses > 0 && !p.awakened) {
        p.hp = 1;
        this.awaken();
      } else {
        this.knockOut();
      }
    }
  }

  // ---------- 전투 이벤트 ----------

  private awaken(): void {
    const p = this.player;
    p.awakenUses--;
    p.awakenLeft = p.awakenDuration;
    p.invuln = 1.2;
    const heal = Math.round(p.maxHp * p.awakenHeal);
    if (heal > 0) {
      p.hp = Math.min(p.maxHp, p.hp + heal);
      this.numbers.spawn(p.x, 2.2, p.z, heal, 3);
    }
    this.fx.ring(p.x, p.z, 9, 0x7df9ff, 0.7, 0.18, 0.05);
    this.fx.ring(p.x, p.z, 5, 0xffffff, 0.45, 0.25, 0.04);
    this.particles.burst(p.x, 0.9, p.z, 30, 12, 0.9, 0.6, 0x7df9ff, 1.8, SPR.star, 1, -2, 1.5);
    this.particles.burst(p.x, 1.4, p.z, 10, 3, 1.2, 0.8, 0xff9db8, 2, SPR.heart, 1, -2.5, 1, 1.2);
    this.rig.punch(feel.camera.fovPunch.awaken);
    this.rig.addTrauma(0.5);
    this.slowTimer = 0.7;
    this.engine.timeScale = 0.25;
    audio.synth('awaken', { volume: 0.9, fixed: true });
    const n = this.enemies.queryCircle(p.x, p.z, 9, query);
    for (let k = 0; k < n; k++) {
      const i = query[k];
      const dx = this.enemies.x[i] - p.x;
      const dz = this.enemies.z[i] - p.z;
      const d = Math.hypot(dx, dz) || 1;
      this.hit(i, 18, dx / d, dz / d, 16, { color: 0x7df9ff, quiet: true, stun: 0.8 });
    }
    toast('(주인이 기다린다…!)  각성');
  }

  private knockOut(): void {
    if (this.knockedOut) return;
    this.knockedOut = true;
    this.player.hp = 0;
    this.phase = 'done';
    this.endTimer = 2.2;
    this.engine.timeScale = 0.3;
    this.rig.zoomTarget = 0.6;
    this.rig.addTrauma(0.8);
    audio.synth('boom', { volume: 0.7 });
    audio.playMusic(null, 1.2);
    this.particles.burst(this.player.x, 0.8, this.player.z, 24, 9, 0.9, 0.6, 0xffffff, 2.4, SPR.star, 1, 6, 1.5);
    toast('기절했다… 누군가 집 앞까지 끌고 왔다');
  }

  private kill(i: number, crit: boolean, dirX: number, dirZ: number): void {
    const e = this.enemies;
    if (e.external[i]) {
      this.killBoss();
      return;
    }
    const def = e.typeDef(i);
    const x = e.x[i];
    const z = e.z[i];
    const elite = e.elite[i] === 1;
    const color = parseInt(def.burst.slice(1), 16);
    const d = feel.death;
    this.particles.burst(x, 0.9, z, elite ? d.eliteParticles : d.particles, elite ? 10 : 7, 0.55, elite ? 0.6 : 0.42, color, 1.4, SPR.shard, 0.25, 16, 1.2, 0.9);
    this.particles.burst(x, 0.6, z, elite ? 8 : 3, 3, 0.5, 1.0, 0xd9d2c2, 0.7, SPR.smoke, 0, -1, 2, 0.5);
    if (dirX !== 0 || dirZ !== 0) {
      for (let k = 0; k < 3; k++) {
        this.particles.emit(x, 1, z, dirX * this.rng.range(6, 12), this.rng.range(2, 5), dirZ * this.rng.range(6, 12), 0.5, 0.36, 0.1, color, 1.4, 1, SPR.shard, 0.2, 16, 1, 0, this.rng.range(-9, 9));
      }
    }
    this.gems.drop(x, z, def.xp * (elite ? eliteTuning.xpMult : 1));
    if (this.rng.chance(balance.night.snackDropChance * (elite ? 8 : 1))) this.gems.drop(x, z, 0, GEM_SNACK);
    this.kills++;
    if (elite) this.eliteKills++;
    if (Math.hypot(x - HOME.x, z - HOME.z) < balance.night.yardRadius) this.yardKills++;
    audio.file('destroy', { volume: elite ? 0.7 : 0.38, pan: this.pan(x), rate: elite ? 0.8 : 1.1 });
    const s = feel.shake;
    this.rig.addTrauma(elite ? s.eliteKill : s.kill * (crit ? 1.5 : 1), x, z);
    if (elite) {
      this.hitstop(feel.hitstop.eliteKillMs);
      this.fx.ring(x, z, 4, 0xff6b6b, 0.4, 0.25, 0.3);
      this.rig.punch(feel.camera.fovPunch.heavy);
      audio.synth('boom', { volume: 0.45, pan: this.pan(x), rate: 1.3 });
    }
    e.remove(i);
  }

  private killBoss(): void {
    const boss = this.boss;
    if (!boss || boss.dead) return;
    boss.die();
    this.bossKilled = true;
    this.kills++;
    const bk = feel.camera.bossKill;
    this.engine.hitstop(feel.hitstop.bossKillMs, 0.02);
    this.engine.timeScale = bk.slowScale;
    this.slowTimer = bk.slowDuration;
    this.bossDeathTimer = bk.slowDuration + 0.4;
    this.rig.zoomTarget = bk.zoom;
    this.rig.addTrauma(feel.shake.bossKill);
    this.rig.punch(feel.camera.fovPunch.max);
    input.rumble(feel.input.rumble.bossMs, feel.input.rumble.bossStrong);
    this.fx.ring(boss.x, boss.z, 14, boss.glow, 0.9, 0.16, 0.3);
    this.fx.ring(boss.x, boss.z, 8, 0xffffff, 0.6, 0.3, 0.3);
    this.particles.burst(boss.x, 1.5, boss.z, 70, 18, 1.2, 0.9, boss.glow, 3, SPR.star, 1, 4, 1.2);
    this.particles.burst(boss.x, 1, boss.z, 40, 12, 1.0, 0.7, 0xffffff, 1.6, SPR.shard, 0.3, 14, 1);
    for (let k = 0; k < 26; k++) this.gems.drop(boss.x + this.rng.range(-2, 2), boss.z + this.rng.range(-2, 2), 6);
    this.gems.drop(boss.x, boss.z, 0, GEM_SNACK);
    audio.synth('boom', { volume: 1, rate: 0.6, fixed: true });
    audio.synth('evolve', { volume: 0.7, fixed: true });
    audio.playMusic('night', 2.5);
    this.postfx.setLook('night', 2);
    setGame({ bossIntro: null });
    toast(`${boss.def.name} 처치!`);
    // 남은 탄막은 지운다.
    this.shots.clear();
  }

  private enemyShoot(i: number): void {
    const def = this.enemies.typeDef(i);
    if (!def.ranged || this.phase !== 'fight') return;
    const x = this.enemies.x[i];
    const z = this.enemies.z[i];
    const dx = this.player.x - x;
    const dz = this.player.z - z;
    const d = Math.hypot(dx, dz) || 1;
    const dmgMult = 1 + balance.night.damagePerNight * (this.opts.night - 1);
    this.shots.spawn(x, z, (dx / d) * def.ranged.speed, (dz / d) * def.ranged.speed, def.ranged.damage * dmgMult, 4.5, 0.62, 0xd05cff);
    this.enemies.squash[i] = 0.7;
    this.particles.burst(x, 1.2, z, 4, 3, 0.3, 0.3, 0xd05cff, 2.4, SPR.spark, 1);
    audio.file('enemyAttack', { volume: 0.3, pan: this.pan(x) });
  }

  private collectGem(value: number, tier: number, x: number, z: number): void {
    if (tier === GEM_SNACK) {
      const p = this.player;
      const heal = Math.round(p.maxHp * balance.night.snackHeal);
      p.hp = Math.min(p.maxHp, p.hp + heal);
      this.numbers.spawn(p.x, 2, p.z, heal, 3);
      this.particles.burst(p.x, 1, p.z, 8, 3, 0.8, 0.5, 0xff9db8, 2, SPR.heart, 1, -2, 1, 1);
      audio.synth('heart', { volume: 0.7 });
      return;
    }
    this.xp += value;
    this.gemCombo = Math.min(14, this.gemCombo + 1);
    this.gemComboTimer = 0.5;
    audio.synth('gem', { volume: 0.32, rate: 0.9 + this.gemCombo * 0.045, fixed: true });
    this.particles.emit(x, 0.8, z, 0, 2, 0, 0.3, 0.5, 0, 0x9be7ff, 2.5, 1, SPR.star, 1);
    while (this.xp >= xpNeeded(this.level)) {
      this.xp -= xpNeeded(this.level);
      this.level++;
      this.pendingLevels++;
    }
  }

  // ---------- 레벨업 ----------

  private openLevelUp(): void {
    this.levelUpOpen = true;
    this.choices = rollChoices(this.rng, this.weapons, this.passives);
    this.engine.paused = true;
    const p = this.player;
    this.fx.ring(p.x, p.z, 6, 0xffe08a, 0.5, 0.16, 0.04);
    this.particles.burst(p.x, 1, p.z, 12, 8, 0.8, 0.42, 0xffe08a, 1.5, SPR.star, 1, -3, 1.5, 1.2);
    audio.synth('chime', { volume: 0.7, fixed: true });
    this.focus = 1;
    this.focusLock = true;
    setGame({ levelUp: this.choices, levelUpFocus: 1 });
  }

  /** 레벨업 카드 선택(UI 에서 호출). */
  choose(index: number): void {
    if (!this.levelUpOpen) return;
    const c = this.choices[index];
    if (!c) return;
    const p = this.player;
    if (c.kind === 'weapon') {
      if (this.weapons.get(c.id)) this.weapons.levelUp(c.id);
      else this.weapons.add(c.id);
    } else if (c.kind === 'evolve') {
      this.weapons.evolve(c.id);
      this.fx.ring(p.x, p.z, 10, parseInt(c.color.slice(1), 16), 0.8, 0.18, 0.3);
      this.particles.burst(p.x, 1, p.z, 50, 14, 1.0, 0.7, parseInt(c.color.slice(1), 16), 3, SPR.star, 1, -2, 1.2);
      this.rig.punch(feel.camera.fovPunch.evolve);
      this.rig.addTrauma(0.5);
      audio.synth('evolve', { volume: 0.9, fixed: true });
      toast(`진화!  ${c.name}`);
    } else if (c.kind === 'passive') {
      this.passives.set(c.id, (this.passives.get(c.id) ?? 0) + 1);
      p.recompute(this.passives);
    } else {
      const heal = Math.round(p.maxHp * 0.3);
      p.hp = Math.min(p.maxHp, p.hp + heal);
      this.numbers.spawn(p.x, 2, p.z, heal, 3);
    }
    // 레벨업할 때마다 조금 회복한다.
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * balance.player.levelUpHeal);
    this.loadoutDirty = true;
    this.pendingLevels--;
    audio.ui('confirm');
    if (this.pendingLevels > 0) {
      this.choices = rollChoices(this.rng, this.weapons, this.passives);
      this.focus = 1;
      setGame({ levelUp: this.choices, levelUpFocus: 1 });
    } else {
      this.levelUpOpen = false;
      this.engine.paused = false;
      p.invuln = Math.max(p.invuln, 0.6);
      setGame({ levelUp: null });
    }
  }

  // ---------- 웨이브 ----------

  private spawnAround(typeId: string, elite = false): void {
    const n = balance.night;
    const a = this.rng.range(0, Math.PI * 2);
    const r = this.rng.range(n.spawnRadiusMin, n.spawnRadiusMax);
    this.spawnEnemy(typeId, this.player.x + Math.cos(a) * r, this.player.z + Math.sin(a) * r, elite);
  }

  private updateWaves(dt: number): void {
    const def = this.def;
    const t = this.time / def.duration;
    for (const seg of def.segments) {
      if (t < seg.from || t >= seg.to) continue;
      const k = (t - seg.from) / (seg.to - seg.from);
      this.spawnAcc += (seg.rate[0] + (seg.rate[1] - seg.rate[0]) * k) * dt;
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        this.spawnAround(this.rng.weighted(seg.mix));
      }
    }
    while (this.burstsDone < def.bursts.length && t >= def.bursts[this.burstsDone].at) {
      const b = def.bursts[this.burstsDone++];
      const n = balance.night;
      const base = this.rng.range(0, Math.PI * 2);
      for (let k = 0; k < b.count; k++) {
        const a = b.pattern === 'ring' ? base + (k / b.count) * Math.PI * 2 : base + this.rng.range(-0.5, 0.5);
        const r = n.spawnRadiusMin + (b.pattern === 'ring' ? 0 : this.rng.range(0, 6));
        this.spawnEnemy(b.type, this.player.x + Math.cos(a) * r, this.player.z + Math.sin(a) * r);
      }
      audio.synth('warn', { volume: 0.4 });
      toast(b.pattern === 'ring' ? '포위당했다!' : '떼로 몰려온다!');
    }
    this.eliteTimer -= dt;
    if (this.eliteTimer <= 0) {
      this.eliteTimer = def.eliteEvery;
      this.spawnAround(def.eliteType, true);
    }
    if (!this.bossSpawned && this.time >= def.bossAt) this.spawnBoss();
  }

  private spawnBoss(): void {
    const def = bossById.get(this.def.boss);
    if (!def) return;
    this.bossSpawned = true;
    this.bossName = def.name;
    const p = this.player;
    let bx: number;
    let bz: number;
    if (def.kind === 'core') {
      bx = CRATER.x;
      bz = CRATER.z;
    } else {
      const a = this.rng.range(0, Math.PI * 2);
      const b = balance.night.bounds - 4;
      bx = Math.max(-b, Math.min(b, p.x + Math.cos(a) * 15));
      bz = Math.max(-b, Math.min(b, p.z + Math.sin(a) * 15));
    }
    this.boss = new Boss(this, def, bx, bz);
    this.scene.add(this.boss.root);
    this.phase = 'bossintro';
    this.introTimer = 2.2;
    this.engine.timeScale = 0.04;
    this.rig.zoomTarget = 0.72;
    this.rig.addTrauma(0.6);
    this.postfx.setLook('boss', 0.8);
    audio.playMusic('boss', 0.8);
    setGame({ bossIntro: { name: def.name, title: def.title } });
  }

  // ---------- 새벽 ----------

  private startDawn(): void {
    this.phase = 'dawn';
    this.enemies.flee = true;
    this.gems.vacuum = true;
    this.shots.clear();
    if (this.boss && !this.boss.dead) {
      this.bossEscaped = true;
      this.fx.ring(this.boss.x, this.boss.z, 6, this.boss.glow, 0.6);
      this.particles.burst(this.boss.x, 1.5, this.boss.z, 30, 8, 0.9, 0.9, 0x9aa5c0, 0.8, SPR.smoke, 0, -2, 2);
      this.enemies.remove(this.boss.index);
      this.scene.remove(this.boss.root);
      this.boss.dispose();
      this.boss = null;
      setGame({ bossIntro: null });
      toast(`${this.bossName}이(가) 달아났다…`);
    }
    this.postfx.setLook('dawn', 5);
    audio.playMusic('cutscene', 3);
    audio.synth('dawn', { volume: 0.8, fixed: true });
    toast('동이 튼다! 주인이 깨기 전에 집으로!');
  }

  private updateDawn(dt: number, realDt: number): void {
    const n = balance.night;
    this.dawnT = Math.min(1, this.dawnT + realDt / 9);
    this.sky.blend('night', 'dawn', this.dawnT);
    (this.scene.fog as THREE.FogExp2).color.copy(this.sky.fogColor);
    this.map.setLampPower(1 - this.dawnT);
    this.moon.intensity = 1.5 + this.dawnT * 1.2;
    this.moon.color.setHex(0xa9c1ff).lerp(new THREE.Color(0xffd9a8), this.dawnT);
    // 햇빛에 닿은 몬스터는 재가 되어 사라진다.
    const e = this.enemies;
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i] || e.external[i]) continue;
      e.burn[i] += dt * 0.6;
      if (e.burn[i] > 1 || this.rng.chance(dt * 0.5)) {
        this.particles.burst(e.x[i], 0.8, e.z[i], 6, 3, 0.9, 0.5, 0xffb070, 1.6, SPR.flame, 1, -2.5, 1.5, 1.2);
        e.remove(i);
      }
    }
    this.lateTimer += dt;
    const p = this.player;
    const dist = Math.hypot(p.x - HOME.x, p.z - HOME.z);
    const mat = this.beacon.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.22 + 0.12 * Math.sin(this.realTime * 5);
    if (Math.floor(this.realTime * 1.2) !== Math.floor((this.realTime - realDt) * 1.2)) this.fx.ring(HOME.x, HOME.z, n.homeRadius * 1.6, 0xffd27a, 0.9, 0.12, 0.05);
    if (dist < n.homeRadius || this.lateTimer > n.dawnGrace + n.dawnMaxLate) {
      this.phase = 'done';
      this.endTimer = 0.9;
      audio.synth('chime', { volume: 0.6, fixed: true });
      this.particles.burst(p.x, 1, p.z, 20, 6, 0.8, 0.5, 0xffe08a, 2.4, SPR.star, 1, -2, 1.5, 1.2);
    }
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.engine.timeScale = 1;
    this.engine.paused = false;
    const late = Math.max(0, this.lateTimer - balance.night.dawnGrace);
    const result = tallyNight({
      night: this.opts.night,
      kills: this.kills,
      eliteKills: this.eliteKills,
      bossKilled: this.bossKilled,
      bossEscaped: this.bossEscaped || (!this.bossKilled && this.bossSpawned),
      bossName: this.bossName || bossById.get(this.def.boss)?.name || '',
      damageTaken: this.player.damageTaken,
      maxHp: this.player.maxHp,
      lateSeconds: this.knockedOut ? 0 : Math.round(late),
      yardKills: this.yardKills,
      knockedOut: this.knockedOut,
      level: this.level,
    });
    setGame({ levelUp: null, bossIntro: null });
    this.opts.onEnd(result);
  }

  // ---------- 프레임 ----------

  update(dt: number, realDt: number): void {
    this.realTime += realDt;
    this.time += dt;
    const p = this.player;

    // 슬로모션·보스 등장 타이머는 실제 시간으로 흐른다.
    if (this.slowTimer > 0 && (this.slowTimer -= realDt) <= 0 && this.phase !== 'bossintro' && !this.knockedOut) {
      this.engine.timeScale = 1;
      this.rig.zoomTarget = 1;
    }
    if (this.phase === 'bossintro') {
      this.introTimer -= realDt;
      if (this.introTimer <= 0) {
        this.phase = 'fight';
        this.engine.timeScale = 1;
        this.rig.zoomTarget = 1;
        setGame({ bossIntro: null });
      }
    }
    if (this.bossDeathTimer > 0 && (this.bossDeathTimer -= realDt) <= 0 && this.boss) {
      this.enemies.remove(this.boss.index);
      this.scene.remove(this.boss.root);
      this.boss.dispose();
      this.boss = null;
      this.gems.vacuum = true;
    }
    if (this.endTimer > 0 && (this.endTimer -= realDt) <= 0) this.finish();
    audio.setDuck(this.engine.inHitstop);

    if (this.bot) this.updateBot();
    input.poll();
    if (this.levelUpOpen && !this.bot) {
      // 게임패드·방향키로 카드를 고르고 A / Enter / Space 로 확정한다.
      const dir = input.moveX > 0.6 ? 1 : input.moveX < -0.6 ? -1 : 0;
      if (dir === 0) this.focusLock = false;
      else if (!this.focusLock) {
        this.focusLock = true;
        this.focus = (this.focus + dir + this.choices.length) % this.choices.length;
        setGame({ levelUpFocus: this.focus });
        audio.ui('click');
      }
      if (input.consume('PadA', 'Enter', 'Space')) this.choose(this.focus);
    }
    if (this.phase === 'done') {
      input.moveX = 0;
      input.moveY = 0;
    }

    if (dt > 0) {
      if (!this.knockedOut) p.update(dt, this.map.obstacles);
      if (this.phase === 'fight') this.updateWaves(dt);
      this.enemies.update(dt, p.x, p.z, balance.player.radius);
      if (this.phase === 'fight') this.weapons.update(dt);
      else p.speedBoost = 0;
      this.shots.update(dt, p.x, p.z, balance.player.radius, this.time, (d, x, z) => this.hurtPlayer(d, x, z));
      this.gems.update(dt, this.time, p.x, p.z, p.magnet, (v, t, x, z) => this.collectGem(v, t, x, z));
      if (this.phase === 'fight' && this.time >= this.def.duration) this.startDawn();
      if (this.phase === 'dawn') this.updateDawn(dt, realDt);
      if (this.gemComboTimer > 0 && (this.gemComboTimer -= dt) <= 0) this.gemCombo = 0;
      this.fx.update(dt);
      this.ambient(dt);
    }
    this.boss?.update(dt, realDt);
    this.enemies.sync();
    this.particles.update(Math.max(dt, this.engine.paused ? 0 : realDt * 0.15));
    this.numbers.update(this.engine.paused ? 0 : realDt);
    this.map.update(this.realTime);

    if (this.pendingLevels > 0 && !this.levelUpOpen && this.phase === 'fight' && this.slowTimer <= 0) this.openLevelUp();

    // 각성 오라와 눈빛
    this.aura.target = p.awakened ? 1 : 0;
    this.aura.update(realDt, this.realTime);
    if (p.awakened) {
      p.dog.eyeTarget = 1;
      if (this.rng.chance(0.5)) this.particles.emit(p.x + this.rng.range(-0.6, 0.6), 0.3, p.z + this.rng.range(-0.6, 0.6), 0, this.rng.range(2, 4), 0, 0.6, 0.3, 0, 0x7df9ff, 2.6, 0.9, SPR.spark, 1, 0, 0, Math.PI / 2);
    } else if (this.aura.strength < 0.05 && p.dog.eyeTarget > 0 && !this.weapons.get('laser')) {
      p.dog.eyeTarget = 0;
    }
    p.dog.shading.rimStrength.value = 0.55 + this.aura.strength * 1.6;
    p.dog.root.scale.lerp(ONE, 1 - Math.exp(-12 * realDt));
    if (this.knockedOut) {
      p.dog.root.rotation.z = damp(p.dog.root.rotation.z, Math.PI / 2, 6, realDt);
      p.dog.update(realDt * 0.3, 0.2);
    }

    this.hurtFlash = Math.max(0, this.hurtFlash - realDt * 2.2);
    const lowHp = p.hp / p.maxHp < 0.3 ? 0.25 + 0.15 * Math.sin(this.realTime * 6) : 0;
    this.postfx.hurt = Math.max(this.hurtFlash * 0.9, lowHp);
    this.postfx.awaken = this.aura.strength;

    // 카메라: 보스 등장·처치 때는 보스를 비춘다.
    const focusBoss = this.boss && (this.phase === 'bossintro' || this.boss.dead);
    const tx = focusBoss ? this.boss!.x : p.x;
    const tz = focusBoss ? this.boss!.z : p.z;
    this.focusX = damp(this.focusX, tx, focusBoss ? 6 : 30, realDt);
    this.focusZ = damp(this.focusZ, tz, focusBoss ? 6 : 30, realDt);
    this.rig.update(realDt, this.focusX, this.focusZ, focusBoss ? 0 : p.vx, focusBoss ? 0 : p.vz);
    this.sky.update(this.realTime, this.camera);
    this.playerLight.position.set(p.x, 3.2, p.z + 0.5);
    this.playerLight.intensity = 18 + this.aura.strength * 16;
    if (this.moon.castShadow) {
      this.moon.position.set(p.x - 18, 30, p.z - 14);
      this.moon.target.position.set(p.x, 0, p.z);
    }

    this.hudTimer -= realDt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      this.syncHud();
    }
    input.endFrame();
  }

  private ambient(dt: number): void {
    const q = this.opts.quality;
    const p = this.player;
    this.fireflyAcc += dt * (q.fireflies / 5) * (this.phase === 'dawn' ? 0.2 : 1);
    while (this.fireflyAcc >= 1) {
      this.fireflyAcc -= 1;
      const a = this.rng.range(0, 6.28);
      const r = this.rng.range(4, 24);
      this.particles.emit(
        p.x + Math.cos(a) * r, this.rng.range(0.5, 2.6), p.z + Math.sin(a) * r * 0.8,
        this.rng.range(-0.5, 0.5), this.rng.range(-0.15, 0.3), this.rng.range(-0.5, 0.5),
        this.rng.range(2.5, 5), 0.18, 0.05, 0xd9ff8a, 2.8, 0.9, SPR.soft, 1,
      );
    }
    if (q.fog) {
      this.fogAcc += dt * 2.2;
      while (this.fogAcc >= 1) {
        this.fogAcc -= 1;
        const a = this.rng.range(0, 6.28);
        const r = this.rng.range(8, 30);
        this.particles.emit(
          p.x + Math.cos(a) * r, 0.5, p.z + Math.sin(a) * r * 0.8,
          this.rng.range(0.3, 1.0), 0, this.rng.range(-0.3, 0.3),
          7, 7, 11, this.phase === 'dawn' ? 0xffc8a0 : 0x7f93cf, 0.5, 0.06, SPR.smoke, 0,
        );
      }
    }
  }

  private updateBot(): void {
    const p = this.player;
    const e = this.enemies;
    let ax = 0;
    let az = 0;
    if (this.phase === 'dawn') {
      ax = HOME.x - p.x;
      az = HOME.z - p.z;
    } else {
      // 적이 짖기 범위 안쪽까지 오도록 두고, 바짝 붙으면 물러난다.
      const n = e.queryCircle(p.x, p.z, 4.2, query);
      for (let k = 0; k < n; k++) {
        const i = query[k];
        const dx = p.x - e.x[i];
        const dz = p.z - e.z[i];
        const d2 = dx * dx + dz * dz + 0.2;
        const w = e.external[i] ? 8 : d2 < 6 ? 2.2 : 0.5;
        ax += (dx / d2) * w;
        az += (dz / d2) * w;
      }
      const gem = this.gems.nearest(p.x, p.z, 9);
      if (gem) {
        const gd = Math.hypot(gem.x - p.x, gem.z - p.z) || 1;
        ax += ((gem.x - p.x) / gd) * 0.45;
        az += ((gem.z - p.z) / gd) * 0.45;
      }
      // 계속 원을 그리며 움직이고, 가장자리에서는 안쪽으로 돌아온다.
      this.botAngle += 0.012;
      ax += Math.cos(this.botAngle) * 0.25 - p.x * 0.01;
      az += Math.sin(this.botAngle) * 0.25 - p.z * 0.01;
    }
    const len = Math.hypot(ax, az) || 1;
    input.botActive = true;
    input.botX = ax / len;
    input.botY = az / len;
    if (this.levelUpOpen) {
      // 진화 > 새 무기(4개까지) > 무기 강화 > 패시브 순으로 고른다.
      const score = (c: LevelUpChoice): number =>
        c.kind === 'evolve' ? 5 : c.kind === 'weapon' && c.isNew && this.weapons.owned.length < 4 ? 4 : c.kind === 'weapon' && !c.isNew ? 3 : c.kind === 'passive' ? 2 : 1;
      let best = 0;
      this.choices.forEach((c, i) => {
        if (score(c) > score(this.choices[best])) best = i;
      });
      this.choose(best);
    }
  }

  private syncHud(): void {
    const p = this.player;
    if (this.loadoutDirty) {
      this.loadoutDirty = false;
      this.hudWeapons = this.weapons.owned.map((w) => ({
        id: w.id,
        name: w.evo ? w.evo.name : w.def.name,
        icon: w.def.icon,
        color: w.evo ? w.evo.color : w.def.color,
        level: w.level,
        evolved: !!w.evo,
      }));
      this.hudPassives = [...this.passives].map(([id, level]) => {
        const d = passiveById.get(id)!;
        return { id, name: d.name, icon: d.icon, level };
      });
    }
    const boss = this.boss && !this.boss.dead ? { name: this.boss.def.name, hp: this.boss.hp, maxHp: this.boss.maxHp } : null;
    setGame({
      hud: {
        night: this.opts.night,
        hp: Math.max(0, Math.ceil(p.hp)),
        maxHp: p.maxHp,
        xp: this.xp,
        xpNeed: xpNeeded(this.level),
        level: this.level,
        timeLeft: Math.max(0, this.def.duration - this.time),
        duration: this.def.duration,
        kills: this.kills,
        enemies: this.enemies.count,
        weapons: this.hudWeapons,
        passives: this.hudPassives,
        boss,
        awaken: p.awakened ? p.awakenLeft / p.awakenDuration : 0,
        awakenLeft: p.awakenUses,
        phase: this.phase === 'dawn' ? 'dawn' : this.phase === 'done' ? 'done' : 'fight',
        homeAngle: Math.atan2(HOME.z - p.z, HOME.x - p.x),
        homeDist: Math.hypot(HOME.x - p.x, HOME.z - p.z),
        late: Math.max(0, this.lateTimer - balance.night.dawnGrace),
        fatigueLabel: nightModifiers(this.opts.stats).fatigueLabel,
        hurt: this.hurtFlash,
      },
    });
  }

  // ---------- 테스트·디버그 ----------

  debug = {
    bot: (on: boolean): void => {
      this.bot = on;
      input.botActive = on;
    },
    skipTo: (seconds: number): void => {
      this.time = seconds;
    },
    give: (id: string, levels = 1): void => {
      for (let k = 0; k < levels; k++) {
        if (this.weapons.get(id)) this.weapons.levelUp(id);
        else this.weapons.add(id);
      }
      this.loadoutDirty = true;
    },
    evolve: (id: string): void => {
      this.weapons.evolve(id);
      this.loadoutDirty = true;
    },
    spawn: (count: number, type = 'minion'): void => {
      for (let k = 0; k < count; k++) this.spawnAround(type);
    },
    xp: (amount: number): void => this.collectGem(amount, 0, this.player.x, this.player.z),
    hurt: (amount: number): void => this.hurtPlayer(amount, this.player.x + 1, this.player.z),
    killAll: (): void => {
      for (let i = 0; i < this.enemies.high; i++) if (this.enemies.alive[i]) this.hit(i, 1e6, 0, 0, 0);
    },
    state: (): Record<string, unknown> => ({
      time: this.time,
      phase: this.phase,
      enemies: this.enemies.count,
      kills: this.kills,
      level: this.level,
      hp: this.player.hp,
      particles: this.particles.count,
      weapons: this.weapons.owned.map((w) => `${w.id}:${w.level}${w.evo ? '*' : ''}`),
      boss: this.boss ? { hp: this.boss.hp, mode: this.boss.mode } : null,
      pos: [this.player.x, this.player.z],
    }),
  };

  resize(): void {}

  dispose(): void {
    this.engine.timeScale = 1;
    this.engine.paused = false;
    input.botActive = false;
    this.postfx.hurt = 0;
    this.postfx.awaken = 0;
    this.boss?.dispose();
    this.weapons.dispose();
    this.enemies.dispose();
    this.shots.dispose();
    this.gems.dispose();
    this.fx.dispose();
    this.particles.dispose();
    this.numbers.dispose();
    this.aura.dispose();
    this.map.dispose();
    this.sky.dispose();
    this.player.dog.dispose();
    this.beacon.geometry.dispose();
    (this.beacon.material as THREE.Material).dispose();
    this.halo.geometry.dispose();
    (this.halo.material as THREE.Material).dispose();
    setGame({ levelUp: null, bossIntro: null });
  }
}

export const NIGHT_ASSETS = {
  kits: ['kaykit-city', 'kaykit-halloween'] as const,
  glbs: [...new Set(enemyTypes.filter((t) => t.clip).map((t) => `kaykit-skeletons/${t.visual}.glb`))],
};

// 밸런스 데이터(JSON)의 타입과 접근자. 수치는 전부 src/data/*.json 에 있다.
import balanceJson from './balance.json';
import actionsJson from './actions.json';
import eventsJson from './events.json';
import enemiesJson from './enemies.json';
import weaponsJson from './weapons.json';
import passivesJson from './passives.json';
import wavesJson from './waves.json';
import feelJson from './feel.json';
import qualityJson from './quality.json';

export type StatId = 'vitality' | 'strength' | 'agility' | 'focus' | 'bond';
export const STAT_IDS: StatId[] = ['vitality', 'strength', 'agility', 'focus', 'bond'];
export const STAT_NAMES: Record<StatId | 'fatigue', string> = {
  vitality: '체력',
  strength: '근력',
  agility: '민첩',
  focus: '집중',
  bond: '유대감',
  fatigue: '피로도',
};

export interface Stats {
  vitality: number;
  strength: number;
  agility: number;
  focus: number;
  bond: number;
  fatigue: number;
}

export interface ActionDef {
  id: string;
  name: string;
  icon: string;
  hours: number;
  fatigue: number;
  maxPerDay: number;
  gains: Partial<Record<StatId, number>>;
  suspicion?: number;
  desc: string;
  thought: string;
}

export interface EventChoice {
  label: string;
  result: string;
  gains: Partial<Record<StatId, number>>;
  suspicion: number;
  fatigue?: number;
  ownerLine: string;
}

export interface EventDef {
  id: string;
  title: string;
  actor: 'delivery' | 'cat' | 'friend' | 'owner';
  text: string;
  thought: string;
  choices: EventChoice[];
}

export interface EnemyTypeDef {
  id: string;
  name: string;
  visual: string;
  clip?: string;
  scale: number;
  hp: number;
  speed: number;
  damage: number;
  xp: number;
  radius: number;
  mass: number;
  color: string;
  burst: string;
  hop?: boolean;
  float?: boolean;
  ranged?: { range: number; cooldown: number; speed: number; damage: number };
}

export type BossBehavior = 'slammer' | 'charger' | 'caster' | 'hybrid' | 'final';

export interface BossDef {
  id: string;
  name: string;
  title: string;
  visual: string;
  kind: 'prop' | 'skinned' | 'core';
  scale: number;
  hp: number;
  speed: number;
  damage: number;
  radius: number;
  behavior: BossBehavior;
  summon?: string;
  tint: string;
  glow: string;
}

export type WeaponKind = 'nova' | 'orbit' | 'beam' | 'boomerang' | 'zone' | 'bounce' | 'chain' | 'dash';

export interface WeaponStats {
  damage: number;
  cooldown: number;
  area: number;
  knockback: number;
  duration?: number;
  count?: number;
  tick?: number;
  width?: number;
  speed?: number;
  size?: number;
  bounces?: number;
  jumps?: number;
  speedBoost?: number;
  stun?: number;
  rings?: number;
  bolts?: number;
  pull?: number;
  sweep?: number;
  critBonus?: number;
  trail?: number;
  explode?: number;
  explodeRadius?: number;
  invuln?: number;
  endNova?: number;
}

export interface WeaponDef {
  id: string;
  name: string;
  kind: WeaponKind;
  icon: string;
  color: string;
  desc: string;
  evolve: { into: string; passive: string };
  levels: WeaponStats[];
}

export interface EvolutionDef {
  id: string;
  from: string;
  name: string;
  kind: WeaponKind;
  icon: string;
  color: string;
  desc: string;
  stats: WeaponStats;
}

export type PassiveStat = 'might' | 'cooldown' | 'area' | 'speed' | 'magnet' | 'maxHp' | 'crit' | 'armor';

export interface PassiveDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  stat: PassiveStat;
  perLevel: number;
  regen?: number;
  max: number;
}

export interface WaveSegment {
  from: number;
  to: number;
  rate: [number, number];
  mix: Record<string, number>;
}

export interface WaveBurst {
  at: number;
  type: string;
  count: number;
  pattern: 'ring' | 'side';
}

export interface NightDef {
  duration: number;
  bossAt: number;
  boss: string;
  eliteEvery: number;
  eliteType: string;
  segments: WaveSegment[];
  bursts: WaveBurst[];
}

export type QualityId = 'low' | 'medium' | 'high';

export interface QualityDef {
  label: string;
  pixelRatio: number;
  composer: boolean;
  bloom: boolean;
  bloomScale: number;
  smaa: boolean;
  shadows: boolean;
  particleScale: number;
  fireflies: number;
  lightCones: boolean;
  fog: boolean;
  chromatic: boolean;
  dof: boolean;
  leaves: number;
  maxDamageNumbers: number;
  /** 적 메시 삼각형 비율(1 = 원본). 낮을수록 가볍다. */
  enemyDetail: number;
}

export const balance = balanceJson;
export const feel = feelJson;
export const actions = actionsJson as unknown as ActionDef[];
export const dayEvents = eventsJson as unknown as EventDef[];
export const enemyTypes = enemiesJson.types as unknown as EnemyTypeDef[];
export const eliteTuning = enemiesJson.elite;
export const bosses = enemiesJson.bosses as unknown as BossDef[];
export const bossTuning = enemiesJson.bossTuning;
export const weapons = weaponsJson.weapons as unknown as WeaponDef[];
export const evolutions = weaponsJson.evolutions as unknown as EvolutionDef[];
export const passives = passivesJson as unknown as PassiveDef[];
export const nights = wavesJson.nights as unknown as NightDef[];
export const qualities = qualityJson as unknown as Record<QualityId, QualityDef>;

export const enemyTypeIndex = new Map(enemyTypes.map((t, i) => [t.id, i]));
export const weaponById = new Map(weapons.map((w) => [w.id, w]));
export const evolutionById = new Map(evolutions.map((e) => [e.id, e]));
export const passiveById = new Map(passives.map((p) => [p.id, p]));
export const bossById = new Map(bosses.map((b) => [b.id, b]));
export const actionById = new Map(actions.map((a) => [a.id, a]));

export function nightDef(night: number): NightDef {
  return nights[Math.min(nights.length, Math.max(1, night)) - 1];
}

/** 낮 스탯이 밤 전투에 주는 효과를 계산한다. */
export interface NightModifiers {
  maxHp: number;
  might: number;
  speed: number;
  dodge: number;
  cooldown: number;
  startHpRatio: number;
  fatigueLabel: string | null;
  awakenDuration: number;
  awakenMight: number;
  awakenHeal: number;
  awakenUses: number;
}

export function nightModifiers(stats: Stats): NightModifiers {
  const e = balance.nightEffects;
  let speedMul = 1 + stats.agility * e.speedPerAgility;
  let cooldown = 1 - stats.focus * e.cooldownPerFocus;
  let startHpRatio = 1;
  let fatigueLabel: string | null = null;
  for (const tier of e.fatigueTiers) {
    if (stats.fatigue >= tier.at) {
      speedMul = 1 + stats.agility * e.speedPerAgility + tier.speed;
      cooldown = 1 - stats.focus * e.cooldownPerFocus + tier.cooldown;
      startHpRatio = tier.hp;
      fatigueLabel = tier.label;
    }
  }
  return {
    maxHp: Math.round(e.baseHp + stats.vitality * e.hpPerVitality),
    might: 1 + stats.strength * e.mightPerStrength,
    speed: e.baseSpeed * speedMul,
    dodge: stats.agility * e.dodgePerAgility,
    cooldown,
    startHpRatio,
    fatigueLabel,
    awakenDuration: e.awaken.baseDuration + stats.bond * e.awaken.durationPerBond,
    awakenMight: e.awaken.baseMight + stats.bond * e.awaken.mightPerBond,
    awakenHeal: stats.bond * e.awaken.healPerBond,
    awakenUses: stats.bond >= e.awaken.secondUseBond ? 2 : 1,
  };
}

export function xpNeeded(level: number): number {
  const x = balance.xp;
  return Math.floor(x.base + level * x.perLevel + Math.pow(level, x.power));
}

export function suspicionTier(value: number): number {
  const tiers = balance.suspicion.tiers;
  let tier = 0;
  for (let i = 0; i < tiers.length; i++) if (value >= tiers[i]) tier = i;
  return tier;
}

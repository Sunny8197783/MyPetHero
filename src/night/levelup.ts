import type { Rng } from '../core/rng';
import type { LevelUpChoice, NightResult, SuspicionPart } from '../core/store';
import { balance, evolutionById, passives, weapons, type WeaponStats } from '../data';
import type { WeaponSystem } from './weapons';

const LABELS: Partial<Record<keyof WeaponStats, string>> = {
  damage: '피해',
  cooldown: '쿨다운',
  area: '범위',
  count: '개수',
  duration: '지속',
  bounces: '튕김',
  jumps: '연쇄',
  width: '굵기',
  knockback: '넉백',
  size: '크기',
};

function diff(prev: WeaponStats, next: WeaponStats): string {
  const parts: string[] = [];
  for (const key of Object.keys(LABELS) as (keyof WeaponStats)[]) {
    const a = prev[key];
    const b = next[key];
    if (a === undefined || b === undefined || a === b) continue;
    const unit = key === 'cooldown' || key === 'duration' ? '초' : '';
    parts.push(`${LABELS[key]} ${a}${unit}→${b}${unit}`);
  }
  return parts.join(' · ') || '강화';
}

/** 레벨업 3지선다를 뽑는다. 진화 조건이 되면 진화 카드가 우선 나온다. */
export function rollChoices(rng: Rng, ws: WeaponSystem, passiveLevels: Map<string, number>): LevelUpChoice[] {
  const p = balance.player;
  const evolves: LevelUpChoice[] = [];
  const pool: LevelUpChoice[] = [];

  for (const w of ws.owned) {
    if (w.evo) continue;
    const evo = evolutionById.get(w.def.evolve.into);
    if (w.level >= w.def.levels.length) {
      if (evo && passiveLevels.has(w.def.evolve.passive)) {
        evolves.push({ kind: 'evolve', id: w.id, name: evo.name, desc: evo.desc, icon: evo.icon, color: evo.color, level: 0, isNew: false });
      }
      continue;
    }
    pool.push({
      kind: 'weapon', id: w.id, name: w.def.name, icon: w.def.icon, color: w.def.color, level: w.level + 1, isNew: false,
      desc: diff(w.def.levels[w.level - 1], w.def.levels[w.level]),
    });
  }
  if (ws.owned.length < p.maxWeapons) {
    for (const def of weapons) {
      if (ws.get(def.id)) continue;
      pool.push({ kind: 'weapon', id: def.id, name: def.name, icon: def.icon, color: def.color, level: 1, isNew: true, desc: def.desc });
    }
  }
  for (const def of passives) {
    const lv = passiveLevels.get(def.id) ?? 0;
    if (lv >= def.max) continue;
    if (lv === 0 && passiveLevels.size >= p.maxPassives) continue;
    const pair = weapons.find((w) => w.evolve.passive === def.id);
    const hint = pair && ws.get(pair.id) && !ws.get(pair.id)!.evo ? ` (${pair.name} 진화 재료)` : '';
    pool.push({ kind: 'passive', id: def.id, name: def.name, icon: def.icon, color: '#cfd8ff', level: lv + 1, isNew: lv === 0, desc: def.desc + hint });
  }

  rng.shuffle(pool);
  const out = [...rng.shuffle(evolves).slice(0, 2), ...pool].slice(0, 3);
  while (out.length < 3) {
    out.push({ kind: 'heal', id: `heal${out.length}`, name: '비상 간식', icon: 'snack', color: '#ff9db8', level: 0, isNew: false, desc: '체력을 30% 회복한다.' });
  }
  return out;
}

export interface NightTally {
  night: number;
  kills: number;
  eliteKills: number;
  bossKilled: boolean;
  bossEscaped: boolean;
  bossName: string;
  damageTaken: number;
  maxHp: number;
  lateSeconds: number;
  yardKills: number;
  knockedOut: boolean;
  level: number;
}

/** 밤의 결과를 의심도 변화와 점수로 환산한다. */
export function tallyNight(t: NightTally): NightResult {
  const s = balance.suspicion.night;
  const sc = balance.score;
  const parts: SuspicionPart[] = [];
  const ratio = Math.min(1, t.damageTaken / Math.max(1, t.maxHp));
  const injury = Math.round(ratio * s.perDamageRatio);
  if (injury > 0) parts.push({ label: `다친 정도 (${Math.round(ratio * 100)}%)`, value: injury });
  const late = Math.round(t.lateSeconds * s.perLateSecond);
  if (late > 0) parts.push({ label: `늦은 귀가 (+${t.lateSeconds.toFixed(0)}초)`, value: late });
  const mess = Math.min(s.yardKillCap, Math.round(t.yardKills * s.perYardKill));
  if (mess > 0) parts.push({ label: `엉망이 된 마당 (${t.yardKills}마리)`, value: mess });
  if (t.knockedOut) parts.push({ label: '현관 앞에서 기절한 채 발견', value: s.knockedOut });
  if (t.bossEscaped) parts.push({ label: '놓친 보스가 동네를 어지럽힘', value: s.bossEscaped });
  const noDamage = t.damageTaken <= 0 && !t.knockedOut;
  if (noDamage) parts.push({ label: '털끝 하나 안 다침', value: s.perfectBonus });
  if (parts.length === 0) parts.push({ label: '흔적 없음', value: 0 });
  const suspicionDelta = parts.reduce((a, p) => a + p.value, 0);
  const scoreGain =
    t.kills * sc.perKill + t.eliteKills * sc.perEliteKill + (t.bossKilled ? sc.perBoss : 0) + (noDamage ? sc.noDamageNight : 0);
  return {
    night: t.night,
    kills: t.kills,
    eliteKills: t.eliteKills,
    bossKilled: t.bossKilled,
    bossName: t.bossName,
    damageTaken: Math.round(t.damageTaken),
    maxHp: t.maxHp,
    lateSeconds: t.lateSeconds,
    yardKills: t.yardKills,
    knockedOut: t.knockedOut,
    level: t.level,
    suspicionDelta,
    suspicionParts: parts,
    scoreGain,
    noDamage,
  };
}

import { balance } from '../data';
import { DEFAULT_SETTINGS, type Campaign, type RankEntry, type Settings } from './store';

const KEY_SAVE = 'herodog.save.v1';
const KEY_SETTINGS = 'herodog.settings.v1';
const KEY_RANK = 'herodog.rank.v1';

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* 저장소를 쓸 수 없는 환경에서는 조용히 넘어간다. */
  }
}

export function newCampaign(): Campaign {
  return {
    version: 1,
    day: 1,
    hour: balance.campaign.dayStartHour,
    stage: 'day',
    stats: { ...balance.stats.start },
    suspicion: balance.suspicion.start,
    actionCounts: {},
    eventsToday: 0,
    seenEvents: [],
    totalKills: 0,
    bossKills: 0,
    eliteKills: 0,
    noDamageNights: 0,
    caughtFlags: 0,
    closeCalls: 0,
    score: 0,
    flags: {},
    results: [],
    seed: (Date.now() & 0x7fffffff) || 1,
  };
}

export function loadCampaign(): Campaign | null {
  const c = read<Campaign>(KEY_SAVE);
  if (!c || c.version !== 1 || typeof c.day !== 'number' || !c.stats) return null;
  return c;
}

export function saveCampaign(c: Campaign): void {
  write(KEY_SAVE, c);
}

export function clearCampaign(): void {
  remove(KEY_SAVE);
}

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...(read<Partial<Settings>>(KEY_SETTINGS) ?? {}) };
}

export function saveSettings(s: Settings): void {
  write(KEY_SETTINGS, s);
}

export function loadRanking(): RankEntry[] {
  const list = read<RankEntry[]>(KEY_RANK);
  return Array.isArray(list) ? list.filter((e) => typeof e?.score === 'number').slice(0, 10) : [];
}

export function addRanking(entry: RankEntry): RankEntry[] {
  const list = [...loadRanking(), entry].sort((a, b) => b.score - a.score).slice(0, 10);
  write(KEY_RANK, list);
  return list;
}

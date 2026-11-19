import { create } from 'zustand';
import type { EventChoice, EventDef, QualityId, Stats } from '../data';

export type Screen = 'loading' | 'title' | 'day' | 'night' | 'result' | 'cutscene' | 'closecall' | 'ending' | 'ranking';

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  quality: QualityId;
  shake: boolean;
  damageNumbers: boolean;
}

export interface SuspicionPart {
  label: string;
  value: number;
}

export interface NightResult {
  night: number;
  kills: number;
  eliteKills: number;
  bossKilled: boolean;
  bossName: string;
  damageTaken: number;
  maxHp: number;
  lateSeconds: number;
  yardKills: number;
  knockedOut: boolean;
  level: number;
  suspicionDelta: number;
  suspicionParts: SuspicionPart[];
  scoreGain: number;
  noDamage: boolean;
}

export type EndingId = 'secret' | 'caught' | 'true';

export interface Campaign {
  version: 1;
  day: number;
  hour: number;
  stage: 'day' | 'night';
  stats: Stats;
  suspicion: number;
  actionCounts: Record<string, number>;
  eventsToday: number;
  seenEvents: string[];
  totalKills: number;
  bossKills: number;
  eliteKills: number;
  noDamageNights: number;
  caughtFlags: number;
  closeCalls: number;
  score: number;
  flags: Record<string, boolean>;
  results: NightResult[];
  seed: number;
}

export interface RankEntry {
  score: number;
  kills: number;
  ending: EndingId;
  date: string;
}

export interface StatLine {
  label: string;
  delta: number;
}

export interface DayUi {
  busy: boolean;
  popup: { title: string; lines: StatLine[]; note?: string } | null;
  ownerLine: string | null;
  thought: string | null;
  event: EventDef | null;
  eventResult: EventChoice | null;
}

export interface HudWeapon {
  id: string;
  name: string;
  icon: string;
  color: string;
  level: number;
  evolved: boolean;
}

export interface NightHud {
  night: number;
  hp: number;
  maxHp: number;
  xp: number;
  xpNeed: number;
  level: number;
  timeLeft: number;
  duration: number;
  kills: number;
  enemies: number;
  weapons: HudWeapon[];
  passives: { id: string; name: string; icon: string; level: number }[];
  boss: { name: string; hp: number; maxHp: number } | null;
  awaken: number;
  awakenLeft: number;
  phase: 'fight' | 'dawn' | 'done';
  homeAngle: number;
  homeDist: number;
  late: number;
  fatigueLabel: string | null;
  hurt: number;
}

export interface LevelUpChoice {
  kind: 'weapon' | 'passive' | 'evolve' | 'heal';
  id: string;
  name: string;
  desc: string;
  icon: string;
  color: string;
  level: number;
  isNew: boolean;
}

export type Speaker = 'dog' | 'owner' | 'cat' | 'narr' | 'boss' | 'friend' | 'delivery' | 'news';

export interface CutLine {
  who: Speaker;
  name: string;
  text: string;
  thought: boolean;
  mood?: string;
  seq: number;
}

export interface CutUi {
  active: boolean;
  letterbox: boolean;
  line: CutLine | null;
  skippable: boolean;
  card: { title: string; subtitle?: string } | null;
  fade: number;
  fadeColor: string;
}

export interface CloseCallUi {
  round: number;
  total: number;
  prompt: string;
  options: { label: string; good: boolean }[];
  time: number;
  successes: number;
  feedback: string | null;
  done: boolean;
}

export interface GameState {
  screen: Screen;
  loading: { progress: number; tip: string; done: boolean };
  settings: Settings;
  campaign: Campaign | null;
  hasSave: boolean;
  ranking: RankEntry[];
  paused: boolean;
  settingsOpen: boolean;
  day: DayUi;
  hud: NightHud;
  levelUp: LevelUpChoice[] | null;
  /** 게임패드·키보드로 고르는 중인 카드. */
  levelUpFocus: number;
  result: NightResult | null;
  cut: CutUi;
  closeCall: CloseCallUi | null;
  ending: EndingId | null;
  bossIntro: { name: string; title: string } | null;
  toast: { text: string; seq: number } | null;
  showFps: boolean;
  fpsText: string;
}

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8,
  music: 0.6,
  sfx: 0.8,
  quality: 'medium',
  shake: true,
  damageNumbers: true,
};

export const EMPTY_HUD: NightHud = {
  night: 1,
  hp: 100,
  maxHp: 100,
  xp: 0,
  xpNeed: 5,
  level: 1,
  timeLeft: 0,
  duration: 1,
  kills: 0,
  enemies: 0,
  weapons: [],
  passives: [],
  boss: null,
  awaken: 0,
  awakenLeft: 0,
  phase: 'fight',
  homeAngle: 0,
  homeDist: 0,
  late: 0,
  fatigueLabel: null,
  hurt: 0,
};

export const EMPTY_CUT: CutUi = {
  active: false,
  letterbox: false,
  line: null,
  skippable: true,
  card: null,
  fade: 0,
  fadeColor: '#000',
};

export const EMPTY_DAY: DayUi = { busy: false, popup: null, ownerLine: null, thought: null, event: null, eventResult: null };

export const useGame = create<GameState>(() => ({
  screen: 'loading',
  loading: { progress: 0, tip: '', done: false },
  settings: DEFAULT_SETTINGS,
  campaign: null,
  hasSave: false,
  ranking: [],
  paused: false,
  settingsOpen: false,
  day: EMPTY_DAY,
  hud: EMPTY_HUD,
  levelUp: null,
  levelUpFocus: 1,
  result: null,
  cut: EMPTY_CUT,
  closeCall: null,
  ending: null,
  bossIntro: null,
  toast: null,
  showFps: false,
  fpsText: '',
}));

export const getGame = useGame.getState;
export const setGame = useGame.setState;

let toastSeq = 0;
export function toast(text: string): void {
  setGame({ toast: { text, seq: ++toastSeq } });
}

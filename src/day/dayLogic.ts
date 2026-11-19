import type { Rng } from '../core/rng';
import type { Campaign, StatLine } from '../core/store';
import { balance, dayEvents, STAT_IDS, STAT_NAMES, suspicionTier, type ActionDef, type EventChoice, type EventDef, type StatId } from '../data';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function hoursLeft(c: Campaign): number {
  return balance.campaign.dayEndHour - c.hour;
}

/** 이 행동을 지금 할 수 있는지, 안 되면 이유. */
export function actionBlock(c: Campaign, a: ActionDef): string | null {
  if (a.hours > hoursLeft(c)) return '시간이 부족하다';
  if ((c.actionCounts[a.id] ?? 0) >= a.maxPerDay) return '오늘은 충분히 했다';
  if (a.fatigue > 0 && c.stats.fatigue + a.fatigue > 100) return '너무 피곤하다';
  return null;
}

/** 피로할수록, 같은 행동을 반복할수록 효과가 줄어든다. */
function gainMultiplier(c: Campaign, a: ActionDef): number {
  const repeats = c.actionCounts[a.id] ?? 0;
  let m = Math.pow(balance.stats.repeatPenalty, repeats);
  if (c.stats.fatigue >= 85) m *= 0.5;
  else if (c.stats.fatigue >= 60) m *= 0.75;
  return m;
}

function applyGains(c: Campaign, gains: Partial<Record<StatId, number>>, mult: number, lines: StatLine[]): void {
  for (const id of STAT_IDS) {
    const g = gains[id];
    if (!g) continue;
    const before = c.stats[id];
    const delta = g > 0 ? Math.max(1, Math.round(g * mult)) : g;
    c.stats[id] = clamp(before + delta, 0, balance.stats.max);
    if (c.stats[id] !== before) lines.push({ label: STAT_NAMES[id], delta: c.stats[id] - before });
  }
}

function applyFatigue(c: Campaign, delta: number, lines: StatLine[]): void {
  if (!delta) return;
  const before = c.stats.fatigue;
  c.stats.fatigue = clamp(before + delta, 0, 100);
  if (c.stats.fatigue !== before) lines.push({ label: STAT_NAMES.fatigue, delta: c.stats.fatigue - before });
}

function applySuspicion(c: Campaign, delta: number, lines: StatLine[]): void {
  if (!delta) return;
  const before = c.suspicion;
  c.suspicion = clamp(before + delta, 0, 100);
  if (c.suspicion !== before) lines.push({ label: '의심도', delta: c.suspicion - before });
}

/** 낮 행동을 적용하고 변화 목록을 돌려준다. c 를 직접 고친다. */
export function applyAction(c: Campaign, a: ActionDef): StatLine[] {
  const lines: StatLine[] = [];
  applyGains(c, a.gains, gainMultiplier(c, a), lines);
  applyFatigue(c, a.fatigue, lines);
  applySuspicion(c, a.suspicion ?? 0, lines);
  c.hour += a.hours;
  c.actionCounts[a.id] = (c.actionCounts[a.id] ?? 0) + 1;
  return lines;
}

/** 행동 뒤에 일어날 수 있는 일상 이벤트를 뽑는다. */
export function rollEvent(c: Campaign, rng: Rng): EventDef | null {
  const cfg = balance.campaign;
  if (c.eventsToday >= cfg.maxEventsPerDay || hoursLeft(c) <= 0) return null;
  if (!rng.chance(cfg.eventChance)) return null;
  let pool = dayEvents.filter((e) => !c.seenEvents.includes(e.id));
  if (pool.length === 0) {
    c.seenEvents = [];
    pool = dayEvents;
  }
  // 고양이는 3밤에 정체를 눈치챈 뒤로는 더 자주 온다.
  const ev = rng.pick(pool);
  c.seenEvents.push(ev.id);
  c.eventsToday++;
  return ev;
}

export function applyEventChoice(c: Campaign, choice: EventChoice): StatLine[] {
  const lines: StatLine[] = [];
  applyGains(c, choice.gains, 1, lines);
  applyFatigue(c, choice.fatigue ?? 0, lines);
  applySuspicion(c, choice.suspicion, lines);
  return lines;
}

/** 새 날을 시작한다: 시계, 행동 횟수, 의심도 자연 감소. */
export function startNewDay(c: Campaign): void {
  c.day += 1;
  c.hour = balance.campaign.dayStartHour;
  c.stage = 'day';
  c.actionCounts = {};
  c.eventsToday = 0;
  c.suspicion = clamp(c.suspicion - balance.suspicion.dailyDecay, 0, 100);
}

const ACTION_REACTIONS: Record<string, string[]> = {
  walk: ['오늘 날씨 좋다, 그치?', '너 왜 자꾸 3번 가로등 앞에서 멈춰?', '…산책 코스를 네가 정하는 것 같은데.', '어젯밤 GPS 기록이랑 똑같은 길이네?'],
  meal: ['천천히 먹어!', '요즘 밥을 두 배로 먹네. 밤에 운동이라도 하니?', '밥그릇이 3초 만에 비었어.', '사료가 이렇게 빨리 줄 리가 없는데…'],
  tug: ['으악, 너 힘 세졌다!', '방금 내 발이 바닥에서 떴는데…?', '밧줄이 끊어지려고 해. 새 건데.', '…너 지금 봐준 거지? 그치?'],
  fetch: ['잘했어! 한 번 더!', '공이 땅에 닿기도 전에 물었네?', '방금 점프 높이가… 담장 넘었는데.', '공을 던지기 전에 뛰었어. 어떻게 알았어?'],
  train: ['앉아! 옳지!', '"기다려"를 이렇게 잘하는 개는 처음 봐.', '눈빛이 너무 진지해서 내가 긴장돼.', '혹시 내 말, 단어까지 다 알아듣니?'],
  nap: ['잘 자네.', '낮에 이렇게 자면 밤에 뭐 해?', '어제도 열두 시간 잤잖아.', '자면서 발을 구르던데. 뭘 쫓는 꿈이야?'],
  pet: ['우리 호두 예쁘다.', '털에서 풀 냄새가 나네.', '등에 이 그을음은 뭐야?', '…정전기가 엄청 나. 따가워!'],
  tv: ['이 드라마 재밌지?', '뉴스에 우리 동네 나온다.', '"정체불명의 짐승"이래. 무섭다, 그치?', '저 흐릿한 실루엣… 꼬리가 너랑 닮았어.'],
  run: ['와, 빠르다!', '방금 잔상 보였어. 내 눈이 이상한가.', '잔디가 탔어. 달리기만 했는데.', '속도 측정 앱이 "오류"래.'],
};

/** 행동 뒤 주인의 반응 대사. 의심도 단계가 높을수록 수상해한다. */
export function ownerReaction(actionId: string, suspicion: number): string {
  const list = ACTION_REACTIONS[actionId] ?? ['좋았어!'];
  return list[Math.min(list.length - 1, suspicionTier(suspicion))];
}

export const TIER_NAMES = ['평온', '갸웃', '수상', '감시', '위기'];

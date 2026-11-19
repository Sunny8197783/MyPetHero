// 컷씬 스크립트(데이터). 각 함수는 Step 배열을 돌려주고 CutscenePlayer 가 실행한다.
import type { Campaign, EndingId, NightResult } from '../core/store';
import { suspicionTier } from '../data';
import { CRATER, HOME } from '../night/map';
import type { Step } from './CutscenePlayer';

type V3 = [number, number, number];

const HOUSE_CAM: { pos: V3; look: V3 } = { pos: [2.5, 12.5, 15.5], look: [1.6, 0.8, -1.2] };
const CUSHION: [number, number] = [5.3, 1.6];
const BED: [number, number] = [5.6, -3.4];
const DOOR: [number, number] = [8.6, 1.2];
const GATE: [number, number] = [HOME.x, HOME.z + 2];

const say = (who: 'owner' | 'cat' | 'narr' | 'boss' | 'friend' | 'delivery' | 'news', text: string): Step => ({ t: 'say', who, text });
const think = (text: string): Step => ({ t: 'think', text });
const wait = (dur: number): Step => ({ t: 'wait', dur });

/** 주인을 침대에 눕힌다. */
const ownerInBed: Step[] = [
  { t: 'place', actor: 'owner', pos: BED, y: 0.95, face: Math.PI },
  { t: 'pose', actor: 'owner', lie: true },
];
const dogOnCushion: Step[] = [
  { t: 'place', actor: 'dog', pos: CUSHION, face: 2.2 },
  { t: 'pose', actor: 'dog', lie: true },
];

// ---------- 프롤로그 ----------
export function prologue(): Step[] {
  return [
    { t: 'fade', to: 1, dur: 0 },
    { t: 'stage', id: 'house', sky: 'rain', look: 'rain' },
    { t: 'music', id: 'cutscene' },
    { t: 'fx', kind: 'rain', value: 1 },
    { t: 'fx', kind: 'lightsOn' },
    { t: 'place', actor: 'owner', pos: [20, 2.2], face: -Math.PI / 2 },
    { t: 'place', actor: 'dog', pos: [22.5, 3.2], face: -Math.PI / 2 },
    { t: 'cam', pos: [20, 6, 13], look: [19, 1.2, 2] },
    { t: 'fade', to: 0, dur: 1.2 },
    { t: 'card', title: '우리 집 개는 영웅', subtitle: '프롤로그 · 비 오는 날', dur: 2.6 },
    say('narr', '비가 오던 날이었다. 골목 끝 상자 안에서, 여우를 닮은 개 한 마리가 떨고 있었다.'),
    { t: 'cam', pos: [14, 7, 13], look: [12, 1, 1.5], dur: 3, wait: false },
    { t: 'move', actor: 'owner', to: [10.5, 1.4], dur: 2.6, wait: false },
    { t: 'move', actor: 'dog', to: [12.4, 2.2], dur: 2.8 },
    say('owner', '괜찮아. 이제 여기가 네 집이야.'),
    think('(집. 지붕이 있고, 따뜻하고, 밥 냄새가 난다.)'),
    { t: 'cam', pos: HOUSE_CAM.pos, look: HOUSE_CAM.look, dur: 2.4, wait: false },
    { t: 'move', actor: 'owner', to: [0.2, 0.2], dur: 2.6, wait: false },
    { t: 'move', actor: 'dog', to: [1.8, 1.0], dur: 2.8 },
    { t: 'face', actor: 'owner', to: [1.8, 1.0] },
    { t: 'face', actor: 'dog', to: [0.2, 0.2] },
    say('owner', '이름은… 털이 호두색이니까, 호두! 어때?'),
    { t: 'hop', actor: 'dog', times: 2 },
    think('(호두. 나쁘지 않다. "여우"라고 부르는 것보단 낫다.)'),
    { t: 'fade', to: 1, dur: 0.8 },
    { t: 'fx', kind: 'rain', value: 0 },
    { t: 'stage', id: 'house', sky: 'night', look: 'night' },
    { t: 'fx', kind: 'lightsOff' },
    ...ownerInBed,
    ...dogOnCushion,
    { t: 'cam', pos: [7.5, 5.5, 8.5], look: [5.2, 0.6, 0.6] },
    { t: 'dof', value: 1, focus: 9 },
    { t: 'fade', to: 0, dur: 1 },
    say('narr', '그날 밤.'),
    { t: 'fx', kind: 'meteor' },
    wait(1.1),
    { t: 'flash', color: '#bff6ff' },
    { t: 'pose', actor: 'dog' },
    { t: 'fx', kind: 'dogBang' },
    think('(!? 하늘에서… 간식이 떨어졌다.)'),
    { t: 'fx', kind: 'meteorEat' },
    think('(꿀꺽. …맛은 없다. 그런데 배 속이 뜨겁다.)'),
    { t: 'fx', kind: 'glowEyes', value: 1 },
    { t: 'fx', kind: 'aura', value: 1 },
    { t: 'sfx', id: 'awaken', volume: 0.9 },
    { t: 'flash', color: '#7df9ff' },
    { t: 'fx', kind: 'shake', value: 0.4 },
    { t: 'cam', pos: [6.4, 3.4, 5.6], look: [5.2, 0.9, 1.4], dur: 1.6 },
    think('(몸이 가볍다. 눈에서 빛이 난다. 이건 사료로는 설명이 안 된다.)'),
    say('owner', '으음… 호두야… 불 꺼…'),
    think('(불은 내 눈이다, 주인.)'),
    { t: 'dof', value: 0 },
    { t: 'fade', to: 1, dur: 0.8 },
  ];
}

// ---------- 첫 각성: 첫 몬스터 ----------
export function awakening(): Step[] {
  return [
    { t: 'stage', id: 'street', sky: 'night', look: 'night' },
    { t: 'music', id: 'cutscene' },
    { t: 'place', actor: 'dog', pos: GATE, face: 0 },
    { t: 'place', actor: 'skel1', pos: [HOME.x + 5, HOME.z + 12], face: Math.PI },
    { t: 'place', actor: 'skel2', pos: [0, 0], visible: false },
    { t: 'place', actor: 'skel3', pos: [0, 0], visible: false },
    { t: 'cam', pos: [HOME.x + 3, 6, HOME.z + 20], look: [HOME.x + 2, 1, HOME.z + 6] },
    { t: 'fx', kind: 'glowEyes', value: 1 },
    { t: 'fade', to: 0, dur: 1 },
    say('narr', '창밖에서 달그락거리는 소리가 났다.'),
    { t: 'fx', kind: 'spawn' },
    wait(0.9),
    { t: 'anim', actor: 'skel1', clip: 'Walking_A' },
    { t: 'move', actor: 'skel1', to: [HOME.x + 2.5, HOME.z + 8], dur: 1.8 },
    { t: 'fx', kind: 'dogBang' },
    think('(뼈다. 걸어 다니는 뼈다. …간식인가? 아니다, 적이다.)'),
    { t: 'anim', actor: 'skel1', clip: 'Taunt', once: true },
    think('(저게 주인 방 창문 쪽으로 간다. 안 돼.)'),
    { t: 'cam', pos: [HOME.x + 5, 4, HOME.z + 9], look: [HOME.x + 0.5, 1, HOME.z + 4], dur: 0.8 },
    { t: 'fx', kind: 'aura', value: 1 },
    { t: 'fx', kind: 'bark', value: 1.2 },
    { t: 'flash', color: '#fff0c0' },
    { t: 'fx', kind: 'smash' },
    wait(0.8),
    think('(멍! …방금 내 입에서 충격파가 나갔다.)'),
    think('(좋아. 주인은 내가 지킨다. 대신 주인은 몰라야 한다. 알면 동물병원에 데려갈 테니까.)'),
    { t: 'fade', to: 1, dur: 0.8 },
    { t: 'card', title: '1일째', subtitle: '낮에는 평범한 개, 밤에는 동네의 영웅', dur: 2.4 },
  ];
}

// ---------- 저녁: 해가 지고 주인이 불을 끈다 ----------
const EVENING_LINES = [
  '오늘도 수고했어, 호두. 잘 자.',
  '잘 자. …내일 아침에도 졸면 병원 간다?',
  '현관문 잠갔고, 창문 잠갔고. 좋아. 잘 자.',
  '홈캠 켰다. 잘 자, 호두. …진짜 자는 거다?',
  '오늘은 내가 문 앞에서 잘까 봐. 농담이야. …반은.',
];

export function evening(c: Campaign): Step[] {
  const tier = suspicionTier(c.suspicion);
  return [
    { t: 'stage', id: 'house' },
    { t: 'music', id: 'cutscene' },
    { t: 'cam', pos: HOUSE_CAM.pos, look: HOUSE_CAM.look },
    { t: 'place', actor: 'owner', pos: [-0.6, -0.4], face: 0.5 },
    { t: 'place', actor: 'dog', pos: [1.4, 0.8], face: -0.8 },
    { t: 'fx', kind: 'lightsOn' },
    { t: 'look', id: 'dusk', dur: 2.4 },
    { t: 'sky', from: 'day', to: 'dusk', dur: 2.0 },
    { t: 'sky', from: 'dusk', to: 'night', dur: 2.2, wait: false },
    { t: 'look', id: 'night', dur: 2.6 },
    { t: 'move', actor: 'dog', to: CUSHION, dur: 1.4, wait: false },
    { t: 'move', actor: 'owner', to: [4.2, -1.6], dur: 2.0 },
    { t: 'face', actor: 'owner', to: CUSHION },
    ...dogOnCushion,
    say('owner', EVENING_LINES[tier]),
    ...ownerInBed,
    wait(0.5),
    { t: 'fx', kind: 'lightsOff' },
    { t: 'cam', pos: [7.6, 4.6, 7.8], look: [5.2, 0.7, 0.9], dur: 2.2 },
    { t: 'sfx', id: 'snore', volume: 0.5 },
    wait(0.7),
    { t: 'pose', actor: 'dog' },
    { t: 'fx', kind: 'glowEyes', value: 1 },
    { t: 'sfx', id: 'pop', volume: 0.5, rate: 1.6 },
    think(c.day === 1 ? '(주인의 숨소리가 고르다. …출동이다.)' : '(잠들었다. 방석은 따뜻하게 두고 간다.)'),
    { t: 'fade', to: 1, dur: 0.7 },
  ];
}

// ---------- 밤 출동 (밤마다 다른 장면) ----------
export function sortie(c: Campaign): Step[] {
  const n = c.day;
  const head: Step[] = [
    { t: 'stage', id: 'street', sky: 'night', look: 'night' },
    { t: 'music', id: 'cutscene' },
    { t: 'place', actor: 'dog', pos: [GATE[0], GATE[1] - 3], face: 0 },
    { t: 'fx', kind: 'glowEyes', value: 1 },
    { t: 'cam', pos: [HOME.x + 2, 7, HOME.z + 17], look: [HOME.x, 1, HOME.z + 2] },
    { t: 'fade', to: 0, dur: 0.7 },
    { t: 'move', actor: 'dog', to: GATE, dur: 0.9 },
  ];
  const tail = (subtitle: string): Step[] => [
    { t: 'fx', kind: 'aura', value: 1 },
    { t: 'sfx', id: 'bark', volume: 0.6 },
    { t: 'card', title: `${n}번째 밤`, subtitle, dur: 1.9 },
    { t: 'fade', to: 1, dur: 0.5 },
  ];
  if (n === 1) return [...head, think('(뼈 냄새가 사방에서 난다. 새벽까지만 버티면 된다. 해가 뜨면 저것들은 사라진다.)'), ...tail('새벽까지 동네를 지켜라')];
  if (n === 2) return [...head, think('(어젯밤보다 냄새가 짙다. 오늘은 더 많다. …마당에서 싸우면 화분이 깨진다. 멀리서 싸우자.)'), ...tail('해골 대장이 순찰을 방해한다')];
  if (n === 3) {
    return [
      ...head,
      { t: 'place', actor: 'cat', pos: [HOME.x + 4.5, HOME.z + 3.5], face: -1.2, y: 0 },
      { t: 'cam', pos: [HOME.x + 6, 4.5, HOME.z + 11], look: [HOME.x + 2.5, 1, HOME.z + 2.8], dur: 1.4 },
      { t: 'sfx', id: 'meow' },
      { t: 'fx', kind: 'dogBang' },
      say('cat', '밤마다 번쩍거리는 개가 있다더니. 너구나.'),
      think('(들켰다. 하필 고양이한테.)'),
      say('cat', '걱정 마. 인간들한텐 말 안 해. 어차피 내 말은 못 알아들으니까.'),
      say('cat', '대신 내 구역에서 해골 좀 치워 줘. 시끄러워서 낮잠을 못 자.'),
      think('(협박인지 의뢰인지 모르겠다.)'),
      say('cat', '냄새는 묘지 쪽에서 나. 땅이 파랗게 빛나는 데. …조심해, 멍멍이.'),
      { t: 'hop', actor: 'cat', times: 1 },
      { t: 'move', actor: 'cat', to: [HOME.x + 16, HOME.z + 2], dur: 1.0, run: true },
      { t: 'place', actor: 'cat', pos: [0, 0], visible: false },
      think('(목격자 1호. 간식으로 입막음이 될지 알아봐야겠다.)'),
      ...tail('슬리퍼 도둑이 나타났다'),
    ];
  }
  if (n === 4) return [...head, { t: 'fx', kind: 'lamps', value: 0.35 }, think('(가로등이 하나씩 꺼지고 있다. 누가 끄고 다니는 거다.)'), { t: 'fx', kind: 'lamps', value: 1 }, ...tail('가로등을 끄는 자를 찾아라')];
  if (n === 5) {
    const brave = c.stats.bond >= 50;
    const ox = HOME.x + 3;
    const oz = HOME.z + 11;
    const common: Step[] = [
      ...head,
      { t: 'place', actor: 'owner', pos: [ox, oz], face: Math.PI },
      { t: 'cam', pos: [ox + 5, 5, oz + 9], look: [ox, 1.2, oz], dur: 1.6 },
      { t: 'fx', kind: 'dogBang' },
      say('owner', '호두야…? 어디 갔니… 현관문이 열려 있던데…'),
      think('(주인이 밖에 나와 있다. 최악이다.)'),
      { t: 'place', actor: 'skel1', pos: [ox - 3.5, oz + 2], face: 1.6 },
      { t: 'place', actor: 'skel2', pos: [ox + 3.5, oz + 1.5], face: -1.6 },
      { t: 'place', actor: 'skel3', pos: [ox + 0.5, oz + 4.5], face: Math.PI },
      { t: 'fx', kind: 'spawn' },
      { t: 'fx', kind: 'bang' },
      { t: 'anim', actor: 'owner', clip: 'Hit_A', once: true },
      say('owner', '어… 저기요? 핼러윈은 지났는데요…?'),
      { t: 'move', actor: 'dog', to: [ox - 0.6, oz - 1.6], dur: 0.6, run: true },
    ];
    if (brave) {
      return [
        ...common,
        { t: 'fx', kind: 'aura', value: 1 },
        { t: 'fx', kind: 'bark', value: 1.3 },
        { t: 'flash', color: '#fff0c0' },
        { t: 'fx', kind: 'smash' },
        wait(0.7),
        { t: 'face', actor: 'owner', to: [ox - 0.6, oz - 1.6] },
        say('owner', '…호두? 너 눈이 왜 이렇게 예쁘게 빛나… 아, 꿈이구나. 좋은 꿈이다.'),
        { t: 'anim', actor: 'owner', clip: 'Interact' },
        { t: 'fx', kind: 'hearts' },
        think('(꿈이라고 믿어 줘서 고맙다. …조금만 더 이러고 있자.)'),
        { t: 'call', fn: () => { c.stats.bond = Math.min(100, c.stats.bond + 4); c.flags.ownerDream = true; } },
        say('narr', '유대감이 깊어 주인은 겁먹지 않았다. (유대감 +4)'),
        { t: 'anim', actor: 'owner', clip: 'Idle' },
        ...tail('묘지기가 주인을 노린다'),
      ];
    }
    return [
      ...common,
      { t: 'fx', kind: 'bark', value: 1.1 },
      { t: 'fx', kind: 'smash' },
      { t: 'pose', actor: 'owner', lie: true },
      { t: 'sfx', id: 'fall' },
      wait(0.6),
      think('(기절했다. 다행인지 불행인지. 일단 현관까지 끌고 가자. …무겁다.)'),
      { t: 'call', fn: () => { c.stats.fatigue = Math.min(100, c.stats.fatigue + 10); c.suspicion = Math.min(99, c.suspicion + 4); c.flags.ownerFainted = true; } },
      say('narr', '유대감이 부족해 주인은 호두를 알아보지 못했다. (피로도 +10, 의심도 +4)'),
      ...tail('묘지기가 주인을 노린다'),
    ];
  }
  if (n === 6) {
    return [
      { t: 'stage', id: 'street', sky: 'night', look: 'night' },
      { t: 'music', id: 'cutscene' },
      { t: 'place', actor: 'dog', pos: [CRATER.x - 6, CRATER.z + 5], face: 1.2 },
      { t: 'place', actor: 'cat', pos: [CRATER.x - 8.5, CRATER.z + 4], face: 1.2 },
      { t: 'fx', kind: 'glowEyes', value: 1 },
      { t: 'fx', kind: 'crater', value: 1.2 },
      { t: 'cam', pos: [CRATER.x - 10, 8, CRATER.z + 18], look: [CRATER.x - 2, 1, CRATER.z + 2] },
      { t: 'fade', to: 0, dur: 0.8 },
      { t: 'cam', pos: [CRATER.x - 4, 5, CRATER.z + 12], look: [CRATER.x, 0.5, CRATER.z], dur: 3, wait: false },
      say('cat', '여기야. 저 파란 돌이 밤마다 해골들을 깨우고 있어.'),
      think('(내가 삼킨 것과 같은 냄새가 난다. …그럼 나도 저것들과 같은 건가.)'),
      say('cat', '넌 달라. 넌 누굴 지키잖아. 저건 그냥 배가 고픈 거고.'),
      { t: 'fx', kind: 'shake', value: 0.5 },
      { t: 'sfx', id: 'boom', volume: 0.6, rate: 0.7 },
      say('cat', '…방금 땅이 울렸지? 난 담장 위에서 응원할게. 진심으로.'),
      { t: 'move', actor: 'cat', to: [CRATER.x - 20, CRATER.z + 6], dur: 0.9, run: true },
      { t: 'place', actor: 'cat', pos: [0, 0], visible: false },
      { t: 'fx', kind: 'aura', value: 1 },
      { t: 'card', title: '6번째 밤', subtitle: '운석 핵을 지키는 파수꾼', dur: 1.9 },
      { t: 'fade', to: 1, dur: 0.5 },
    ];
  }
  return [
    { t: 'stage', id: 'street', sky: 'night', look: 'boss' },
    { t: 'music', id: 'boss' },
    { t: 'place', actor: 'dog', pos: [CRATER.x - 7, CRATER.z + 6], face: 1.2 },
    { t: 'fx', kind: 'glowEyes', value: 1 },
    { t: 'fx', kind: 'crater', value: 1.6 },
    { t: 'cam', pos: [CRATER.x - 12, 7, CRATER.z + 16], look: [CRATER.x, 2, CRATER.z] },
    { t: 'fade', to: 0, dur: 0.8 },
    think('(마지막 밤이다. 저걸 부수면 동네가 조용해진다.)'),
    { t: 'fx', kind: 'coreRise' },
    { t: 'flash', color: '#7df9ff' },
    { t: 'cam', pos: [CRATER.x - 8, 4, CRATER.z + 11], look: [CRATER.x, 3.2, CRATER.z], dur: 2.2 },
    say('boss', '……조각…… 돌려…… 다오……'),
    think('(내 배 속의 조각을 원한다. 미안하지만 이미 소화됐다.)'),
    say('boss', '……그럼…… 너를…… 통째로……'),
    think('(주인이 아침밥을 차리기 전에 끝낸다.)'),
    { t: 'fx', kind: 'aura', value: 1 },
    { t: 'fx', kind: 'bark', value: 1.4 },
    { t: 'card', title: '마지막 밤', subtitle: '모든 밤의 근원, 운석 핵', dur: 2.2 },
    { t: 'fade', to: 1, dur: 0.5 },
  ];
}

// ---------- 아침: 몰래 침대로 복귀 ----------
export function morning(c: Campaign, r: NightResult): Step[] {
  const tier = suspicionTier(c.suspicion);
  let owner = ['오늘도 잘 잤니?', '너 요즘 왜 이렇게 피곤해 보이니?', '…호두야. 너 밤에 뭐 하니? 진짜로.', '어젯밤 GPS가… 아니다. 아침부터 먹자.', '우리 얘기 좀 하자, 호두.'][tier];
  let dog = ['(그래, 주인. 푹 잤다. 아주 푹.)', '(야간 근무자에게 흔한 증상이다.)', '(동네 치안 유지. 무급.)', '(GPS는 방석 밑에서 열네 시간 동안 "수면 중"이었을 텐데.)', '(…올 것이 왔다.)'][tier];
  if (r.knockedOut) {
    owner = '호두!! 너 왜 현관 매트 위에 대자로 뻗어 있었어?!';
    dog = '(…전략적 후퇴였다.)';
  } else if (r.lateSeconds > 3) {
    owner = '…방금 현관문 소리 났는데. 호두, 너 지금 막 들어온 거 아니지?';
    dog = '(방석이 아직 차갑다. 자는 척, 자는 척.)';
  } else if (r.damageTaken / Math.max(1, r.maxHp) > 0.6) {
    owner = '어머, 귀 뒤에 이 상처 뭐야? 또 옆집 나비랑 싸웠어?';
    dog = '(나비는 억울하겠지만, 그렇다고 해 두자.)';
  } else if (r.yardKills >= 12) {
    owner = '마당 화분이 왜 다 엎어져 있지? 간밤에 바람이 셌나…';
    dog = `(바람이라고 하기엔 해골 ${r.yardKills}마리였다.)`;
  } else if (r.noDamage && r.bossKilled) {
    owner = '오늘도 잘 잤니? 넌 참 속 편하게 잔다니까.';
    dog = `(${r.bossName}을(를) 쓰러뜨린 개에게 할 말은 아니다.)`;
  }
  const sneak: Step[] = r.knockedOut
    ? [{ t: 'place', actor: 'dog', pos: [DOOR[0] - 1.2, DOOR[1] + 0.4], face: 2 }, { t: 'pose', actor: 'dog', lie: true }]
    : [
        { t: 'place', actor: 'dog', pos: [DOOR[0] + 2.5, DOOR[1]], face: -Math.PI / 2 },
        { t: 'move', actor: 'dog', to: [6.4, 1.4], dur: 2.0, wait: false },
        think('(살금… 살금… 방석까지 4미터.)'),
        { t: 'move', actor: 'dog', to: CUSHION, dur: 0.8 },
        ...dogOnCushion,
        { t: 'fx', kind: 'glowEyes', value: 0 },
      ];
  return [
    { t: 'stage', id: 'house', sky: 'dawn', look: 'dawn' },
    { t: 'music', id: 'cutscene' },
    { t: 'fx', kind: 'lightsOff' },
    { t: 'fx', kind: 'glowEyes', value: r.knockedOut ? 0 : 1 },
    { t: 'fx', kind: 'aura', value: 0 },
    ...ownerInBed,
    { t: 'cam', pos: [9, 6, 10], look: [6.2, 0.6, 0.8] },
    { t: 'fade', to: 0, dur: 0.9 },
    ...sneak,
    { t: 'sky', from: 'dawn', to: 'day', dur: 2.2, wait: false },
    { t: 'look', id: 'day', dur: 2.4 },
    { t: 'cam', pos: HOUSE_CAM.pos, look: HOUSE_CAM.look, dur: 2.2 },
    { t: 'place', actor: 'owner', pos: [4.4, -1.6], face: 0.3 },
    { t: 'pose', actor: 'owner' },
    { t: 'sfx', id: 'chime', volume: 0.4 },
    { t: 'move', actor: 'owner', to: r.knockedOut ? [6.4, 0.6] : [4.2, 0.6], dur: 1.2 },
    { t: 'face', actor: 'owner', to: r.knockedOut ? [DOOR[0] - 1.2, DOOR[1] + 0.4] : CUSHION },
    ...(tier >= 2 || r.knockedOut ? ([{ t: 'fx', kind: 'bang' }] as Step[]) : []),
    say('owner', owner),
    { t: 'pose', actor: 'dog' },
    think(dog),
    { t: 'fade', to: 1, dur: 0.6 },
  ];
}

// ---------- 의심도 3단계: GPS 목줄 구매 ----------
export function gpsEvent(): Step[] {
  return [
    { t: 'stage', id: 'house', sky: 'day', look: 'day' },
    { t: 'music', id: 'day' },
    { t: 'cam', pos: [3, 7, 9], look: [0.6, 1.2, 0.2] },
    { t: 'place', actor: 'owner', pos: [-0.4, 0.2], face: 0.9 },
    { t: 'place', actor: 'dog', pos: [1.6, 0.8], face: -1.2 },
    { t: 'pose', actor: 'dog' },
    { t: 'fade', to: 0, dur: 0.6 },
    { t: 'anim', actor: 'owner', clip: 'Use_Item', once: true },
    say('owner', '짠! 택배 왔다. 이게 뭐게~?'),
    { t: 'hop', actor: 'dog', times: 2 },
    think('(간식이다. 분명 간식이다.)'),
    say('owner', 'GPS 목줄! 요즘 네가 밤마다 어디 다니는 것 같아서. 앱으로 다 보인대.'),
    { t: 'fx', kind: 'dogBang' },
    think('(추적 장치다.)'),
    say('owner', '자, 채웠다. 어때, 멋지지?'),
    think('(침착하자. 밤에는 방석 밑에 벗어 두고 나가면 된다. 주인의 앱에는 "수면 중: 14시간"이라고 뜰 것이다.)'),
    say('narr', '의심도가 높아지자 주인이 GPS 목줄을 샀다. 이제 늦게 돌아오면 더 크게 의심받는다.'),
    { t: 'fade', to: 1, dur: 0.6 },
  ];
}

// ---------- 들킬 뻔한 순간 3종 ----------
export function closeCall(variant: number): Step[] {
  const intro: Step[] = [
    { t: 'stage', id: 'house', sky: 'day', look: 'day' },
    { t: 'music', id: null },
    { t: 'place', actor: 'owner', pos: [3.6, 1.0], face: 1.2 },
    { t: 'place', actor: 'dog', pos: CUSHION, face: -1.6 },
    { t: 'pose', actor: 'dog' },
    { t: 'fx', kind: 'glowEyes', value: 0 },
    { t: 'cam', pos: [8.5, 6, 9], look: [4.6, 1, 1.2] },
    { t: 'fade', to: 0, dur: 0.6 },
    { t: 'fx', kind: 'bang' },
  ];
  const body: Step[][] = [
    [
      say('owner', '호두. 현관에서 네 방석까지 흙 발자국이 찍혀 있어.'),
      say('owner', '근데 이상하게… 발자국이 두 줄이야. 두 발로 걸은 것처럼.'),
      think('(새벽에 너무 피곤해서 잠깐 뒷발로 걸었다. 치명적인 실수다.)'),
    ],
    [
      say('owner', '호두. 홈캠에 새벽 세 시 영상이 있는데.'),
      say('owner', '네가… 앞발로 현관 손잡이를 돌리고, 나가면서 문을 살짝 닫아.'),
      think('(문을 닫은 건 예의였다. 예의가 나를 죽인다.)'),
    ],
    [
      say('owner', '호두. GPS 기록이 좀 이상해.'),
      say('owner', '어젯밤에 네가 시속 육십 킬로로 묘지를 열두 바퀴 돌았대.'),
      think('(목줄을 벗어 둔다는 걸 깜빡했다. 열두 바퀴는 과장이다. 열한 바퀴였다.)'),
    ],
  ];
  return [
    ...intro,
    ...body[variant % 3],
    { t: 'cam', pos: [7, 3.6, 5.4], look: [4.8, 1.2, 1.4], dur: 1.2 },
    say('owner', '…너, 평범한 개 맞지?'),
    think('(위기다. 지금부터 세상에서 가장 평범한 개가 되어야 한다.)'),
  ];
}

export function closeCallResult(success: boolean): Step[] {
  return success
    ? [
        say('owner', '…그래. 내가 요즘 잠을 못 자서 헛것을 봤나 보다. 미안해, 호두.'),
        { t: 'fx', kind: 'hearts', value: 1 },
        think('(통했다. 평범함도 초능력이다.)'),
        { t: 'fx', kind: 'hearts', value: 0 },
        { t: 'fade', to: 1, dur: 0.6 },
      ]
    : [
        { t: 'fx', kind: 'bang' },
        say('owner', '…방금 그건 개가 할 수 있는 반응이 아닌데.'),
        say('owner', '지켜볼 거야, 호두. 아주 유심히.'),
        think('(주인의 눈이 가늘어졌다. 다음에 또 걸리면 끝이다.)'),
        { t: 'fade', to: 1, dur: 0.6 },
      ];
}

// ---------- 엔딩 3종 ----------
export function ending(id: EndingId, c: Campaign): Step[] {
  const open: Step[] = [
    { t: 'stage', id: 'house', sky: 'dawn', look: 'dawn' },
    { t: 'music', id: 'cutscene' },
    { t: 'fx', kind: 'lightsOff' },
    { t: 'fx', kind: 'glowEyes', value: 0 },
    { t: 'fx', kind: 'aura', value: 0 },
    { t: 'place', actor: 'owner', pos: [3.8, 0.4], face: 1.1 },
    { t: 'pose', actor: 'owner' },
    ...dogOnCushion,
    { t: 'cam', pos: [9, 6, 10], look: [5, 0.8, 0.8] },
    { t: 'fade', to: 0, dur: 1.2 },
    { t: 'sky', from: 'dawn', to: 'day', dur: 3, wait: false },
    { t: 'look', id: 'day', dur: 3 },
    say('narr', '일곱 번째 아침. 묘지의 파란 빛은 사라졌다.'),
    { t: 'pose', actor: 'dog' },
  ];
  const credits: Step[] = [
    { t: 'card', title: '우리 집 개는 영웅', subtitle: `총 처치 ${c.totalKills}마리 · 점수 ${c.score}`, dur: 3.2 },
    { t: 'fade', to: 1, dur: 1 },
  ];
  if (id === 'true') {
    return [
      ...open,
      say('owner', '호두야. 나 사실… 다 알고 있었어. 첫날 밤부터.'),
      { t: 'fx', kind: 'dogBang' },
      think('(……뭐?)'),
      say('owner', '네 눈이 빛나던 밤. 불 끄라고 했더니 네가 눈을 감았잖아.'),
      say('owner', '모른 척하는 게 네가 바라는 것 같았어. 그래서 매일 아침 "잘 잤니?" 하고 물었지.'),
      { t: 'cam', pos: [7, 3.4, 5.6], look: [4.6, 1.1, 1.2], dur: 2 },
      { t: 'move', actor: 'owner', to: [4.4, 1.2], dur: 0.8 },
      { t: 'anim', actor: 'owner', clip: 'Interact' },
      { t: 'fx', kind: 'hearts', value: 1 },
      say('owner', '고마워. 지켜 줘서. 이제부터 아침밥은 내가 책임질게. 매일.'),
      think('(주인만 모르는 비밀인 줄 알았는데. 나만 모르는 비밀이었다.)'),
      { t: 'fx', kind: 'glowEyes', value: 1 },
      { t: 'fx', kind: 'stars' },
      think('(…꼬리가 말을 안 듣는다. 멈출 수가 없다.)'),
      { t: 'fx', kind: 'hearts', value: 0 },
      { t: 'card', title: '진엔딩', subtitle: '우리 집 개는 영웅', dur: 3 },
      ...credits,
    ];
  }
  if (id === 'caught') {
    return [
      ...open,
      { t: 'fx', kind: 'bang' },
      say('owner', '…다 봤어. 어젯밤. 전부.'),
      think('(끝났다. 병원이다. 아니면 뉴스다.)'),
      say('owner', '충격파에, 레이저에. 우리 집 개가 그런 걸 하더라.'),
      say('owner', '근데 왜 혼자 했어? 나 호신용 프라이팬 있는데.'),
      { t: 'fx', kind: 'dogBang' },
      { t: 'anim', actor: 'owner', clip: 'Cheer', once: true },
      say('owner', '다음부턴 같이 가. 야식은 내가 쌀게. 팀 이름도 정했어. "2인 1견 자경단".'),
      think('(1인 1견이다. 그리고 주인이 해골보다 무서울지도 모른다.)'),
      { t: 'fx', kind: 'stars' },
      { t: 'card', title: '들킨 엔딩', subtitle: '프라이팬을 든 주인과 함께', dur: 3 },
      ...credits,
    ];
  }
  return [
    ...open,
    say('owner', '오늘도 잘 잤니? 요즘 동네가 조용하대. 괴물 소문도 쏙 들어갔고.'),
    think('(그래, 주인. 푹 잤다. 아주 푹.)'),
    { t: 'anim', actor: 'owner', clip: 'Interact', once: true },
    say('owner', '넌 참 팔자 좋다. 먹고 자고, 먹고 자고.'),
    think('(동네의 밤은 조용해졌다. 아무도 이유를 모른다. 나만 빼고.)'),
    { t: 'fx', kind: 'glowEyes', value: 1 },
    { t: 'sfx', id: 'pop', volume: 0.4, rate: 1.6 },
    wait(0.5),
    { t: 'fx', kind: 'glowEyes', value: 0 },
    { t: 'card', title: '비밀 유지 엔딩', subtitle: '주인은 오늘도 모른다', dur: 3 },
    ...credits,
  ];
}

/** 시치미 떼기 미니게임의 문제 은행. */
export const ACT_NORMAL_ROUNDS: { prompt: string; good: string; bad: [string, string] }[] = [
  { prompt: '주인이 빤히 쳐다본다.', good: '하품하고 뒷발로 귀를 긁는다', bad: ['어깨를 으쓱한다', '눈을 피하며 휘파람을 분다'] },
  { prompt: '"너 어젯밤에 어디 갔었어?"', good: '고개를 갸웃한다', bad: ['고개를 가로젓는다', '달력을 가리킨다'] },
  { prompt: '주인이 영상을 다시 튼다.', good: '화면 속 개를 보고 짖는다', bad: ['리모컨으로 끈다', '"조작된 영상"이라는 표정을 짓는다'] },
  { prompt: '"손!"', good: '신나게 앞발을 준다', bad: ['악수하고 명함을 건네는 시늉을 한다', '거수경례를 한다'] },
  { prompt: '주인이 간식 봉지를 흔든다.', good: '침을 흘리며 빙글빙글 돈다', bad: ['성분표를 읽는다', '괜찮다고 앞발을 내젓는다'] },
  { prompt: '"설마… 너 말귀 다 알아듣니?"', good: '꼬리를 흔들며 멍! 하고 짖는다', bad: ['"아니"라고 고개를 젓는다', '조용히 방문을 닫고 온다'] },
  { prompt: '주인이 공을 던진다.', good: '신나게 쫓아가다 미끄러진다', bad: ['떨어지기 전에 받아 낸다', '궤적을 계산하고 제자리에서 기다린다'] },
];

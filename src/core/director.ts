import { gsap } from 'gsap';
import { audio } from '../audio/audio';
import { DAY_ASSETS, DayScene, HOUSE_CAM } from '../day/DayScene';
import { actionBlock, applyAction, applyEventChoice, hoursLeft, ownerReaction, rollEvent, startNewDay } from '../day/dayLogic';
import { actionById, balance, qualities, suspicionTier, type QualityId } from '../data';
import { NIGHT_ASSETS, NightScene } from '../night/NightScene';
import { simplifierReady } from '../night/vat';
import { CutscenePlayer, type CutsceneHost, type Step } from '../story/CutscenePlayer';
import { ACT_NORMAL_ROUNDS, awakening, closeCall, closeCallResult, ending, evening, gpsEvent, morning, prologue, sortie } from '../story/scripts';
import type { StageBase } from '../story/stage';
import { StreetStage } from '../story/StreetStage';
import { LOOKS, PostFx } from '../vfx/postfx';
import { FOX_FILE, HUMAN_FILES } from './actors';
import { assets } from './assets';
import { Engine } from './engine';
import { input } from './input';
import { Rng } from './rng';
import { addRanking, clearCampaign, loadCampaign, loadRanking, loadSettings, newCampaign, saveCampaign, saveSettings } from './save';
import { EMPTY_DAY, getGame, setGame, toast, type Campaign, type EndingId, type NightResult, type Settings } from './store';


/** 게임 분석 트래커 (game-analytics). index.html 의 game-tracker.js 가 없으면 아무것도 안 함 */
const track = (name: string, step: number): void => {
  (window as unknown as { GameTracker?: { milestone(n: string, s: number): void } }).GameTracker?.milestone(name, step);
};

const TIPS = [
  '마당에서 싸우면 화분이 깨져 의심도가 오른다. 멀리 나가서 싸우자.',
  '새벽이 오면 곧장 집으로. 늦게 들어올수록 주인이 수상해한다.',
  '피로도가 60을 넘으면 밤에 몸이 무겁다. 낮잠도 훈련이다.',
  '유대감이 높으면 위기의 순간 "주인 생각"으로 각성한다.',
  '무기를 5레벨까지 올리고 짝이 되는 패시브를 얻으면 진화한다.',
  '같은 행동을 하루에 반복하면 효과가 줄어든다.',
  '의심도가 가득 차면 시치미를 떼야 한다. 가장 "개다운" 행동을 고르자.',
];

/** 게임 전체 흐름(타이틀 → 낮 → 밤 → 결과 → … → 엔딩)을 지휘한다. */
export class Director implements CutsceneHost {
  readonly engine: Engine;
  readonly postfx: PostFx;
  readonly cut: CutscenePlayer;
  night: NightScene | null = null;
  private day: DayScene | null = null;
  private street: StreetStage | null = null;
  private nightAssets: Promise<void> | null = null;
  private rng = new Rng(Date.now() & 0xfffffff);
  private busy = false;
  private closeTimer: gsap.core.Tween | null = null;
  private closeRounds: typeof ACT_NORMAL_ROUNDS = [];
  private closeResolve: ((success: boolean) => void) | null = null;
  private fpsTimer = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas);
    this.postfx = new PostFx(this.engine);
    this.cut = new CutscenePlayer(this);
    this.engine.onFrame((realDt) => this.frame(realDt));
  }

  private get c(): Campaign {
    const c = getGame().campaign;
    if (!c) throw new Error('진행 중인 게임이 없습니다');
    return c;
  }

  private get quality() {
    return qualities[getGame().settings.quality];
  }

  private commit(): void {
    // 캠페인 객체는 제자리에서 고치므로, 구독자가 갱신되게 얕은 복사본을 넣는다.
    setGame({ campaign: { ...this.c, stats: { ...this.c.stats } } });
  }

  private save(): void {
    saveCampaign(this.c);
    setGame({ hasSave: true });
  }

  // ---------- 부팅·로딩 ----------

  async boot(): Promise<void> {
    const settings = loadSettings();
    setGame({ settings, ranking: loadRanking(), hasSave: !!loadCampaign(), loading: { progress: 0, tip: TIPS[Math.floor(Math.random() * TIPS.length)], done: false } });
    this.postfx.setQuality(qualities[settings.quality]);
    this.engine.start();

    const jobs: Promise<unknown>[] = [
      assets.loadGlb(FOX_FILE),
      assets.loadGlb(HUMAN_FILES.owner),
      ...DAY_ASSETS.kits.map((k) => assets.loadKit(k)),
      audio.load(),
      document.fonts?.load("54px 'HeroRound'").catch(() => undefined) ?? Promise.resolve(),
      document.fonts?.load("600 16px 'HeroSans'").catch(() => undefined) ?? Promise.resolve(),
    ];
    let done = 0;
    const tipTimer = window.setInterval(() => setGame({ loading: { ...getGame().loading, tip: TIPS[Math.floor(Math.random() * TIPS.length)] } }), 2600);
    await Promise.all(
      jobs.map((j) =>
        j.then(() => {
          done++;
          setGame({ loading: { ...getGame().loading, progress: done / jobs.length } });
        }),
      ),
    );
    window.clearInterval(tipTimer);
    audio.setVolumes(settings.master, settings.music, settings.sfx);
    // 밤 에셋은 타이틀을 보는 동안 뒤에서 받는다(지연 로딩).
    void this.loadNightAssets();
    this.showTitle();
    setGame({ loading: { ...getGame().loading, progress: 1, done: true } });
  }

  private loadNightAssets(): Promise<void> {
    if (!this.nightAssets) {
      this.nightAssets = Promise.all([
        ...NIGHT_ASSETS.kits.map((k) => assets.loadKit(k)),
        ...NIGHT_ASSETS.glbs.map((g) => assets.loadGlb(g)),
        assets.loadGlb(HUMAN_FILES.friend),
        assets.loadGlb(HUMAN_FILES.delivery),
        simplifierReady,
      ]).then(() => undefined);
    }
    return this.nightAssets;
  }

  private async needNightAssets(): Promise<void> {
    let ready = false;
    const p = this.loadNightAssets().then(() => (ready = true));
    await Promise.resolve();
    if (!ready) {
      setGame({ loading: { progress: 0.5, tip: '동네를 불러오는 중…', done: false } });
      await p;
      setGame({ loading: { ...getGame().loading, progress: 1, done: true } });
    }
  }

  private frame(realDt: number): void {
    const s = getGame();
    if (input.consume('Escape', 'PadStart') && (s.screen === 'day' || s.screen === 'night')) this.togglePause();
    if (input.consume('F3')) setGame({ showFps: !s.showFps });
    if (s.showFps) {
      this.fpsTimer -= realDt;
      if (this.fpsTimer <= 0) {
        this.fpsTimer = 0.5;
        const st = this.engine.stats;
        setGame({ fpsText: `${st.fps.toFixed(0)} fps · ${st.frameMs.toFixed(1)}ms · update ${st.updateMs.toFixed(2)}ms · draw ${st.drawCalls} · tri ${(st.triangles / 1000).toFixed(0)}k` });
      }
    }
    if (s.screen !== 'night') {
      input.poll();
      input.endFrame();
    }
  }

  // ---------- 무대 관리 ----------

  private setScene(scene: StageBase | NightScene): void {
    this.engine.setScene(scene);
    if (scene !== this.day) this.day = null;
    if (scene !== this.street) this.street = null;
    if (scene !== this.night) this.night = null;
  }

  async useStage(id: 'house' | 'street'): Promise<StageBase> {
    this.postfx.split = 0;
    if (id === 'house') {
      if (!this.day) {
        this.day = new DayScene(this.quality);
        this.setScene(this.day);
      }
      this.day.titleMode = false;
      return this.day;
    }
    await this.needNightAssets();
    const stage = new StreetStage(getGame().campaign?.seed ?? 1, getGame().campaign?.day ?? 1);
    this.street = stage;
    this.setScene(stage);
    return stage;
  }

  private fade(to: number, dur = 0.5, color = '#000'): Promise<void> {
    const proxy = { v: getGame().cut.fade };
    setGame({ cut: { ...getGame().cut, fadeColor: color } });
    return new Promise((resolve) => {
      gsap.to(proxy, {
        v: to,
        duration: dur,
        ease: 'power1.inOut',
        onUpdate: () => setGame({ cut: { ...getGame().cut, fade: proxy.v } }),
        onComplete: () => resolve(),
      });
    });
  }

  private async playCut(steps: Step[], skippable = true): Promise<void> {
    await this.cut.play(steps, skippable);
  }

  // ---------- 타이틀 ----------

  showTitle(): void {
    const prev = this.day;
    if (!prev) {
      this.day = new DayScene(this.quality);
      this.setScene(this.day);
    }
    const day = this.day!;
    day.titleMode = true;
    day.setSky('day', 'day', 0);
    day.effect('lightsOff');
    day.effect('glowEyes', 0);
    this.postfx.setLook('day', 0);
    this.postfx.split = 0.5;
    this.postfx.splitLook = { ...LOOKS.night, tint: [0.2, 0.3, 0.66], saturation: 0.95 };
    this.engine.paused = false;
    this.engine.timeScale = 1;
    audio.playMusic('cutscene');
    setGame({ screen: 'title', paused: false, settingsOpen: false, result: null, ending: null, closeCall: null, day: EMPTY_DAY, cut: { ...getGame().cut, fade: 0, active: false, letterbox: false, line: null, card: null } });
  }

  async newGame(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    audio.unlock();
    audio.ui('confirm');
    clearCampaign();
    const c = newCampaign();
    this.rng = new Rng(c.seed);
    setGame({ campaign: c, hasSave: false });
    await this.fade(1, 0.6);
    await this.playCut(prologue());
    await this.playCut(awakening());
    this.save();
    this.busy = false;
    await this.enterDay();
  }

  async continueGame(): Promise<void> {
    const c = loadCampaign();
    if (!c || this.busy) return;
    this.busy = true;
    audio.unlock();
    audio.ui('confirm');
    this.rng = new Rng(c.seed + c.day * 31);
    setGame({ campaign: c });
    await this.fade(1, 0.5);
    this.busy = false;
    if (c.stage === 'night') await this.startNight();
    else await this.enterDay();
  }

  // ---------- 낮 ----------

  private async enterDay(): Promise<void> {
    const c = this.c;
    const day = (await this.useStage('house')) as DayScene;
    day.setCam([...HOUSE_CAM.pos], [...HOUSE_CAM.look], 38);
    day.setHour(c.hour);
    day.effect('glowEyes', 0);
    day.effect('aura', 0);
    for (const s of [
      { t: 'place', actor: 'owner', pos: [-0.6, -0.4], face: 0.5 },
      { t: 'pose', actor: 'owner' },
      { t: 'place', actor: 'dog', pos: [1.4, 0.8], face: -0.8 },
      { t: 'pose', actor: 'dog' },
    ] as Step[]) {
      if (s.t === 'place') {
        const a = day.actor(s.actor)!;
        a.root.position.set(s.pos[0], 0, s.pos[1]);
        a.root.rotation.y = s.face ?? 0;
        a.root.visible = true;
      } else if (s.t === 'pose') {
        const a = day.actor(s.actor)!;
        if (a.dog) {
          a.dog.body.rotation.set(0, 0, 0);
          a.dog.body.position.y = 0;
        } else a.anim('Idle');
      }
    }
    this.postfx.setLook(c.hour >= 17 ? 'dusk' : 'day', 0.5);
    audio.playMusic('day');
    track(`${c.day}일차 낮`, c.day * 2 - 1);
    setGame({ screen: 'day', day: EMPTY_DAY, paused: false });
    this.commit();
    await this.fade(0, 0.6);
    toast(`${c.day}일째 아침`);
  }

  async doAction(id: string): Promise<void> {
    const def = actionById.get(id);
    const day = this.day;
    if (!def || !day || this.busy || getGame().screen !== 'day') return;
    const c = this.c;
    const block = actionBlock(c, def);
    if (block) {
      toast(block);
      audio.ui('back');
      return;
    }
    this.busy = true;
    audio.ui('confirm');
    setGame({ day: { ...EMPTY_DAY, busy: true } });
    await day.playAction(id);
    const lines = applyAction(c, def);
    day.setHour(c.hour);
    this.postfx.setLook(c.hour >= 17 ? 'dusk' : 'day', 1.5);
    this.commit();
    this.save();
    audio.synth('chime', { volume: 0.35, fixed: true });
    setGame({
      day: { busy: false, popup: { title: def.name, lines, note: hoursLeft(c) <= 0 ? '날이 저물었다.' : undefined }, ownerLine: ownerReaction(id, c.suspicion), thought: def.thought, event: null, eventResult: null },
    });
    this.busy = false;
  }

  /** 결과 팝업을 닫는다. 가끔 일상 이벤트가 이어진다. */
  async dismissPopup(): Promise<void> {
    const s = getGame();
    if (this.busy || s.screen !== 'day' || !s.day.popup) return;
    const hadEventResult = !!s.day.eventResult;
    setGame({ day: EMPTY_DAY });
    audio.ui('click');
    const day = this.day;
    if (!day) return;
    if (hadEventResult) {
      const actor = s.day.event?.actor;
      if (actor && actor !== 'owner') {
        this.busy = true;
        setGame({ day: { ...EMPTY_DAY, busy: true } });
        await day.visitorLeave(actor);
        setGame({ day: EMPTY_DAY });
        this.busy = false;
      }
      return;
    }
    const ev = rollEvent(this.c, this.rng);
    if (!ev) return;
    this.busy = true;
    setGame({ day: { ...EMPTY_DAY, busy: true } });
    if (ev.actor !== 'owner') {
      await this.needNightAssets();
      await day.visitorEnter(ev.actor);
    } else {
      day.effect('bang');
    }
    setGame({ day: { ...EMPTY_DAY, event: ev, thought: ev.thought } });
    this.busy = false;
  }

  chooseEvent(index: number): void {
    const s = getGame();
    const ev = s.day.event;
    if (!ev || s.day.eventResult || this.busy) return;
    const choice = ev.choices[index];
    if (!choice) return;
    const c = this.c;
    const lines = applyEventChoice(c, choice);
    this.commit();
    this.save();
    audio.ui('confirm');
    if (choice.suspicion > 0) this.day?.effect('bang');
    else this.day?.effect('stars');
    setGame({ day: { busy: false, popup: { title: ev.title, lines, note: choice.result }, ownerLine: choice.ownerLine, thought: null, event: ev, eventResult: choice } });
  }

  async endDay(): Promise<void> {
    if (this.busy || getGame().screen !== 'day') return;
    this.busy = true;
    audio.ui('confirm');
    const c = this.c;
    c.stage = 'night';
    this.commit();
    this.save();
    setGame({ day: EMPTY_DAY });
    await this.playCut(evening(c));
    this.busy = false;
    await this.startNight();
  }

  // ---------- 밤 ----------

  private async startNight(): Promise<void> {
    const c = this.c;
    await this.needNightAssets();
    await this.playCut(sortie(c));
    this.commit();
    const scene = new NightScene(this.engine, this.postfx, {
      night: c.day,
      stats: c.stats,
      seed: c.seed,
      quality: this.quality,
      onEnd: (result) => this.onNightEnd(result),
    });
    scene.rig.shakeEnabled = getGame().settings.shake;
    scene.numbers.enabled = getGame().settings.damageNumbers;
    this.night = scene;
    this.setScene(scene);
    track(`${c.day}일차 밤`, c.day * 2);
    setGame({ screen: 'night', result: null, paused: false });
    await this.fade(0, 0.5);
  }

  chooseLevelUp(index: number): void {
    this.night?.choose(index);
  }

  private onNightEnd(result: NightResult): void {
    const c = this.c;
    c.totalKills += result.kills;
    c.eliteKills += result.eliteKills;
    if (result.bossKilled) c.bossKills++;
    if (result.noDamage) c.noDamageNights++;
    c.score += result.scoreGain;
    const gps = c.flags.gps ? 1.5 : 1;
    const delta = result.suspicionDelta + (c.flags.gps ? Math.round(result.lateSeconds * balance.suspicion.night.perLateSecond * (gps - 1)) : 0);
    result.suspicionDelta = delta;
    c.suspicion = Math.max(0, Math.min(100, c.suspicion + delta));
    c.results.push(result);
    if (c.day >= balance.campaign.nights && result.bossKilled) c.flags.finalBoss = true;
    this.commit();
    this.engine.paused = true;
    audio.playMusic('cutscene', 2);
    setGame({ screen: 'result', result, levelUp: null, bossIntro: null });
  }

  async confirmResult(): Promise<void> {
    const s = getGame();
    if (this.busy || s.screen !== 'result' || !s.result) return;
    this.busy = true;
    audio.ui('confirm');
    const c = this.c;
    const result = s.result;
    await this.fade(1, 0.6);
    this.engine.paused = false;
    await this.playCut(morning(c, result));

    if (c.suspicion >= 100) await this.runCloseCall();
    else if (suspicionTier(c.suspicion) >= 3 && !c.flags.gps) {
      c.flags.gps = true;
      await this.playCut(gpsEvent());
    }

    if (c.day >= balance.campaign.nights) {
      await this.finishCampaign();
    } else {
      startNewDay(c);
      this.commit();
      this.save();
      this.busy = false;
      await this.enterDay();
      return;
    }
    this.busy = false;
  }

  // ---------- 들킬 뻔한 순간: 시치미 떼기 ----------

  private async runCloseCall(): Promise<void> {
    const c = this.c;
    const cfg = balance.suspicion.closeCall;
    await this.playCut(closeCall(c.closeCalls), false);
    this.closeRounds = this.rng.shuffle([...ACT_NORMAL_ROUNDS]).slice(0, cfg.rounds);
    setGame({ screen: 'closecall', cut: { ...getGame().cut, active: false, letterbox: true } });
    audio.playMusic('boss', 0.6);
    const success = await new Promise<boolean>((resolve) => {
      this.closeResolve = resolve;
      this.nextCloseRound(0, 0);
    });
    c.closeCalls++;
    if (success) c.suspicion = cfg.successTo;
    else {
      c.suspicion = cfg.failTo;
      c.caughtFlags++;
    }
    this.commit();
    setGame({ closeCall: null });
    audio.playMusic('cutscene', 0.8);
    await this.playCut(closeCallResult(success), false);
  }

  private nextCloseRound(round: number, successes: number): void {
    const cfg = balance.suspicion.closeCall;
    if (round >= this.closeRounds.length) {
      this.closeResolve?.(successes * 2 > this.closeRounds.length);
      this.closeResolve = null;
      return;
    }
    const r = this.closeRounds[round];
    const options = this.rng.shuffle([
      { label: r.good, good: true },
      { label: r.bad[0], good: false },
      { label: r.bad[1], good: false },
    ]);
    setGame({ closeCall: { round, total: this.closeRounds.length, prompt: r.prompt, options, time: 1, successes, feedback: null, done: false } });
    const proxy = { v: 1 };
    this.closeTimer?.kill();
    this.closeTimer = gsap.to(proxy, {
      v: 0,
      duration: cfg.timePerRound,
      ease: 'none',
      onUpdate: () => {
        const cc = getGame().closeCall;
        if (cc && !cc.feedback) setGame({ closeCall: { ...cc, time: proxy.v } });
      },
      onComplete: () => this.closeCallPick(-1),
    });
  }

  /** 미니게임 선택지(-1 은 시간 초과). */
  closeCallPick(index: number): void {
    const cc = getGame().closeCall;
    if (!cc || cc.feedback) return;
    this.closeTimer?.kill();
    const good = index >= 0 && cc.options[index]?.good;
    const successes = cc.successes + (good ? 1 : 0);
    if (good) {
      audio.synth('chime', { volume: 0.5, fixed: true });
      this.day?.effect('stars');
    } else {
      audio.synth('warn', { volume: 0.6, fixed: true });
      this.day?.effect('bang');
    }
    setGame({ closeCall: { ...cc, successes, feedback: index < 0 ? '너무 오래 망설였다…' : good ? '평범한 개 같았다!' : '너무 똑똑해 보였다…' } });
    gsap.delayedCall(1.1, () => this.nextCloseRound(cc.round + 1, successes));
  }

  // ---------- 엔딩 ----------

  private async finishCampaign(): Promise<void> {
    const c = this.c;
    const e = balance.endings;
    const sc = balance.score;
    let id: EndingId = 'secret';
    if (c.caughtFlags >= e.caughtFlags || c.suspicion >= 100) id = 'caught';
    else if (c.stats.bond >= e.trueBond && c.suspicion <= e.trueSuspicion && c.flags.finalBoss) id = 'true';
    if (c.suspicion <= sc.lowSuspicionThreshold) c.score += sc.lowSuspicionEnd;
    if (c.stats.bond >= balance.stats.max) c.score += sc.bondMaxEnd;
    if (id !== 'caught') c.score += sc.secretKept;
    this.commit();
    await this.playCut(ending(id, c), false);
    const ranking = addRanking({ score: c.score, kills: c.totalKills, ending: id, date: new Date().toISOString().slice(0, 10) });
    clearCampaign();
    track('엔딩: ' + id, 15);
    setGame({ screen: 'ending', ending: id, ranking, hasSave: false });
    await this.fade(0.55, 0.8);
  }

  // ---------- 설정·일시정지 ----------

  togglePause(): void {
    const s = getGame();
    if (s.screen !== 'day' && s.screen !== 'night') return;
    const paused = !s.paused;
    setGame({ paused, settingsOpen: paused ? s.settingsOpen : false });
    if (s.screen === 'night' && !s.levelUp) this.engine.paused = paused;
    audio.ui(paused ? 'click' : 'back');
  }

  setSettings(patch: Partial<Settings>): void {
    const settings = { ...getGame().settings, ...patch };
    setGame({ settings });
    saveSettings(settings);
    audio.setVolumes(settings.master, settings.music, settings.sfx);
    if (patch.quality) {
      this.postfx.setQuality(qualities[patch.quality as QualityId]);
      // 타이틀에서는 바로 무대를 다시 지어 그림자·파티클 설정을 반영한다.
      if (this.day && getGame().screen === 'title') {
        this.day = new DayScene(this.quality);
        this.setScene(this.day);
        this.showTitle();
      }
    }
    if (this.night) {
      this.night.rig.shakeEnabled = settings.shake;
      this.night.numbers.enabled = settings.damageNumbers;
      this.night.particles.scale = qualities[settings.quality].particleScale;
    }
  }

  async toTitle(): Promise<void> {
    if (this.busy && getGame().screen !== 'ending') return;
    audio.ui('back');
    await this.fade(1, 0.4);
    this.engine.paused = false;
    this.engine.timeScale = 1;
    this.busy = false;
    this.showTitle();
    setGame({ hasSave: !!loadCampaign() });
    await this.fade(0, 0.4);
  }

  /** 개발·테스트용: 특정 날의 낮이나 밤으로 바로 들어간다. */
  async debugStart(kind: 'day' | 'night', day: number, statValue: number, bot: boolean): Promise<void> {
    const c = newCampaign();
    c.day = day;
    if (statValue > 0) for (const k of ['vitality', 'strength', 'agility', 'focus', 'bond'] as const) c.stats[k] = statValue;
    setGame({ campaign: c });
    this.rng = new Rng(c.seed);
    if (kind === 'day') {
      await this.enterDay();
      return;
    }
    await this.needNightAssets();
    this.cut.skipNext = true;
    await this.startNight();
    if (bot) this.night?.debug.bot(true);
  }

  /** 테스트용: 이름으로 컷씬 스크립트를 고른다. */
  debugCutscenes(): Record<string, () => Step[]> {
    const mk = (day: number, bond = 10, suspicion = 5): Campaign => ({ ...newCampaign(), day, suspicion, stats: { ...balance.stats.start, bond } });
    const r = (patch: Partial<NightResult>): NightResult => ({
      night: 1, kills: 99, eliteKills: 1, bossKilled: true, bossName: '대왕 호박', damageTaken: 0, maxHp: 120, lateSeconds: 0, yardKills: 0,
      knockedOut: false, level: 9, suspicionDelta: 0, suspicionParts: [], scoreGain: 0, noDamage: true, ...patch,
    });
    return {
      prologue,
      awakening,
      evening1: () => evening(mk(1)),
      evening4: () => evening(mk(4, 10, 80)),
      sortie1: () => sortie(mk(1)),
      sortie2: () => sortie(mk(2)),
      sortie3cat: () => sortie(mk(3)),
      sortie4: () => sortie(mk(4)),
      sortie5brave: () => sortie(mk(5, 60)),
      sortie5faint: () => sortie(mk(5, 20)),
      sortie6crater: () => sortie(mk(6)),
      sortie7final: () => sortie(mk(7)),
      morning: () => morning(mk(1), r({})),
      morningKo: () => morning(mk(2, 10, 60), r({ knockedOut: true, noDamage: false })),
      gps: gpsEvent,
      closeCall0: () => [...closeCall(0), ...closeCallResult(true)],
      closeCall1: () => [...closeCall(1), ...closeCallResult(false)],
      closeCall2: () => [...closeCall(2), ...closeCallResult(true)],
      endingSecret: () => ending('secret', mk(7)),
      endingCaught: () => ending('caught', mk(7)),
      endingTrue: () => ending('true', mk(7, 100)),
    };
  }

  async debugPlayCutscene(name: string): Promise<void> {
    const make = this.debugCutscenes()[name];
    if (!make) throw new Error(`없는 컷씬: ${name}`);
    if (!getGame().campaign) setGame({ campaign: newCampaign() });
    await this.needNightAssets();
    await this.playCut(make(), false);
    setGame({ cut: { ...getGame().cut, fade: 0 } });
  }

  showRanking(show: boolean): void {
    audio.ui(show ? 'click' : 'back');
    setGame({ screen: show ? 'ranking' : 'title', ranking: loadRanking() });
  }
}

let instance: Director | null = null;
export function director(): Director {
  if (!instance) instance = new Director(document.getElementById('game') as HTMLCanvasElement);
  return instance;
}

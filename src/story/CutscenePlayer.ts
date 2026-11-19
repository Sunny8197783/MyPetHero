import { gsap } from 'gsap';
import { audio, type FileSfx, type SynthSfx } from '../audio/audio';
import type { TrackId } from '../audio/music';
import { EMPTY_CUT, getGame, setGame, type Speaker } from '../core/store';
import type { LookId, PostFx } from '../vfx/postfx';
import type { SkyId } from '../vfx/sky';
import type { ActorId, StageBase } from './stage';

type V3 = [number, number, number];

/**
 * 컷씬 스크립트의 한 단계. 스크립트는 이 단계들의 배열(데이터)이고, CutscenePlayer 가 순서대로 실행한다.
 * wait:false 를 주면 그 단계가 끝나기를 기다리지 않고 다음 단계로 넘어간다(동시 진행).
 */
export type Step =
  | { t: 'stage'; id: 'house' | 'street'; sky?: SkyId; look?: LookId }
  | { t: 'sky'; from: SkyId; to: SkyId; dur: number; wait?: boolean }
  | { t: 'look'; id: LookId; dur?: number }
  | { t: 'cam'; pos: V3; look: V3; dur?: number; ease?: string; fov?: number; wait?: boolean }
  | { t: 'place'; actor: ActorId; pos: [number, number]; face?: number; y?: number; visible?: boolean; scale?: number }
  | { t: 'move'; actor: ActorId; to: [number, number]; dur: number; run?: boolean; wait?: boolean }
  | { t: 'face'; actor: ActorId; to: [number, number] }
  | { t: 'anim'; actor: ActorId; clip: string; once?: boolean }
  | { t: 'hop'; actor: ActorId; height?: number; times?: number; wait?: boolean }
  | { t: 'pose'; actor: ActorId; lie?: boolean; sit?: boolean }
  | { t: 'say'; who: Speaker; text: string }
  | { t: 'think'; text: string }
  | { t: 'wait'; dur: number }
  | { t: 'sfx'; id: SynthSfx | FileSfx; volume?: number; rate?: number }
  | { t: 'music'; id: TrackId | null }
  | { t: 'fx'; kind: string; value?: number }
  | { t: 'fade'; to: number; dur?: number; color?: string }
  | { t: 'flash'; color?: string }
  | { t: 'card'; title: string; subtitle?: string; dur?: number }
  | { t: 'dof'; value: number; focus?: number }
  | { t: 'call'; fn: () => void };

export const SPEAKER_NAMES: Record<Speaker, string> = {
  dog: '호두',
  owner: '지우',
  cat: '나비',
  narr: '',
  boss: '???',
  friend: '지우 친구',
  delivery: '택배 기사',
  news: '뉴스',
};

const FILE_SFX = new Set<string>(['hit', 'destroy', 'enemyAttack', 'shoot', 'land', 'jump', 'swap', 'coin', 'break', 'fall', 'step', 'click', 'click2', 'click3', 'back', 'toggle', 'rotate']);

export interface CutsceneHost {
  /** 무대를 준비해 엔진에 올린다. 같은 무대가 이미 있으면 그대로 쓴다. */
  useStage(id: 'house' | 'street'): Promise<StageBase>;
  readonly postfx: PostFx;
}

/** 데이터 기반 컷씬 실행기: 시네마틱 카메라(GSAP), 대사, 효과, 스킵. */
export class CutscenePlayer {
  active = false;
  /** 다음 컷씬 하나를 통째로 건너뛴다(테스트용). */
  skipNext = false;
  private skipping = false;
  private resume: (() => void) | null = null;
  private lineSeq = 0;
  private readonly tweens = new Set<gsap.core.Animation>();
  private stage: StageBase | null = null;

  constructor(private readonly host: CutsceneHost) {}

  /** 대사를 넘긴다(UI 클릭). */
  advance(): void {
    const r = this.resume;
    this.resume = null;
    r?.();
  }

  skip(): void {
    if (!this.active || !getGame().cut.skippable) return;
    this.skipping = true;
    for (const t of this.tweens) t.progress(1);
    this.tweens.clear();
    this.advance();
  }

  private track<T extends gsap.core.Animation>(anim: T, wait: boolean): Promise<void> {
    if (this.skipping) {
      anim.progress(1);
      return Promise.resolve();
    }
    this.tweens.add(anim);
    const done = new Promise<void>((resolve) => {
      anim.eventCallback('onComplete', () => {
        this.tweens.delete(anim);
        resolve();
      });
    });
    return wait ? done : Promise.resolve();
  }

  private delay(seconds: number): Promise<void> {
    if (this.skipping || seconds <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const call = gsap.delayedCall(seconds, () => {
        this.resume = null;
        resolve();
      });
      // 스킵하면 지연도 즉시 끝난다.
      this.resume = () => {
        call.kill();
        resolve();
      };
    });
  }

  private setCut(patch: Partial<ReturnType<typeof getGame>['cut']>): void {
    setGame({ cut: { ...getGame().cut, ...patch } });
  }

  private async line(who: Speaker, text: string, thought: boolean): Promise<void> {
    if (this.skipping) return;
    this.setCut({ line: { who, name: SPEAKER_NAMES[who], text, thought, seq: ++this.lineSeq } });
    await new Promise<void>((resolve) => {
      this.resume = resolve;
    });
    this.setCut({ line: null });
  }

  async play(steps: Step[], skippable = true): Promise<void> {
    this.active = true;
    this.skipping = this.skipNext;
    this.skipNext = false;
    setGame({ screen: 'cutscene', cut: { ...getGame().cut, active: true, letterbox: true, line: null, card: null, skippable } });
    for (const step of steps) {
      await this.exec(step);
    }
    for (const t of this.tweens) t.progress(1);
    this.tweens.clear();
    this.host.postfx.dof = 0;
    this.active = false;
    setGame({ cut: { ...EMPTY_CUT, fade: getGame().cut.fade, fadeColor: getGame().cut.fadeColor } });
  }

  private async exec(s: Step): Promise<void> {
    const stage = this.stage;
    switch (s.t) {
      case 'stage': {
        this.stage = await this.host.useStage(s.id);
        if (s.sky) this.stage.sky.set(s.sky);
        if (s.sky && 'setSky' in this.stage) (this.stage as StageBase & { setSky(a: SkyId, b: SkyId, t: number): void }).setSky(s.sky, s.sky, 0);
        if (s.look) this.host.postfx.setLook(s.look, 0);
        return;
      }
      case 'sky': {
        if (!stage || !('setSky' in stage)) return;
        const st = stage as StageBase & { setSky(a: SkyId, b: SkyId, t: number): void };
        const proxy = { v: 0 };
        st.setSky(s.from, s.to, 0);
        return this.track(gsap.to(proxy, { v: 1, duration: s.dur, ease: 'none', onUpdate: () => st.setSky(s.from, s.to, proxy.v) }), s.wait !== false);
      }
      case 'look':
        this.host.postfx.setLook(s.id, this.skipping ? 0 : (s.dur ?? 1));
        return;
      case 'cam': {
        if (!stage) return;
        if (!s.dur || this.skipping) {
          stage.setCam(s.pos, s.look, s.fov);
          return;
        }
        const tl = gsap.timeline();
        stage.camTo(tl, s.pos, s.look, s.dur, s.ease ?? 'power2.inOut', 0);
        if (s.fov) tl.to(stage.cam, { fov: s.fov, duration: s.dur, ease: 'power2.inOut' }, 0);
        return this.track(tl, s.wait !== false);
      }
      case 'place': {
        if (!stage) return;
        const ensure = (stage as StageBase & { ensureActor?(id: ActorId): unknown }).ensureActor;
        if (ensure) ensure.call(stage, s.actor);
        const a = stage.actor(s.actor);
        if (!a) return;
        gsap.killTweensOf(a.root.position);
        a.stopMove();
        a.root.position.set(s.pos[0], s.y ?? 0, s.pos[1]);
        if (s.face !== undefined) a.root.rotation.y = s.face;
        if (s.visible !== undefined) a.root.visible = s.visible;
        if (s.scale !== undefined) a.root.scale.setScalar(s.scale);
        return;
      }
      case 'move': {
        if (!stage) return;
        const a = stage.actor(s.actor);
        if (!a) return;
        if (this.skipping) {
          a.root.position.x = s.to[0];
          a.root.position.z = s.to[1];
          a.stopMove();
          return;
        }
        const tl = gsap.timeline();
        stage.walk(tl, s.actor, s.to[0], s.to[1], s.dur, !!s.run);
        return this.track(tl, s.wait !== false);
      }
      case 'face':
        stage?.actor(s.actor)?.face(s.to[0], s.to[1]);
        return;
      case 'anim':
        stage?.actor(s.actor)?.anim(s.clip, !!s.once);
        return;
      case 'hop': {
        const a = stage?.actor(s.actor);
        if (!a || this.skipping) return;
        const base = a.root.position.y;
        const tw = gsap.to(a.root.position, { y: base + (s.height ?? 0.5), duration: 0.14, yoyo: true, repeat: (s.times ?? 1) * 2 - 1, ease: 'sine.out' });
        return this.track(tw, s.wait !== false);
      }
      case 'pose': {
        const a = stage?.actor(s.actor);
        if (!a) return;
        if (a.dog) {
          a.dog.body.rotation.z = s.lie ? 1.35 : 0;
          a.dog.body.rotation.x = s.sit ? -0.5 : 0;
          a.dog.body.position.y = s.lie ? 0.32 : s.sit ? -0.18 : 0;
        } else {
          a.anim(s.lie ? 'Lie_Idle' : s.sit ? 'Sit_Floor_Idle' : 'Idle');
        }
        return;
      }
      case 'say':
        return this.line(s.who, s.text, false);
      case 'think':
        return this.line('dog', s.text, true);
      case 'wait':
        return this.delay(s.dur);
      case 'sfx':
        if (this.skipping) return;
        if (FILE_SFX.has(s.id)) audio.file(s.id as FileSfx, { volume: s.volume ?? 0.7, rate: s.rate, fixed: true });
        else audio.synth(s.id as SynthSfx, { volume: s.volume ?? 0.7, rate: s.rate, fixed: true });
        return;
      case 'music':
        audio.playMusic(s.id, 1.5);
        return;
      case 'fx':
        stage?.effect(s.kind, s.value);
        return;
      case 'fade': {
        const proxy = { v: getGame().cut.fade };
        if (s.color) this.setCut({ fadeColor: s.color });
        const dur = this.skipping ? 0 : (s.dur ?? 0.6);
        if (dur <= 0) {
          this.setCut({ fade: s.to });
          return;
        }
        return this.track(gsap.to(proxy, { v: s.to, duration: dur, ease: 'power1.inOut', onUpdate: () => this.setCut({ fade: proxy.v }) }), true);
      }
      case 'flash': {
        if (this.skipping) return;
        const el = document.getElementById('flash');
        if (el) {
          el.style.background = s.color ?? '#fff';
          el.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 260, easing: 'ease-out' });
        }
        return;
      }
      case 'card':
        if (this.skipping) return;
        this.setCut({ card: { title: s.title, subtitle: s.subtitle } });
        await this.delay(s.dur ?? 2.2);
        this.setCut({ card: null });
        return;
      case 'dof':
        this.host.postfx.dof = s.value;
        if (s.focus) this.host.postfx.dofFocus = s.focus;
        return;
      case 'call':
        s.fn();
        return;
      default:
        return;
    }
  }
}

import { Howl, Howler } from 'howler';
import { assetUrl } from '../core/assets';
import { fxRng } from '../core/rng';
import { feel } from '../data';
import { Music, type TrackId } from './music';

/** 파일 기반 효과음 (Kenney Starter Kits, CC0). */
const FILES = {
  hit: 'enemy_hurt',
  destroy: 'enemy_destroy',
  enemyAttack: 'enemy_attack',
  shoot: 'blaster',
  land: 'land',
  jump: 'jump_a',
  swap: 'weapon_change',
  coin: 'coin',
  break: 'break',
  fall: 'fall',
  step: 'walking',
  click: 'placement-a',
  click2: 'placement-b',
  click3: 'placement-c',
  back: 'removal-a',
  toggle: 'toggle',
  rotate: 'rotate',
} as const;

export type FileSfx = keyof typeof FILES;
export type SynthSfx =
  | 'thump' | 'bark' | 'zap' | 'laser' | 'whoosh' | 'chime' | 'gem' | 'pop' | 'boom' | 'evolve' | 'awaken'
  | 'squeak' | 'yelp' | 'blip' | 'fire' | 'warn' | 'dawn' | 'meow' | 'rain' | 'thunder' | 'snore' | 'heart';

const SR = 44100;

type Gen = (t: number, i: number) => number;

function render(seconds: number, gen: Gen): Float32Array {
  const n = Math.floor(seconds * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = gen(i / SR, i);
  // 끝부분 클릭 방지
  const fade = Math.min(n, 300);
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade;
  return out;
}

const TAU = Math.PI * 2;
const env = (t: number, a: number, d: number): number => (t < a ? t / a : Math.exp(-(t - a) / d));
let seed = 1234567;
const rnd = (): number => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296 - 0.5;
};
function sweepPhase(f0: number, f1: number, dur: number, t: number): number {
  // 지수 스윕의 위상 적분
  const k = Math.log(f1 / f0) / dur;
  return (TAU * f0 * (Math.exp(k * t) - 1)) / k;
}

function buildSynth(): Record<SynthSfx, Float32Array> {
  let lp = 0;
  return {
    thump: render(0.26, (t) => Math.sin(sweepPhase(150, 42, 0.26, t)) * env(t, 0.003, 0.07) * 0.95 + rnd() * env(t, 0.001, 0.008) * 0.5),
    bark: render(0.2, (t) => {
      const ph = sweepPhase(560, 330, 0.2, t);
      const s = Math.sin(ph) + 0.6 * Math.sin(ph * 2) + 0.35 * Math.sin(ph * 3) + 0.2 * Math.sin(ph * 5);
      return (s * 0.4 + rnd() * 0.35) * env(t, 0.006, 0.05);
    }),
    zap: render(0.22, (t) => {
      const sq = Math.sign(Math.sin(sweepPhase(2400, 220, 0.22, t)));
      return (sq * 0.3 + rnd() * 0.5) * env(t, 0.002, 0.06);
    }),
    laser: render(0.3, (t) => {
      const ph = sweepPhase(1900, 260, 0.3, t);
      return (((ph / TAU) % 1) * 2 - 1) * 0.3 * env(t, 0.004, 0.11) + Math.sin(ph * 0.5) * 0.25 * env(t, 0.004, 0.14);
    }),
    whoosh: render(0.36, (t) => {
      lp += (rnd() * 2 - lp) * (0.04 + 0.3 * Math.sin((t / 0.36) * Math.PI));
      return lp * Math.sin((t / 0.36) * Math.PI) * 0.9;
    }),
    chime: render(0.7, (t) => {
      let s = 0;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, k) => {
        const tt = t - k * 0.07;
        if (tt > 0) s += Math.sin(TAU * f * tt) * env(tt, 0.004, 0.16) * 0.28;
      });
      return s;
    }),
    gem: render(0.1, (t) => Math.sin(sweepPhase(900, 1500, 0.1, t)) * env(t, 0.003, 0.03) * 0.5),
    pop: render(0.09, (t) => Math.sin(sweepPhase(320, 760, 0.09, t)) * env(t, 0.002, 0.03) * 0.6),
    boom: render(0.7, (t) => {
      lp += (rnd() * 2 - lp) * 0.08;
      return Math.sin(sweepPhase(110, 30, 0.7, t)) * env(t, 0.004, 0.2) * 0.9 + lp * env(t, 0.002, 0.16) * 1.4;
    }),
    evolve: render(0.9, (t) => {
      const ph = sweepPhase(220, 880, 0.9, t);
      const chord = Math.sin(TAU * 659.25 * t) + Math.sin(TAU * 987.77 * t) + Math.sin(TAU * 1318.5 * t);
      return Math.sin(ph) * 0.25 * (1 - t / 0.9) + chord * 0.12 * env(Math.max(0, t - 0.35), 0.01, 0.25);
    }),
    awaken: render(1.2, (t) => {
      const chord = Math.sin(TAU * 261.63 * t) + Math.sin(TAU * 392 * t) + Math.sin(TAU * 523.25 * t) + Math.sin(TAU * 783.99 * t);
      const shimmer = Math.sin(TAU * (1568 + 200 * Math.sin(TAU * 7 * t)) * t) * 0.08;
      return (chord * 0.16 + shimmer) * Math.min(1, t / 0.08) * Math.exp(-t / 0.5) + Math.sin(sweepPhase(90, 40, 1.2, t)) * 0.5 * env(t, 0.005, 0.2);
    }),
    squeak: render(0.14, (t) => Math.sin(TAU * (1300 + 500 * Math.sin((t / 0.14) * Math.PI)) * t) * env(t, 0.004, 0.06) * 0.4),
    yelp: render(0.2, (t) => {
      const ph = sweepPhase(980, 520, 0.2, t) + Math.sin(TAU * 28 * t) * 0.8;
      return (Math.sin(ph) + 0.4 * Math.sin(ph * 2)) * env(t, 0.004, 0.07) * 0.4;
    }),
    blip: render(0.05, (t) => Math.sign(Math.sin(TAU * 440 * t)) * 0.18 * env(t, 0.002, 0.02)),
    fire: render(0.4, (t) => {
      lp += (rnd() * 2 - lp) * 0.25;
      return lp * env(t, 0.02, 0.13) * 0.8;
    }),
    warn: render(0.34, (t) => Math.sign(Math.sin(TAU * (t < 0.17 ? 620 : 470) * t)) * 0.16 * (t % 0.17 < 0.13 ? 1 : 0)),
    dawn: render(1.4, (t) => {
      let s = 0;
      [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, k) => {
        const tt = t - k * 0.16;
        if (tt > 0) s += Math.sin(TAU * f * tt) * env(tt, 0.01, 0.4) * 0.2;
      });
      return s;
    }),
    meow: render(0.42, (t) => {
      const f = 520 + 380 * Math.sin((t / 0.42) * Math.PI);
      const ph = TAU * f * t;
      return (Math.sin(ph) + 0.5 * Math.sin(ph * 2) + 0.2 * Math.sin(ph * 3)) * Math.sin((t / 0.42) * Math.PI) * 0.22;
    }),
    rain: render(2.0, () => {
      lp += (rnd() * 2 - lp) * 0.5;
      return lp * 0.5;
    }),
    thunder: render(1.6, (t) => {
      lp += (rnd() * 2 - lp) * (0.02 + 0.04 * Math.exp(-t * 4));
      return lp * 2.6 * env(t, 0.01, 0.5);
    }),
    snore: render(0.9, (t) => {
      lp += (rnd() * 2 - lp) * 0.06;
      return lp * 1.6 * Math.sin((t / 0.9) * Math.PI) * (0.6 + 0.4 * Math.sin(TAU * 26 * t));
    }),
    heart: render(0.16, (t) => Math.sin(sweepPhase(700, 1050, 0.16, t)) * env(t, 0.01, 0.06) * 0.35),
  };
}

interface PlayOpts {
  volume?: number;
  rate?: number;
  /** -1(왼쪽) ~ 1(오른쪽) */
  pan?: number;
  /** 피치 랜덤 폭을 끈다. */
  fixed?: boolean;
}

class AudioSystem {
  readonly music = new Music();
  private howls = new Map<string, Howl>();
  private buffers = new Map<string, AudioBuffer>();
  private synthData: Record<SynthSfx, Float32Array> | null = null;
  private sfxBus: GainNode | null = null;
  private lastPlay = new Map<string, number>();
  private voices = new Map<string, number>();
  private sfxVolume = 0.8;
  private ready = false;
  private duck = 1;
  private rainSource: AudioBufferSourceNode | null = null;

  /** 효과음 파일을 불러오고 합성음을 만든다. 로딩 화면에서 한 번 호출. */
  async load(): Promise<void> {
    Howler.volume(0.8);
    await Promise.all(
      (Object.entries(FILES) as [FileSfx, string][]).map(
        ([id, file]) =>
          new Promise<void>((resolve) => {
            const howl = new Howl({
              src: [assetUrl(`kenney-starter/sounds/${file}.ogg`)],
              format: ['ogg'],
              preload: true,
              onload: () => resolve(),
              onloaderror: () => resolve(),
            });
            this.howls.set(id, howl);
          }),
      ),
    );
    this.synthData = buildSynth();
    this.ensureGraph();
  }

  private ensureGraph(): void {
    if (this.ready) return;
    const ctx = Howler.ctx;
    if (!ctx || !Howler.masterGain) return;
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxVolume;
    this.sfxBus.connect(Howler.masterGain);
    this.music.attach(ctx, Howler.masterGain);
    if (this.synthData) {
      for (const [id, data] of Object.entries(this.synthData)) {
        const buf = ctx.createBuffer(1, data.length, SR);
        buf.getChannelData(0).set(data);
        this.buffers.set(id, buf);
      }
    }
    this.ready = true;
  }

  /** 사용자 입력 직후 호출해 오디오 컨텍스트를 깨운다. */
  unlock(): void {
    this.ensureGraph();
    const ctx = Howler.ctx;
    if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  }

  setVolumes(master: number, music: number, sfx: number): void {
    Howler.volume(master);
    this.sfxVolume = sfx;
    this.sfxBus?.gain.setTargetAtTime(sfx * this.duck, Howler.ctx.currentTime, 0.02);
    this.music.setVolume(music);
  }

  /** 히트스톱 동안 배경을 살짝 눌러 타격음이 도드라지게 한다. */
  setDuck(active: boolean): void {
    this.music.setDuck(active ? feel.audio.duckOnHitstop : 1);
  }

  private gate(id: string, now: number): boolean {
    const a = feel.audio;
    const last = this.lastPlay.get(id) ?? -1e9;
    if (now - last < a.minIntervalMs) return false;
    if ((this.voices.get(id) ?? 0) >= a.maxVoicesPerSound) return false;
    this.lastPlay.set(id, now);
    return true;
  }

  private pitch(opts?: PlayOpts): number {
    const base = opts?.rate ?? 1;
    return opts?.fixed ? base : base * (1 + (fxRng.next() - 0.5) * 2 * feel.audio.pitchVariance);
  }

  /** 파일 기반 효과음. */
  file(id: FileSfx, opts?: PlayOpts): void {
    const howl = this.howls.get(id);
    if (!howl || howl.state() !== 'loaded') return;
    if (!this.gate(id, performance.now())) return;
    this.voices.set(id, (this.voices.get(id) ?? 0) + 1);
    const sid = howl.play();
    howl.volume((opts?.volume ?? 1) * this.sfxVolume, sid);
    howl.rate(this.pitch(opts), sid);
    if (opts?.pan) howl.stereo(Math.max(-1, Math.min(1, opts.pan)), sid);
    howl.once('end', () => this.voices.set(id, Math.max(0, (this.voices.get(id) ?? 1) - 1)), sid);
  }

  /** 합성 효과음. */
  synth(id: SynthSfx, opts?: PlayOpts): void {
    this.ensureGraph();
    const ctx = Howler.ctx;
    const buf = this.buffers.get(id);
    if (!ctx || !buf || !this.sfxBus || ctx.state !== 'running') return;
    if (!this.gate(id, performance.now())) return;
    this.voices.set(id, (this.voices.get(id) ?? 0) + 1);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = this.pitch(opts);
    const gain = ctx.createGain();
    gain.gain.value = opts?.volume ?? 1;
    let node: AudioNode = gain;
    if (opts?.pan && ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, opts.pan));
      gain.connect(pan);
      node = pan;
    }
    src.connect(gain);
    node.connect(this.sfxBus);
    src.onended = () => this.voices.set(id, Math.max(0, (this.voices.get(id) ?? 1) - 1));
    src.start();
  }

  /** 타격음 레이어: 타격음 + 저음 임팩트. heavy 일수록 저음이 커진다. */
  impact(pan: number, heavy: number): void {
    const a = feel.audio;
    this.file('hit', { volume: a.hitVolume * (0.7 + heavy * 0.5), pan, rate: 1.05 - heavy * 0.15 });
    if (heavy > 0.25) this.synth('thump', { volume: a.lowImpactVolume * heavy, pan, rate: 1.1 - heavy * 0.25 });
  }

  /** 대사 타이핑 비프음. 화자마다 음색(피치)이 다르다. */
  blip(who: string): void {
    const rate = who === 'dog' ? 1.5 : who === 'owner' ? 1.0 : who === 'cat' ? 2.1 : who === 'boss' ? 0.42 : who === 'friend' ? 1.25 : who === 'delivery' ? 0.7 : 1.15;
    this.synth('blip', { volume: who === 'dog' ? 0.5 : 0.8, rate: rate * (1 + (fxRng.next() - 0.5) * 0.08), fixed: true });
  }

  ui(kind: 'click' | 'confirm' | 'back' | 'toggle' = 'click'): void {
    if (kind === 'confirm') this.file('click2', { volume: 0.7, fixed: true });
    else if (kind === 'back') this.file('back', { volume: 0.6, fixed: true });
    else if (kind === 'toggle') this.file('toggle', { volume: 0.6, fixed: true });
    else this.file('click', { volume: 0.6, fixed: true });
  }

  playMusic(id: TrackId | null, fade = 1.4): void {
    this.ensureGraph();
    this.music.play(id, fade);
  }

  /** 빗소리 루프(프롤로그). */
  setRain(on: boolean): void {
    const ctx = Howler.ctx;
    if (!ctx || !this.sfxBus) return;
    if (on && !this.rainSource) {
      const buf = this.buffers.get('rain');
      if (!buf) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0.35;
      src.connect(g);
      g.connect(this.sfxBus);
      src.start();
      this.rainSource = src;
    } else if (!on && this.rainSource) {
      try {
        this.rainSource.stop();
      } catch {
        /* 이미 멈춘 경우 */
      }
      this.rainSource = null;
    }
  }
}

export const audio = new AudioSystem();

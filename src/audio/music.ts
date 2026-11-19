// 절차적 BGM: Web Audio 스텝 시퀀서(룩어헤드 스케줄링). 외부 음원 없이 4곡을 합성하고 크로스페이드한다.

export type TrackId = 'day' | 'night' | 'boss' | 'cutscene';

const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

interface Track {
  bpm: number;
  /** 마디마다의 코드(미디 노트, 루트 포함). */
  chords: number[][];
  step: (s: Scheduler, bar: number, step: number, time: number, chord: number[]) => void;
}

class Scheduler {
  constructor(
    readonly ctx: AudioContext,
    readonly out: GainNode,
    private readonly pluckCache: Map<number, AudioBuffer>,
    private readonly noiseBuf: AudioBuffer,
  ) {}

  osc(type: OscillatorType, midi: number, time: number, dur: number, vol: number, attack = 0.005, cutoff = 0): void {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = midiHz(midi);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(vol, time + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    if (cutoff > 0) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(cutoff, time);
      f.frequency.exponentialRampToValueAtTime(Math.max(120, cutoff * 0.3), time + dur);
      o.connect(f);
      f.connect(g);
    } else {
      o.connect(g);
    }
    g.connect(this.out);
    o.start(time);
    o.stop(time + dur + 0.02);
  }

  /** Karplus-Strong 뜯는 현(어쿠스틱 기타 느낌). 음높이별로 한 번만 합성해 재사용한다. */
  pluck(midi: number, time: number, vol: number): void {
    let buf = this.pluckCache.get(midi);
    if (!buf) {
      const sr = this.ctx.sampleRate;
      const n = Math.floor(sr * 1.1);
      buf = this.ctx.createBuffer(1, n, sr);
      const data = buf.getChannelData(0);
      const period = Math.max(2, Math.round(sr / midiHz(midi)));
      const ring = new Float32Array(period);
      let seed = midi * 9973 + 17;
      for (let i = 0; i < period; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        ring[i] = seed / 2147483648 - 1;
      }
      let idx = 0;
      for (let i = 0; i < n; i++) {
        const next = (idx + 1) % period;
        const v = (ring[idx] + ring[next]) * 0.4985;
        data[i] = ring[idx];
        ring[idx] = v;
        idx = next;
      }
      this.pluckCache.set(midi, buf);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g);
    g.connect(this.out);
    src.start(time);
  }

  noise(time: number, dur: number, vol: number, type: BiquadFilterType, freq: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.out);
    src.start(time, Math.random() * 0.5, dur + 0.02);
  }

  kick(time: number, vol: number): void {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, time);
    o.frequency.exponentialRampToValueAtTime(42, time + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
    o.connect(g);
    g.connect(this.out);
    o.start(time);
    o.stop(time + 0.22);
  }
}

const TRACKS: Record<TrackId, Track> = {
  // 낮: 어쿠스틱, 경쾌 (C 장조)
  day: {
    bpm: 104,
    chords: [[48, 60, 64, 67, 72], [45, 57, 60, 64, 69], [41, 53, 57, 60, 65], [43, 55, 59, 62, 67]],
    step(s, bar, step, time, chord) {
      const arp = [1, 3, 2, 4, 3, 2, 4, 3];
      if (step % 2 === 0) s.pluck(chord[arp[(step / 2) % 8]], time, 0.2);
      if (step === 0 || step === 8) s.osc('triangle', chord[0], time, 0.5, 0.22, 0.01);
      if (step === 6 || step === 14) s.osc('triangle', chord[0] + 7, time, 0.25, 0.12, 0.01);
      if (step % 4 === 2) s.noise(time, 0.05, 0.035, 'highpass', 6000);
      const melody = [
        [76, 0, 79, 0, 76, 0, 72, 0],
        [0, 0, 72, 0, 76, 0, 74, 0],
        [77, 0, 76, 0, 72, 0, 69, 0],
        [71, 0, 74, 0, 79, 0, 0, 0],
      ];
      const note = step % 2 === 0 ? melody[bar % 4][(step / 2) % 8] : 0;
      if (note && bar % 8 >= 4) s.pluck(note, time, 0.16);
    },
  },
  // 밤: 신스 액션 (A 단조)
  night: {
    bpm: 132,
    chords: [[45, 57, 60, 64], [41, 53, 57, 60], [48, 55, 60, 64], [43, 55, 59, 62]],
    step(s, bar, step, time, chord) {
      const beat = 60 / 132 / 4;
      s.osc('sawtooth', chord[0] - (step % 4 === 2 ? 0 : 12) + (step % 8 === 6 ? 12 : 0), time, beat * 0.9, 0.16, 0.004, 900);
      const up = [1, 2, 3, 2];
      if (bar % 8 >= 2) s.osc('square', chord[up[step % 4]] + 12, time, beat * 0.8, 0.045, 0.004, 2600);
      if (step % 4 === 0) s.kick(time, 0.5);
      if (step === 4 || step === 12) s.noise(time, 0.12, 0.16, 'bandpass', 1900);
      if (step % 2 === 0) s.noise(time, 0.03, 0.05, 'highpass', 8000);
      const lead = [69, 0, 0, 72, 0, 0, 76, 0, 74, 0, 72, 0, 0, 0, 67, 0];
      if (bar % 8 >= 4 && lead[step]) s.osc('triangle', lead[step] + (bar % 2 ? 0 : 0), time, beat * 2.2, 0.1, 0.01);
    },
  },
  // 보스: 빠르고 무겁게 (D 단조)
  boss: {
    bpm: 152,
    chords: [[38, 50, 53, 57], [34, 46, 50, 53], [43, 55, 58, 62], [45, 57, 61, 64]],
    step(s, bar, step, time, chord) {
      const beat = 60 / 152 / 4;
      s.osc('sawtooth', chord[0] + (step % 2 ? 12 : 0), time, beat * 0.85, 0.2, 0.003, 1300);
      if (step % 4 === 0 || step === 10 || step === 14) s.kick(time, 0.6);
      if (step === 4 || step === 12) s.noise(time, 0.14, 0.2, 'bandpass', 1700);
      s.noise(time, 0.025, step % 2 ? 0.03 : 0.06, 'highpass', 9000);
      const riff = [74, 0, 74, 77, 0, 74, 0, 81, 79, 0, 77, 0, 74, 0, 72, 73];
      if (riff[step]) s.osc('square', riff[step] + (bar % 4 === 3 ? 2 : 0), time, beat * 1.4, 0.07, 0.004, 3400);
      if (step === 0) for (const n of chord.slice(1)) s.osc('sawtooth', n + 12, time, beat * 8, 0.03, 0.02, 1500);
    },
  },
  // 컷씬: 느린 패드와 오르골 (F 장조)
  cutscene: {
    bpm: 72,
    chords: [[41, 53, 57, 60, 64], [38, 50, 53, 57, 62], [46, 53, 58, 62, 65], [36, 52, 55, 60, 64]],
    step(s, bar, step, time, chord) {
      const beat = 60 / 72 / 4;
      if (step === 0) {
        for (const n of chord.slice(1)) s.osc('sine', n, time, beat * 16, 0.07, 0.6);
        s.osc('triangle', chord[0], time, beat * 14, 0.12, 0.3);
      }
      const box = [0, 4, 3, 0, 2, 0, 4, 0, 3, 0, 2, 0, 1, 0, 0, 0];
      const idx = box[(step + bar * 3) % 16];
      if (idx && step % 2 === 0) s.osc('sine', chord[idx] + 24, time, 0.9, 0.09, 0.003);
    },
  },
};

interface Playing {
  id: TrackId;
  gain: GainNode;
  nextTime: number;
  step: number;
}

export class Music {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private duckGain: GainNode | null = null;
  private volume = 0.6;
  private current: Playing | null = null;
  private fading: Playing[] = [];
  private pending: { id: TrackId | null; fade: number } | null = null;
  private timer = 0;
  private readonly pluckCache = new Map<number, AudioBuffer>();
  private noiseBuf: AudioBuffer | null = null;

  attach(ctx: AudioContext, dest: AudioNode): void {
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = this.volume;
    this.duckGain = ctx.createGain();
    this.bus.connect(this.duckGain);
    this.duckGain.connect(dest);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      this.play(p.id, p.fade);
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.bus && this.ctx) this.bus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  setDuck(v: number): void {
    if (this.duckGain && this.ctx) this.duckGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
  }

  get playing(): TrackId | null {
    return this.current?.id ?? null;
  }

  /** 곡을 바꾼다. 이전 곡은 fade 초 동안 줄어들고 새 곡이 올라온다. */
  play(id: TrackId | null, fade = 1.4): void {
    if (!this.ctx || !this.bus) {
      this.pending = { id, fade };
      return;
    }
    if (this.current?.id === id) return;
    const now = this.ctx.currentTime;
    if (this.current) {
      const old = this.current;
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0.0001, now + fade);
      this.fading.push(old);
      window.setTimeout(() => {
        old.gain.disconnect();
        this.fading = this.fading.filter((f) => f !== old);
      }, (fade + 0.3) * 1000);
      this.current = null;
    }
    if (id) {
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(1, now + fade);
      gain.connect(this.bus);
      this.current = { id, gain, nextTime: now + 0.08, step: 0 };
    }
    if (!this.timer) this.timer = window.setInterval(() => this.tick(), 25);
  }

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuf) return;
    if (ctx.state !== 'running') return;
    const horizon = ctx.currentTime + 0.12;
    for (const p of [this.current, ...this.fading]) {
      if (!p) continue;
      const track = TRACKS[p.id];
      const stepDur = 60 / track.bpm / 4;
      if (p.nextTime < ctx.currentTime - 0.3) p.nextTime = ctx.currentTime + 0.05;
      const sched = new Scheduler(ctx, p.gain, this.pluckCache, this.noiseBuf);
      while (p.nextTime < horizon) {
        const bar = Math.floor(p.step / 16);
        track.step(sched, bar, p.step % 16, p.nextTime, track.chords[bar % track.chords.length]);
        p.step++;
        p.nextTime += stepDur;
      }
    }
  }
}

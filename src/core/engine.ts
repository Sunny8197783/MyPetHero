import * as THREE from 'three';

/** 엔진이 돌리는 한 화면(낮, 밤, 타이틀, 컷씬 무대). 시뮬레이션 상태는 각 씬이 따로 들고 있다. */
export interface GameScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  /** dt 는 히트스톱·슬로모션이 반영된 게임 시간, realDt 는 실제 프레임 시간(카메라·UI 피드백용). */
  update(dt: number, realDt: number, elapsed: number): void;
  resize?(width: number, height: number): void;
  dispose(): void;
}

export type RenderHook = (scene: THREE.Scene, camera: THREE.PerspectiveCamera, realDt: number) => void;

export interface FrameStats {
  fps: number;
  frameMs: number;
  updateMs: number;
  renderMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

const MAX_DT = 1 / 20;

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly stats: FrameStats = {
    fps: 60,
    frameMs: 16.7,
    updateMs: 0,
    renderMs: 0,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
  };

  /** 슬로모션 등 지속적인 시간 배율. 히트스톱과 곱해진다. */
  timeScale = 1;
  paused = false;
  width = 1;
  height = 1;

  private current: GameScene | null = null;
  private renderHook: RenderHook | null = null;
  private resizeListeners: Array<(w: number, h: number) => void> = [];
  private frameListeners: Array<(realDt: number) => void> = [];
  private last = 0;
  private elapsed = 0;
  private hitstopLeft = 0;
  private hitstopScale = 0.05;
  private pixelRatioCap = 2;
  private running = false;
  private contextLost = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false;

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
    });
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setScene(next: GameScene | null): void {
    const prev = this.current;
    this.current = next;
    if (prev && prev !== next) prev.dispose();
    if (next) {
      next.camera.aspect = this.width / this.height;
      next.camera.updateProjectionMatrix();
      next.resize?.(this.width, this.height);
    }
  }

  get scene(): GameScene | null {
    return this.current;
  }

  /** 후처리 파이프라인이 렌더를 가로챌 때 쓴다. null 이면 기본 렌더. */
  setRenderHook(hook: RenderHook | null): void {
    this.renderHook = hook;
  }

  onResize(listener: (w: number, h: number) => void): void {
    this.resizeListeners.push(listener);
    listener(this.width, this.height);
  }

  onFrame(listener: (realDt: number) => void): void {
    this.frameListeners.push(listener);
  }

  setPixelRatioCap(cap: number): void {
    this.pixelRatioCap = cap;
    this.resize();
  }

  setShadows(enabled: boolean): void {
    if (this.renderer.shadowMap.enabled === enabled) return;
    this.renderer.shadowMap.enabled = enabled;
    this.current?.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) m.needsUpdate = true;
    });
  }

  /** 타격 순간의 짧은 정지. 렌더는 계속 돌고 게임 시간만 느려진다. */
  hitstop(ms: number, scale = 0.05): void {
    this.hitstopLeft = Math.max(this.hitstopLeft, ms / 1000);
    this.hitstopScale = scale;
  }

  get inHitstop(): boolean {
    return this.hitstopLeft > 0;
  }

  resize(): void {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.width = w;
    this.height = h;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.pixelRatioCap));
    this.renderer.setSize(w, h, false);
    if (this.current) {
      this.current.camera.aspect = w / h;
      this.current.camera.updateProjectionMatrix();
      this.current.resize?.(w, h);
    }
    for (const l of this.resizeListeners) l(w, h);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.renderer.setAnimationLoop((now: number) => this.frame(now));
  }

  /** 테스트용 빨리 감기: 렌더 없이 seconds 만큼 시뮬레이션만 돌린다. */
  simulate(seconds: number, step = 1 / 30): void {
    for (let t = 0; t < seconds; t += step) this.tick(step, false);
  }

  /** 캡처용: 자동 루프를 멈추고 dt 만큼 한 프레임만 진행해서 그린다. 다시 돌리려면 start(). */
  step(dt: number): void {
    if (this.running) {
      this.renderer.setAnimationLoop(null);
      this.running = false;
    }
    this.tick(dt);
  }

  private frame(now: number): void {
    const realDt = Math.min(MAX_DT, Math.max(0, (now - this.last) / 1000));
    const rawMs = now - this.last;
    this.last = now;
    this.stats.frameMs += (rawMs - this.stats.frameMs) * 0.05;
    this.stats.fps = 1000 / Math.max(0.001, this.stats.frameMs);
    this.tick(realDt);
  }

  private tick(realDt: number, render = true): void {
    if (this.contextLost) return;
    let scale = this.timeScale;
    if (this.hitstopLeft > 0) {
      this.hitstopLeft -= realDt;
      scale *= this.hitstopScale;
    }
    const dt = this.paused ? 0 : realDt * scale;
    this.elapsed += dt;

    const t0 = performance.now();
    for (const l of this.frameListeners) l(realDt);
    const current = this.current;
    if (current) current.update(dt, realDt, this.elapsed);
    const t1 = performance.now();

    if (current && render) {
      this.renderer.info.reset();
      if (this.renderHook) this.renderHook(current.scene, current.camera, realDt);
      else this.renderer.render(current.scene, current.camera);
      const info = this.renderer.info;
      this.stats.drawCalls = info.render.calls;
      this.stats.triangles = info.render.triangles;
      this.stats.geometries = info.memory.geometries;
      this.stats.textures = info.memory.textures;
    }
    const t2 = performance.now();
    this.stats.updateMs += (t1 - t0 - this.stats.updateMs) * 0.1;
    this.stats.renderMs += (t2 - t1 - this.stats.renderMs) * 0.1;
  }
}

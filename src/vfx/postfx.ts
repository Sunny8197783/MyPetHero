import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import type { Engine } from '../core/engine';
import type { QualityDef } from '../data';
import { damp } from '../core/rng';

/** 화면 톤 한 벌. 씬마다 고르고, 바뀔 때는 부드럽게 넘어간다. */
export interface Look {
  tint: [number, number, number];
  saturation: number;
  contrast: number;
  vignette: number;
  chroma: number;
  bloom: number;
  bloomThreshold: number;
  bloomRadius: number;
  exposure: number;
}

export const LOOKS = {
  day: { tint: [1.06, 1.0, 0.92], saturation: 1.16, contrast: 1.06, vignette: 0.22, chroma: 0, bloom: 0.18, bloomThreshold: 1.0, bloomRadius: 0.5, exposure: 1.0 },
  dusk: { tint: [1.16, 0.9, 0.78], saturation: 1.12, contrast: 1.06, vignette: 0.4, chroma: 0.2, bloom: 0.5, bloomThreshold: 0.85, bloomRadius: 0.6, exposure: 0.95 },
  night: { tint: [0.84, 0.94, 1.2], saturation: 1.12, contrast: 1.1, vignette: 0.55, chroma: 0.3, bloom: 0.55, bloomThreshold: 0.9, bloomRadius: 0.65, exposure: 1.08 },
  boss: { tint: [0.98, 0.84, 1.12], saturation: 1.18, contrast: 1.14, vignette: 0.7, chroma: 0.5, bloom: 0.65, bloomThreshold: 0.86, bloomRadius: 0.7, exposure: 1.08 },
  dawn: { tint: [1.1, 0.96, 0.92], saturation: 1.05, contrast: 1.02, vignette: 0.3, chroma: 0.1, bloom: 0.6, bloomThreshold: 0.8, bloomRadius: 0.7, exposure: 1.1 },
  rain: { tint: [0.82, 0.9, 1.0], saturation: 0.8, contrast: 1.05, vignette: 0.55, chroma: 0.2, bloom: 0.4, bloomThreshold: 0.85, bloomRadius: 0.6, exposure: 0.9 },
} satisfies Record<string, Look>;

export type LookId = keyof typeof LOOKS;

/**
 * HDR 버퍼에서 NaN·Inf 를 걸러 내는 GLSL.
 * 블룸은 흐림 필터라서 NaN 픽셀이 하나만 있어도 주변으로 번져 화면 전체가 검게 된다(실제로 가로등 빛 셰이더의
 * 음수 pow 때문에 일부 GPU 에서 화면이 검게 되는 버그가 있었다). 원인 셰이더를 고치는 것과 별개로, 어떤 머티리얼이
 * 이상한 값을 내더라도 한 픽셀로 끝나도록 블룸 입력과 색보정 입력에서 한 번씩 걸러 낸다.
 * NaN 은 어떤 비교에서도 거짓이므로 "정상 범위 안"인 값만 통과시키면 NaN·Inf·음수가 모두 0 이 된다.
 */
const FINITE_GLSL = /* glsl */ `
  float finite1(float x) { return (x > 0.0 && x < 60000.0) ? x : 0.0; }
  vec3 finite3(vec3 c) { return vec3(finite1(c.r), finite1(c.g), finite1(c.b)); }
`;

/** UnrealBloomPass 의 밝은 영역 추출 셰이더를 대체한다(같은 유니폼, 입력만 걸러 냄). */
const SAFE_HIGH_PASS = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec3 defaultColor;
  uniform float defaultOpacity;
  uniform float luminosityThreshold;
  uniform float smoothWidth;
  varying vec2 vUv;
  ${FINITE_GLSL}
  void main() {
    vec4 texel = texture2D(tDiffuse, vUv);
    texel = vec4(finite3(texel.rgb), finite1(texel.a));
    float v = dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722));
    vec4 outputColor = vec4(defaultColor.rgb, defaultOpacity);
    float alpha = smoothstep(luminosityThreshold, luminosityThreshold + smoothWidth, v);
    gl_FragColor = mix(outputColor, texel, alpha);
  }`;

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uTintB: { value: new THREE.Vector3(1, 1, 1) },
    uSat: { value: 1 },
    uSatB: { value: 1 },
    uContrast: { value: 1 },
    uVignette: { value: 0.3 },
    uChroma: { value: 0 },
    uSplit: { value: 0 },
    uHurt: { value: 0 },
    uAwaken: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uTint; uniform vec3 uTintB;
    uniform float uSat; uniform float uSatB;
    uniform float uContrast; uniform float uVignette; uniform float uChroma;
    uniform float uSplit; uniform float uHurt; uniform float uAwaken;
    varying vec2 vUv;
    ${FINITE_GLSL}
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec3 col;
      if (uChroma > 0.001) {
        vec2 off = c * r2 * uChroma * 0.035;
        col.r = texture2D(tDiffuse, vUv + off).r;
        col.g = texture2D(tDiffuse, vUv).g;
        col.b = texture2D(tDiffuse, vUv - off).b;
      } else {
        col = texture2D(tDiffuse, vUv).rgb;
      }
      col = finite3(col);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float d = (vUv.x - uSplit) + (vUv.y - 0.5) * 0.16;
      float side = uSplit > 0.0 ? smoothstep(-0.003, 0.003, d) : 0.0;
      col = mix(vec3(l), col, mix(uSat, uSatB, side)) * mix(uTint, uTintB, side);
      col = max((col - 0.18) * uContrast + 0.18, 0.0);
      if (uSplit > 0.0) col += vec3(1.0, 0.92, 0.75) * exp(-abs(d) * 320.0) * 1.4;
      float vig = smoothstep(0.12, 0.55, r2);
      col *= 1.0 - vig * uVignette;
      col = mix(col, vec3(0.85, 0.03, 0.05) * (0.35 + l), vig * uHurt);
      col += vec3(0.25, 0.9, 1.0) * vig * uAwaken * 0.5;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class PostFx {
  /** 타이틀 화면의 낮/밤 반반 분할 위치(0이면 끔). */
  split = 0;
  splitLook: Look = LOOKS.night;
  hurt = 0;
  awaken = 0;
  /** 컷씬용 피사계 심도 세기(0이면 끔). 높음 품질에서만 동작. */
  dof = 0;
  dofFocus = 20;

  private readonly engine: Engine;
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private bloom: UnrealBloomPass | null = null;
  private grade: ShaderPass | null = null;
  private bokeh: BokehPass | null = null;
  private quality: QualityDef | null = null;
  private current: Look = { ...LOOKS.day, tint: [...LOOKS.day.tint] as [number, number, number] };
  private target: Look = LOOKS.day;
  private blendSpeed = 4;
  private readonly dummyScene = new THREE.Scene();
  private readonly dummyCamera = new THREE.PerspectiveCamera();

  constructor(engine: Engine) {
    this.engine = engine;
    engine.setRenderHook((scene, camera, realDt) => this.render(scene, camera, realDt));
    engine.onResize((w, h) => {
      if (!this.composer) return;
      this.composer.setPixelRatio(engine.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    });
  }

  setQuality(q: QualityDef): void {
    this.quality = q;
    this.engine.setPixelRatioCap(q.pixelRatio);
    this.engine.setShadows(q.shadows);
    this.composer?.dispose();
    this.composer = null;
    this.bloom = null;
    this.grade = null;
    this.bokeh = null;
    if (!q.composer) return;

    const renderer = this.engine.renderer;
    const size = renderer.getSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.smaa ? 0 : 2 });
    const composer = new EffectComposer(renderer, target);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(size.x, size.y);
    this.renderPass = new RenderPass(this.dummyScene, this.dummyCamera);
    composer.addPass(this.renderPass);
    if (q.dof) {
      this.bokeh = new BokehPass(this.dummyScene, this.dummyCamera, { focus: 20, aperture: 0.0006, maxblur: 0.008 });
      this.bokeh.enabled = false;
      composer.addPass(this.bokeh);
    }
    if (q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.5, 0.6, 0.8);
      const scale = q.bloomScale;
      const setSize = this.bloom.setSize.bind(this.bloom);
      this.bloom.setSize = (w: number, h: number) => setSize(Math.max(2, Math.round(w * scale)), Math.max(2, Math.round(h * scale)));
      this.bloom.materialHighPassFilter.fragmentShader = SAFE_HIGH_PASS;
      this.bloom.materialHighPassFilter.needsUpdate = true;
      composer.addPass(this.bloom);
    }
    this.grade = new ShaderPass(GradeShader);
    composer.addPass(this.grade);
    if (q.smaa) composer.addPass(new SMAAPass());
    composer.addPass(new OutputPass());
    composer.setSize(size.x, size.y);
    this.composer = composer;
  }

  /** 화면 톤을 바꾼다. seconds 동안 부드럽게 넘어간다(0이면 즉시). */
  setLook(id: LookId | Look, seconds = 0.8): void {
    this.target = typeof id === 'string' ? LOOKS[id] : id;
    this.blendSpeed = seconds <= 0 ? 1e6 : 3 / seconds;
    if (seconds <= 0) this.current = { ...this.target, tint: [...this.target.tint] as [number, number, number] };
  }

  private render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, realDt: number): void {
    const c = this.current;
    const t = this.target;
    const k = this.blendSpeed;
    for (let i = 0; i < 3; i++) c.tint[i] = damp(c.tint[i], t.tint[i], k, realDt);
    c.saturation = damp(c.saturation, t.saturation, k, realDt);
    c.contrast = damp(c.contrast, t.contrast, k, realDt);
    c.vignette = damp(c.vignette, t.vignette, k, realDt);
    c.chroma = damp(c.chroma, t.chroma, k, realDt);
    c.bloom = damp(c.bloom, t.bloom, k, realDt);
    c.bloomThreshold = damp(c.bloomThreshold, t.bloomThreshold, k, realDt);
    c.bloomRadius = damp(c.bloomRadius, t.bloomRadius, k, realDt);
    c.exposure = damp(c.exposure, t.exposure, k, realDt);
    const renderer = this.engine.renderer;
    renderer.toneMappingExposure = c.exposure;

    if (!this.composer || !this.renderPass || !this.grade) {
      renderer.render(scene, camera);
      return;
    }
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    if (this.bloom) {
      this.bloom.strength = c.bloom;
      this.bloom.threshold = c.bloomThreshold;
      this.bloom.radius = c.bloomRadius;
    }
    if (this.bokeh) {
      this.bokeh.enabled = this.dof > 0.01;
      if (this.bokeh.enabled) {
        this.bokeh.scene = scene;
        this.bokeh.camera = camera;
        const u = this.bokeh.uniforms as Record<string, THREE.IUniform>;
        u.focus.value = this.dofFocus;
        u.aperture.value = 0.0009 * this.dof;
        u.maxblur.value = 0.009 * this.dof;
      }
    }
    const u = this.grade.uniforms;
    (u.uTint.value as THREE.Vector3).set(c.tint[0], c.tint[1], c.tint[2]);
    u.uSat.value = c.saturation;
    u.uContrast.value = c.contrast;
    u.uVignette.value = c.vignette;
    u.uChroma.value = this.quality?.chromatic ? c.chroma : 0;
    u.uSplit.value = this.split;
    (u.uTintB.value as THREE.Vector3).set(this.splitLook.tint[0], this.splitLook.tint[1], this.splitLook.tint[2]);
    u.uSatB.value = this.splitLook.saturation;
    u.uHurt.value = this.hurt;
    u.uAwaken.value = this.awaken;
    this.composer.render(realDt);
  }
}

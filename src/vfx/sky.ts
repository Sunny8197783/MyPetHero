import * as THREE from 'three';

export interface SkyPreset {
  top: number;
  horizon: number;
  bottom: number;
  stars: number;
  /** 해·달 원반: 색과 밝기, 방향(월드 좌표). */
  disc: number;
  discGlow: number;
  discDir: [number, number, number];
  discSize: number;
  fog: number;
}

export const SKIES = {
  day: { top: 0x74bdf0, horizon: 0xfdecd2, bottom: 0xf3ddba, stars: 0, disc: 0xfff6d8, discGlow: 1.2, discDir: [0.35, 0.8, -0.5], discSize: 0.045, fog: 0xf7e6cc },
  dusk: { top: 0x37336f, horizon: 0xff9558, bottom: 0xe07a4a, stars: 0.25, disc: 0xffb36b, discGlow: 2.0, discDir: [0.75, 0.12, -0.65], discSize: 0.07, fog: 0xd98a5e },
  night: { top: 0x05071a, horizon: 0x1d2759, bottom: 0x0d1230, stars: 1, disc: 0xe9f1ff, discGlow: 1.6, discDir: [-0.45, 0.62, -0.64], discSize: 0.05, fog: 0x121a3d },
  dawn: { top: 0x394a8c, horizon: 0xffc49a, bottom: 0xe7a67c, stars: 0.15, disc: 0xffe2b0, discGlow: 2.2, discDir: [-0.8, 0.1, -0.6], discSize: 0.07, fog: 0xe0a987 },
  rain: { top: 0x3c4658, horizon: 0x7a8798, bottom: 0x5c6878, stars: 0, disc: 0x9aa5b5, discGlow: 0, discDir: [0, 1, 0], discSize: 0.01, fog: 0x6c7888 },
} satisfies Record<string, SkyPreset>;

export type SkyId = keyof typeof SKIES;

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const FRAG = /* glsl */ `
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom;
uniform float uStars; uniform vec3 uDisc; uniform float uDiscGlow; uniform vec3 uDiscDir; uniform float uDiscSize; uniform float uTime;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uHorizon, uBottom, clamp(-h * 3.0, 0.0, 1.0));
  if (uStars > 0.01 && h > 0.02) {
    vec2 uv = d.xz / (0.35 + d.y) * 46.0;
    vec2 cell = floor(uv);
    float r = hash(cell);
    vec2 c = fract(uv) - 0.5 - (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.6;
    float tw = 0.6 + 0.4 * sin(uTime * (1.0 + r * 3.0) + r * 40.0);
    float star = step(0.93, r) * (1.0 - smoothstep(0.0, 0.09, length(c))) * tw;
    col += vec3(0.9, 0.95, 1.0) * star * uStars * 1.8;
  }
  float cd = dot(d, normalize(uDiscDir));
  float disc = smoothstep(1.0 - uDiscSize * 0.02, 1.0 - uDiscSize * 0.014, cd);
  float glow = pow(max(cd, 0.0), 40.0) * 0.5 + pow(max(cd, 0.0), 6.0) * 0.12;
  col += uDisc * (disc * 1.6 + glow * uDiscGlow);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** 그라디언트 하늘 돔. 프리셋 사이를 보간해 시간 흐름(타임랩스)을 만든다. */
export class Sky {
  readonly mesh: THREE.Mesh;
  readonly fogColor = new THREE.Color();
  private readonly mat: THREE.ShaderMaterial;
  private readonly a = new THREE.Color();
  private readonly b = new THREE.Color();

  constructor(preset: SkyId = 'day') {
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uBottom: { value: new THREE.Color() },
        uStars: { value: 0 },
        uDisc: { value: new THREE.Color() },
        uDiscGlow: { value: 1 },
        uDiscDir: { value: new THREE.Vector3(0, 1, 0) },
        uDiscSize: { value: 0.05 },
        uTime: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -100;
    this.mesh.scale.setScalar(300);
    this.set(preset);
  }

  set(id: SkyId): void {
    this.blend(id, id, 0);
  }

  /** from 과 to 사이를 t(0~1)로 보간한다. */
  blend(from: SkyId, to: SkyId, t: number): void {
    const A: SkyPreset = SKIES[from];
    const B: SkyPreset = SKIES[to];
    const u = this.mat.uniforms;
    const mixColor = (target: THREE.Color, x: number, y: number): void => {
      target.copy(this.a.set(x)).lerp(this.b.set(y), t);
    };
    mixColor(u.uTop.value as THREE.Color, A.top, B.top);
    mixColor(u.uHorizon.value as THREE.Color, A.horizon, B.horizon);
    mixColor(u.uBottom.value as THREE.Color, A.bottom, B.bottom);
    mixColor(u.uDisc.value as THREE.Color, A.disc, B.disc);
    mixColor(this.fogColor, A.fog, B.fog);
    u.uStars.value = A.stars + (B.stars - A.stars) * t;
    u.uDiscGlow.value = A.discGlow + (B.discGlow - A.discGlow) * t;
    u.uDiscSize.value = A.discSize + (B.discSize - A.discSize) * t;
    (u.uDiscDir.value as THREE.Vector3)
      .set(
        A.discDir[0] + (B.discDir[0] - A.discDir[0]) * t,
        A.discDir[1] + (B.discDir[1] - A.discDir[1]) * t,
        A.discDir[2] + (B.discDir[2] - A.discDir[2]) * t,
      )
      .normalize();
  }

  update(time: number, camera: THREE.Camera): void {
    this.mat.uniforms.uTime.value = time;
    this.mesh.position.copy(camera.position);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

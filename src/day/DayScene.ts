import * as THREE from 'three';
import { gsap } from 'gsap';
import { audio } from '../audio/audio';
import { assets } from '../core/assets';
import { fxRng } from '../core/rng';
import type { QualityDef } from '../data';
import { ActorHandle, StageBase, type ActorId } from '../story/stage';
import { SPR } from '../vfx/particles';
import type { SkyId } from '../vfx/sky';

/** 배우들이 서는 자리. */
const SPOT = {
  ownerIdle: [-0.6, -0.4],
  dogIdle: [1.4, 0.8],
  bowl: [2.6, -4.3],
  bed: [5.3, 1.6],
  couchOwner: [-3.6, -3.7],
  couchDog: [-2.2, -3.7],
  door: [8.6, 1.2],
  yard: [13, 2],
  gate: [22, 2.5],
  ownerBed: [5.2, -3.6],
} as const;

export const HOUSE_CAM = { pos: [2.5, 12.5, 15.5], look: [1.6, 0.8, -1.2] } as const;
const YARD_CAM = { pos: [13, 11, 15], look: [13, 0.6, 0.5] } as const;

const CLOUD_FRAG = /* glsl */ `
uniform float uTime;
uniform float uAlpha;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec2 p = vUv * 5.0 + vec2(uTime * 0.05, uTime * 0.02);
  float n = noise(p) * 0.6 + noise(p * 2.1) * 0.4;
  float edge = smoothstep(0.0, 0.15, vUv.x) * (1.0 - smoothstep(0.85, 1.0, vUv.x)) * smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y));
  gl_FragColor = vec4(0.05, 0.08, 0.16, smoothstep(0.52, 0.75, n) * 0.28 * uAlpha * edge);
}`;

const SHAFT_FRAG = /* glsl */ `
uniform float uAlpha;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float a = (1.0 - vUv.y) * smoothstep(0.0, 0.2, vUv.x) * (1.0 - smoothstep(0.8, 1.0, vUv.x)) * 0.3 * uAlpha;
  gl_FragColor = vec4(uColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const PLAIN_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/**
 * 낮의 집(거실 + 앞마당) 디오라마. 낮 파트, 타이틀 배경, 집 안 컷씬이 함께 쓴다.
 * 낮 행동은 짧은 연출(GSAP 타임라인)로 보여 준다.
 */
export class DayScene extends StageBase {
  readonly dog: ActorHandle;
  readonly owner: ActorHandle;
  private readonly hemi: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  private readonly lamp: THREE.PointLight;
  private readonly tvLight: THREE.PointLight;
  private readonly windowGlow: THREE.MeshBasicMaterial;
  private readonly shaft: THREE.ShaderMaterial;
  private readonly cloud: THREE.ShaderMaterial;
  private readonly trees: THREE.Object3D[] = [];
  private readonly rope: THREE.Mesh;
  private readonly ball: THREE.Mesh;
  private readonly meteor: THREE.Mesh;
  private readonly disposables: { dispose(): void }[] = [];
  private readonly grassMat: THREE.MeshLambertMaterial;
  private tvOn = false;
  private rain = false;
  private leafAcc = 0;
  private zzz = false;
  private zzzAcc = 0;
  private hearts = false;
  private heartAcc = 0;
  private lightsOn = 1;
  private skyFrom: SkyId = 'day';
  private skyTo: SkyId = 'day';
  private skyT = 0;
  private orbit = 0;
  /** 타이틀 화면처럼 카메라가 천천히 도는 모드. */
  titleMode = false;

  constructor(private readonly quality: QualityDef) {
    super('day');
    const s = this.scene;
    s.fog = new THREE.Fog(this.sky.fogColor.getHex(), 45, 110);

    this.hemi = new THREE.HemisphereLight(0xfff3df, 0xc9b79a, 1.25);
    this.sun = new THREE.DirectionalLight(0xfff0d6, 2.3);
    this.sun.position.set(9, 16, 10);
    if (quality.shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      const c = this.sun.shadow.camera;
      c.left = -22;
      c.right = 26;
      c.top = 18;
      c.bottom = -18;
      c.far = 60;
      this.sun.shadow.bias = -0.0012;
      this.sun.shadow.normalBias = 0.03;
    }
    this.lamp = new THREE.PointLight(0xffc27a, 0, 13, 1.6);
    this.lamp.position.set(-6.2, 3.1, -4.4);
    this.tvLight = new THREE.PointLight(0x8fc7ff, 0, 7, 1.5);
    this.tvLight.position.set(-2.9, 1.3, -0.9);
    s.add(this.hemi, this.sun, this.lamp, this.tvLight);

    // --- 집 구조 (바닥과 벽은 단순 박스) ---
    const mat = (color: number): THREE.MeshLambertMaterial => {
      const m = new THREE.MeshLambertMaterial({ color });
      this.disposables.push(m);
      return m;
    };
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, cast = false): THREE.Mesh => {
      const g = new THREE.BoxGeometry(w, h, d);
      this.disposables.push(g);
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      mesh.castShadow = cast;
      s.add(mesh);
      return mesh;
    };
    const wall = mat(0xf4e4cd);
    const trim = mat(0xcfa27a);
    box(16.4, 0.4, 12.4, mat(0xd8a46c), 0, -0.2, 0);
    box(16.4, 6, 0.4, wall, 0, 3, -6.2, true);
    box(0.4, 6, 12.4, wall, -8.2, 3, 0, true);
    box(16.4, 0.5, 0.5, trim, 0, 0.25, -5.95);
    box(0.5, 0.5, 12.4, trim, -7.95, 0.25, 0);
    // 현관 쪽 낮은 벽과 문틀
    box(0.4, 6, 4.2, wall, 8.2, 3, -4.1, true);
    box(0.4, 1.4, 3.4, wall, 8.2, 5.3, -0.3, true);
    box(0.5, 4.6, 0.4, trim, 8.2, 2.3, -2.1);
    box(0.5, 4.6, 0.4, trim, 8.2, 2.3, 1.5);
    // 창문
    this.windowGlow = new THREE.MeshBasicMaterial({ color: 0xcfeaff });
    box(3.4, 2.4, 0.1, this.windowGlow, 3.6, 3.5, -5.98);
    box(3.8, 0.2, 0.3, trim, 3.6, 4.8, -5.95);
    box(3.8, 0.2, 0.3, trim, 3.6, 2.2, -5.95);
    box(0.16, 2.4, 0.2, trim, 3.6, 3.5, -5.92);
    this.disposables.push(this.windowGlow);
    // 창으로 드는 빛줄기
    this.shaft = new THREE.ShaderMaterial({
      uniforms: { uAlpha: { value: 1 }, uColor: { value: new THREE.Color(1.0, 0.9, 0.7) } },
      vertexShader: PLAIN_VERT,
      fragmentShader: SHAFT_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const shaftGeo = new THREE.PlaneGeometry(3.4, 7);
    const shaft = new THREE.Mesh(shaftGeo, this.shaft);
    shaft.position.set(3.6, 1.9, -3.4);
    shaft.rotation.x = -0.95;
    s.add(shaft);
    this.disposables.push(shaftGeo, this.shaft);

    // --- 가구 (KayKit Furniture Bits) ---
    const put = (name: string, x: number, z: number, ry = 0, scale = 1, y = 0): THREE.Object3D => {
      const m = assets.model('kaykit-furniture', name);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.scale.setScalar(scale);
      s.add(m);
      return m;
    };
    put('rug_rectangle_stripes_A', -2.8, -1.4, 0, 1.5);
    put('couch_pillows', -2.9, -4.4, 0, 1.25);
    put('table_low', -2.9, -1.5, 0, 0.9);
    put('cabinet_small', -2.9, 0.9, Math.PI, 1.1); // TV 받침
    put('lamp_standing', -6.4, -4.6, 0.6, 1.2);
    put('shelf_B_large_decorated', -4.6, -5.8, 0, 1.2, 3.4);
    put('pictureframe_large_A', 0.2, -5.9, 0, 1.3, 3.2);
    put('pictureframe_small_A', -1.4, -5.9, 0, 1.3, 3.8);
    put('cabinet_medium_decorated', 1.1, -5.1, 0, 1.15);
    put('bed_single_A', 5.6, -3.9, 0, 1.25);
    put('rug_oval_B', 5.2, 1.6, 0.3, 0.95);
    put('pillow_A', SPOT.bed[0], SPOT.bed[1], 0.4, 2.6, 0.05);
    put('cactus_medium_A', 7.2, -5.2, 0, 1.2);
    put('chair_stool', 1.0, 3.2, 0.4, 1.1);
    put('book_set', -2.5, -1.5, 0.5, 1.2, 0.72);
    put('cactus_small_A', -7.2, 4.6, 0, 1.3);
    // TV: 받침 위의 얇은 판(뒷면)이 보이고, 화면 빛은 포인트 라이트로 표현
    box(2.0, 1.25, 0.14, mat(0x2b2f3a), -2.9, 1.75, 0.95, true);
    // 밥그릇
    const bowlGeo = new THREE.CylinderGeometry(0.42, 0.32, 0.22, 14);
    const bowl = new THREE.Mesh(bowlGeo, mat(0xe2574c));
    bowl.position.set(SPOT.bowl[0] + 0.7, 0.11, SPOT.bowl[1] - 0.6);
    s.add(bowl);
    this.disposables.push(bowlGeo);

    // --- 앞마당 ---
    this.grassMat = new THREE.MeshLambertMaterial({ color: 0xa9cf8c });
    const grassGeo = new THREE.PlaneGeometry(260, 260);
    grassGeo.rotateX(-Math.PI / 2);
    const grass = new THREE.Mesh(grassGeo, this.grassMat);
    grass.position.y = -0.42;
    grass.receiveShadow = true;
    s.add(grass);
    const lawn = box(30, 0.4, 22, this.grassMat, 23.4, -0.2, 0);
    lawn.receiveShadow = true;
    this.disposables.push(grassGeo, this.grassMat);
    const yard = (name: string, x: number, z: number, ry = 0, scale = 1): THREE.Object3D => {
      const m = assets.model('kaykit-halloween', name);
      m.position.set(x, 0, z);
      m.rotation.y = ry;
      m.scale.setScalar(scale);
      s.add(m);
      return m;
    };
    for (let k = 0; k < 6; k++) yard('fence', 10.4 + k * 4, -7.4);
    for (let k = 0; k < 4; k++) yard('fence', 32.3, -5.4 + k * 4, Math.PI / 2);
    yard('fence_gate', 32.3, 10.5, Math.PI / 2);
    this.trees.push(yard('tree_pine_orange_large', 12.5, -9.6, 0.4), yard('tree_pine_yellow_medium', 19, -9.2, 2), yard('tree_pine_orange_medium', 26, -9.8, 1), yard('tree_pine_yellow_small', 17.5, 6.5, 0.7, 1.2));
    yard('pumpkin_orange', 9.6, -1.4, 0.5);
    yard('pumpkin_orange_small', 10.3, -0.7, 1.4);
    yard('pumpkin_yellow_jackolantern', 9.8, 3.6, -0.5, 0.9);
    yard('bench', 20.5, -5.6, 0, 1.2);
    yard('post_lantern', 9.4, -3.2, 0, 1.1);
    for (let k = 0; k < 5; k++) yard('path_A', 10.8 + k * 2.6, 1.4 + (k % 2) * 0.5, k * 1.3, 1.1);

    // 구름 그림자
    this.cloud = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 1 } },
      vertexShader: PLAIN_VERT,
      fragmentShader: CLOUD_FRAG,
      transparent: true,
      depthWrite: false,
    });
    const cloudGeo = new THREE.PlaneGeometry(60, 44);
    cloudGeo.rotateX(-Math.PI / 2);
    const cloud = new THREE.Mesh(cloudGeo, this.cloud);
    cloud.position.set(22, 0.06, 0);
    cloud.renderOrder = 3;
    s.add(cloud);
    this.disposables.push(cloudGeo, this.cloud);

    // --- 소품: 터그 밧줄, 공, 운석 ---
    const ropeGeo = new THREE.CylinderGeometry(0.07, 0.07, 1, 6);
    ropeGeo.rotateZ(Math.PI / 2);
    this.rope = new THREE.Mesh(ropeGeo, mat(0xd9483b));
    this.rope.visible = false;
    const ballGeo = new THREE.IcosahedronGeometry(0.26, 1);
    this.ball = new THREE.Mesh(ballGeo, mat(0xc7f464));
    this.ball.visible = false;
    const meteorGeo = new THREE.IcosahedronGeometry(0.22, 0);
    this.meteor = new THREE.Mesh(meteorGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7df9ff).multiplyScalar(3) }));
    this.meteor.visible = false;
    s.add(this.rope, this.ball, this.meteor);
    this.disposables.push(ropeGeo, ballGeo, meteorGeo, this.meteor.material as THREE.Material);

    // --- 배우 ---
    this.owner = this.addActor('owner', ActorHandle.human('owner'), SPOT.ownerIdle[0], SPOT.ownerIdle[1], 0.5);
    this.dog = this.addActor('dog', ActorHandle.dog('dog'), SPOT.dogIdle[0], SPOT.dogIdle[1], -0.8);
    this.dog.dog!.setEyeColor(0x7df9ff);
    this.particles.scale = quality.particleScale;
    this.setCam([...HOUSE_CAM.pos], [...HOUSE_CAM.look], 38);
    this.setHour(8);
  }

  /** 방문객·고양이 등 필요할 때만 만드는 배우. */
  ensureActor(id: ActorId): ActorHandle {
    const existing = this.actor(id);
    if (existing) return existing;
    if (id === 'cat') return this.addActor('cat', ActorHandle.dog('cat'), 14, -7.2, 0);
    if (id === 'friend') return this.addActor('friend', ActorHandle.human('friend'), 24, 2, -Math.PI / 2);
    if (id === 'delivery') return this.addActor('delivery', ActorHandle.human('delivery'), 24, 2, -Math.PI / 2);
    throw new Error(`집 무대에는 ${id} 배우가 없습니다`);
  }

  removeActor(id: ActorId): void {
    const a = this.actor(id);
    if (!a || id === 'dog' || id === 'owner') return;
    this.scene.remove(a.root);
    a.dispose();
    this.actors.delete(id);
  }

  /** 시간대(8~22시)에 맞춰 조명과 하늘을 바꾼다. */
  setHour(h: number): void {
    const dusk = Math.min(1, Math.max(0, (h - 16.5) / 3));
    const night = Math.min(1, Math.max(0, (h - 19.5) / 2.5));
    if (night > 0) this.setSky('dusk', 'night', night);
    else this.setSky('day', 'dusk', dusk);
    this.lightsOn = h >= 18.5 ? 1 : 0;
  }

  setSky(from: SkyId, to: SkyId, t: number): void {
    this.skyFrom = from;
    this.skyTo = to;
    this.skyT = t;
  }

  private applyLighting(): void {
    this.sky.blend(this.skyFrom, this.skyTo, this.skyT);
    (this.scene.fog as THREE.Fog).color.copy(this.sky.fogColor);
    // 하늘 프리셋의 "밝기"로 실내외 조명을 맞춘다.
    const bright = (id: SkyId): number => (id === 'day' ? 1 : id === 'dusk' ? 0.62 : id === 'dawn' ? 0.7 : id === 'rain' ? 0.5 : 0.14);
    const warm = (id: SkyId): number => (id === 'dusk' || id === 'dawn' ? 1 : 0);
    const b = bright(this.skyFrom) + (bright(this.skyTo) - bright(this.skyFrom)) * this.skyT;
    const w = warm(this.skyFrom) + (warm(this.skyTo) - warm(this.skyFrom)) * this.skyT;
    this.sun.intensity = 0.2 + 1.75 * b;
    this.sun.color.setRGB(1, 0.94 - 0.28 * w, 0.84 - 0.46 * w);
    if (b < 0.3) this.sun.color.setRGB(0.6, 0.72, 1.0);
    this.hemi.intensity = 0.28 + 0.62 * b;
    this.hemi.color.setRGB(0.55 + 0.45 * b, 0.6 + 0.35 * b, 0.9 - 0.02 * b);
    this.windowGlow.color.copy(this.sky.fogColor).multiplyScalar(0.35 + b * 0.75);
    this.shaft.uniforms.uAlpha.value = Math.max(0, b - 0.25) * 1.3;
    this.cloud.uniforms.uAlpha.value = Math.max(0, b - 0.3);
    this.grassMat.color.setRGB(0.66, 0.81, 0.55);
    this.lamp.intensity = this.lightsOn * (1 - b * 0.8) * 34;
  }

  effect(kind: string, value = 1): void {
    const dog = this.dog.dog!;
    switch (kind) {
      case 'lightsOff':
        this.lightsOn = 0;
        audio.ui('toggle');
        break;
      case 'lightsOn':
        this.lightsOn = 1;
        audio.ui('toggle');
        break;
      case 'tvOn':
        this.tvOn = true;
        break;
      case 'tvOff':
        this.tvOn = false;
        this.tvLight.intensity = 0;
        break;
      case 'rain':
        this.rain = value > 0;
        audio.setRain(this.rain);
        break;
      case 'glowEyes':
        dog.eyeTarget = value;
        break;
      case 'aura':
        dog.shading.rimStrength.value = value * 2.2;
        if (value > 0) {
          const p = this.dog.root.position;
          this.particles.burst(p.x, 0.8, p.z, 30, 6, 1.0, 0.5, 0x7df9ff, 2.2, SPR.star, 1, -2, 1.5, 1.2);
        }
        break;
      case 'hearts':
        this.hearts = value > 0;
        break;
      case 'zzz':
        this.zzz = value > 0;
        break;
      case 'bang': {
        const p = this.owner.root.position;
        this.particles.emit(p.x, 3.4, p.z, 0, 1.2, 0, 0.9, 1.3, 1.6, 0xffd23f, 1.6, 1, SPR.bang, 0);
        audio.synth('pop', { volume: 0.7 });
        break;
      }
      case 'dogBang': {
        const p = this.dog.root.position;
        this.particles.emit(p.x, 2.2, p.z, 0, 1.2, 0, 0.9, 1.1, 1.4, 0xff5a5a, 1.6, 1, SPR.bang, 0);
        audio.synth('pop', { volume: 0.7, rate: 1.3 });
        break;
      }
      case 'meteor': {
        // 창밖에서 날아든 운석 조각이 개 앞에 떨어진다.
        const p = this.dog.root.position;
        this.meteor.visible = true;
        this.meteor.position.set(p.x + 5, 9, p.z - 6);
        gsap.to(this.meteor.position, {
          x: p.x + 0.6, y: 0.25, z: p.z + 0.3, duration: 0.9, ease: 'power2.in',
          onUpdate: () => {
            const m = this.meteor.position;
            this.particles.emit(m.x, m.y, m.z, 0, 0.5, 0, 0.5, 0.5, 0, 0x7df9ff, 2.6, 1, SPR.soft, 1);
          },
          onComplete: () => {
            const m = this.meteor.position;
            this.particles.burst(m.x, m.y, m.z, 24, 6, 0.8, 0.5, 0x7df9ff, 2.6, SPR.star, 1, 6, 1.5);
            this.cam.shake = 0.5;
            audio.synth('boom', { volume: 0.6, rate: 1.4 });
          },
        });
        break;
      }
      case 'meteorEat':
        this.meteor.visible = false;
        audio.synth('pop', { volume: 0.8, rate: 0.7 });
        break;
      case 'dust': {
        const p = this.dog.root.position;
        this.particles.burst(p.x, 0.2, p.z, 10, 3, 0.7, 0.9, 0xd9c7a8, 0.8, SPR.smoke, 0, 0, 2, 0.4);
        break;
      }
      case 'stars': {
        const p = this.dog.root.position;
        this.particles.burst(p.x, 1.2, p.z, 14, 5, 0.8, 0.45, 0xffe08a, 1.8, SPR.star, 1, -2, 1.5, 1.2);
        break;
      }
      case 'shake':
        this.cam.shake = value;
        break;
      default:
        break;
    }
  }

  // ---------- 낮 행동 연출 ----------

  private timeline(): gsap.core.Timeline {
    return gsap.timeline({ paused: true });
  }

  private run(tl: gsap.core.Timeline): Promise<void> {
    return new Promise((resolve) => {
      tl.eventCallback('onComplete', () => resolve());
      tl.play();
    });
  }

  /** 행동이 끝난 뒤 제자리로. */
  private settle(tl: gsap.core.Timeline): void {
    this.walk(tl, 'owner', SPOT.ownerIdle[0], SPOT.ownerIdle[1], 0.8);
    this.walk(tl, 'dog', SPOT.dogIdle[0], SPOT.dogIdle[1], 0.7, true, '<');
    this.camTo(tl, [...HOUSE_CAM.pos], [...HOUSE_CAM.look], 0.9, 'power2.inOut', '<');
    tl.call(() => {
      this.owner.root.rotation.y = 0.5;
      this.dog.root.rotation.y = -0.8;
      this.owner.anim('Idle');
    });
  }

  /** 낮 행동 하나를 연출로 보여 준다. */
  async playAction(id: string): Promise<void> {
    const tl = this.timeline();
    const o = this.owner;
    const d = this.dog;
    const dogRoot = d.root;
    switch (id) {
      case 'walk':
        this.walk(tl, 'owner', SPOT.door[0], SPOT.door[1], 1.0);
        this.walk(tl, 'dog', SPOT.door[0] + 1.5, SPOT.door[1] + 0.6, 0.9, true, '<');
        this.camTo(tl, [...YARD_CAM.pos], [...YARD_CAM.look], 1.6, 'power2.inOut', '<');
        this.walk(tl, 'owner', SPOT.gate[0], SPOT.gate[1], 2.2);
        this.walk(tl, 'dog', SPOT.gate[0] + 1.6, SPOT.gate[1] - 0.8, 2.2, false, '<');
        tl.call(() => audio.file('step', { volume: 0.5 }), undefined, '<0.2');
        tl.to({}, { duration: 0.3 });
        this.walk(tl, 'owner', SPOT.door[0], SPOT.door[1], 1.6);
        this.walk(tl, 'dog', SPOT.door[0] + 1.2, SPOT.door[1] + 0.5, 1.5, false, '<');
        break;
      case 'meal':
        this.walk(tl, 'owner', SPOT.bowl[0] - 0.4, SPOT.bowl[1] + 1.4, 0.9);
        tl.call(() => {
          o.face(SPOT.bowl[0] + 0.7, SPOT.bowl[1] - 0.6);
          o.anim('PickUp', true);
          audio.file('coin', { volume: 0.4, rate: 0.7 });
        });
        this.walk(tl, 'dog', SPOT.bowl[0] + 0.1, SPOT.bowl[1] + 0.4, 0.7, true, '<0.3');
        tl.call(() => d.face(SPOT.bowl[0] + 0.7, SPOT.bowl[1] - 0.6));
        tl.to(dogRoot.scale, { y: 0.86, duration: 0.14, yoyo: true, repeat: 9, ease: 'sine.inOut' });
        tl.call(
          () => {
            for (let k = 0; k < 5; k++) {
              gsap.delayedCall(k * 0.28, () => {
                this.particles.burst(SPOT.bowl[0] + 0.7, 0.35, SPOT.bowl[1] - 0.6, 4, 2.5, 0.5, 0.16, 0xc98a4a, 1, SPR.square, 0, 9, 1);
                audio.file('click3', { volume: 0.35 });
              });
            }
          },
          undefined,
          '<',
        );
        break;
      case 'tug':
        this.walk(tl, 'owner', -1.2, 1.4, 0.7);
        this.walk(tl, 'dog', 1.6, 1.4, 0.6, true, '<');
        tl.call(() => {
          o.face(5, 1.4);
          d.face(-5, 1.4);
          this.rope.visible = true;
          this.rope.position.set(0.25, 0.75, 1.4);
          this.rope.scale.set(1.7, 1, 1);
        });
        tl.to(this.rope.position, { x: 0.55, duration: 0.22, yoyo: true, repeat: 9, ease: 'sine.inOut' });
        tl.to(dogRoot.position, { x: 1.95, duration: 0.22, yoyo: true, repeat: 9, ease: 'sine.inOut' }, '<');
        tl.to(o.root.position, { x: -0.9, duration: 0.22, yoyo: true, repeat: 9, ease: 'sine.inOut' }, '<');
        tl.call(() => this.particles.burst(0.3, 0.2, 1.4, 6, 2, 0.6, 0.7, 0xd9c7a8, 0.7, SPR.smoke, 0), undefined, '<0.6');
        tl.call(() => {
          this.rope.visible = false;
          o.anim('Hit_A', true);
          this.effect('stars');
          audio.synth('pop', { volume: 0.6 });
        });
        tl.to({}, { duration: 0.6 });
        break;
      case 'fetch':
      case 'run': {
        this.walk(tl, 'owner', SPOT.door[0] + 1.4, SPOT.door[1], 1.0);
        this.walk(tl, 'dog', SPOT.door[0] + 3, SPOT.door[1] + 1, 0.9, true, '<');
        this.camTo(tl, [...YARD_CAM.pos], [...YARD_CAM.look], 1.4, 'power2.inOut', '<');
        if (id === 'fetch') {
          tl.call(() => {
            o.face(30, 2);
            o.anim('Throw', true);
            this.ball.visible = true;
            this.ball.position.set(SPOT.door[0] + 1.8, 1.6, SPOT.door[1]);
            audio.synth('whoosh', { volume: 0.4, rate: 1.4 });
          });
          tl.to(this.ball.position, { x: 21, z: 3, duration: 0.9, ease: 'none' }, '+=0.35');
          tl.to(this.ball.position, { y: 4.2, duration: 0.45, ease: 'power2.out' }, '<');
          tl.to(this.ball.position, { y: 0.26, duration: 0.45, ease: 'bounce.out' }, '>');
          this.walk(tl, 'dog', 20.4, 3, 0.8, true, '<-0.5');
          tl.call(() => {
            this.ball.visible = false;
            audio.synth('squeak', { volume: 0.6 });
          });
          this.walk(tl, 'dog', SPOT.door[0] + 2.6, SPOT.door[1] + 0.4, 0.9, true);
          tl.call(() => {
            o.anim('Cheer', true);
            this.effect('stars');
          });
          tl.to({}, { duration: 0.7 });
        } else {
          tl.call(() => o.anim('Cheer', true));
          const pts: [number, number][] = [[18, -3], [25, 0], [19, 5], [13, 2], [20, -2], [26, 4], [14, 3]];
          pts.forEach(([x, z]) => {
            this.walk(tl, 'dog', x, z, 0.42, true);
            tl.call(() => this.effect('dust'), undefined, '<');
          });
          tl.call(() => audio.synth('bark', { volume: 0.5 }));
        }
        break;
      }
      case 'train':
        this.walk(tl, 'owner', 0, 1.6, 0.6);
        this.walk(tl, 'dog', 2.2, 1.9, 0.5, true, '<');
        tl.call(() => {
          o.face(2.2, 1.9);
          d.face(0, 1.6);
          o.anim('Interact', true);
        });
        // "앉아": 엉덩이를 낮추고 상체를 든다.
        tl.to(d.dog!.body.rotation, { x: -0.5, duration: 0.3, ease: 'back.out(2)' }, '+=0.3');
        tl.to(d.dog!.body.position, { y: -0.18, duration: 0.3 }, '<');
        tl.call(() => {
          this.effect('stars');
          audio.synth('chime', { volume: 0.4 });
        });
        tl.to({}, { duration: 1.3 });
        tl.to(d.dog!.body.rotation, { x: 0, duration: 0.25 });
        tl.to(d.dog!.body.position, { y: 0, duration: 0.25 }, '<');
        tl.call(() => o.anim('Cheer', true));
        tl.to({}, { duration: 0.6 });
        break;
      case 'nap':
        this.walk(tl, 'dog', SPOT.bed[0], SPOT.bed[1], 0.8);
        tl.call(() => {
          dogRoot.rotation.y = 2.2;
          this.zzz = true;
          audio.synth('snore', { volume: 0.5 });
        });
        tl.to(d.dog!.body.rotation, { z: 1.35, duration: 0.5, ease: 'power2.out' });
        tl.to(d.dog!.body.position, { y: 0.32, duration: 0.5 }, '<');
        tl.to(this, { skyT: Math.min(1, this.skyT + 0.12), duration: 2.0, ease: 'none' });
        tl.call(() => audio.synth('snore', { volume: 0.5 }), undefined, '<1');
        tl.call(() => (this.zzz = false));
        tl.to(d.dog!.body.rotation, { z: 0, duration: 0.3 });
        tl.to(d.dog!.body.position, { y: 0, duration: 0.3 }, '<');
        break;
      case 'pet':
        this.walk(tl, 'owner', SPOT.dogIdle[0] - 1.3, SPOT.dogIdle[1] + 0.2, 0.7);
        tl.call(() => {
          o.face(SPOT.dogIdle[0], SPOT.dogIdle[1]);
          d.face(o.root.position.x, o.root.position.z);
          o.anim('Interact');
          this.hearts = true;
        });
        tl.to(dogRoot.position, { y: 0.25, duration: 0.18, yoyo: true, repeat: 7, ease: 'sine.out' });
        tl.call(() => {
          this.hearts = false;
          o.anim('Idle');
        });
        break;
      case 'tv':
        this.walk(tl, 'owner', SPOT.couchOwner[0], SPOT.couchOwner[1] + 1.0, 1.0);
        this.walk(tl, 'dog', SPOT.couchDog[0], SPOT.couchDog[1] + 1.1, 0.9, true, '<');
        tl.call(() => {
          o.root.position.set(SPOT.couchOwner[0], 0.42, SPOT.couchOwner[1]);
          o.root.rotation.y = 0;
          o.anim('Sit_Chair_Idle');
          dogRoot.rotation.y = 0.2;
          this.tvOn = true;
          audio.ui('toggle');
        });
        tl.to(dogRoot.position, { x: SPOT.couchDog[0], z: SPOT.couchDog[1], duration: 0.3 });
        tl.to(dogRoot.position, { y: 1.0, duration: 0.3, ease: 'power2.out' }, '<');
        this.camTo(tl, [-2.4, 5.2, 6.4], [-2.8, 1.4, -3.4], 1.0, 'power2.inOut', '<');
        tl.to({}, { duration: 2.0 });
        tl.call(() => {
          this.tvOn = false;
          this.tvLight.intensity = 0;
          o.root.position.y = 0;
          o.anim('Idle');
        });
        tl.to(dogRoot.position, { y: 0, z: SPOT.couchDog[1] + 1.2, duration: 0.3 });
        break;
      default:
        tl.to({}, { duration: 0.6 });
        break;
    }
    this.settle(tl);
    await this.run(tl);
  }

  /** 방문객이 대문에서 현관까지 걸어온다. */
  async visitorEnter(id: ActorId): Promise<void> {
    const a = this.ensureActor(id);
    const tl = this.timeline();
    if (id === 'cat') {
      a.root.position.set(14, 1.75, -7.4);
      a.root.rotation.y = 0;
      a.root.scale.setScalar(0.01);
      tl.to(a.root.scale, { x: 1, y: 1, z: 1, duration: 0.4, ease: 'back.out(2)' });
      tl.call(() => audio.synth('meow', { volume: 0.6 }));
      this.camTo(tl, [13, 7, 9], [13.5, 1.6, -5], 1.0, 'power2.inOut', '<');
    } else {
      a.root.position.set(24, 0, 2);
      this.walk(tl, id, SPOT.door[0] + 1.8, SPOT.door[1], 1.6);
      this.camTo(tl, [8, 9, 13], [7.5, 1, 0.5], 1.4, 'power2.inOut', '<');
      this.walk(tl, 'owner', SPOT.door[0] - 1.6, SPOT.door[1], 1.0, false, '<0.3');
      this.walk(tl, 'dog', SPOT.door[0] - 0.6, SPOT.door[1] + 1.6, 0.8, true, '<');
      tl.call(() => {
        a.face(0, SPOT.door[1]);
        this.owner.face(20, SPOT.door[1]);
        this.dog.face(20, SPOT.door[1]);
        audio.file('click2', { volume: 0.6 });
      });
    }
    await this.run(tl);
  }

  async visitorLeave(id: ActorId): Promise<void> {
    const a = this.actor(id);
    const tl = this.timeline();
    if (a && id === 'cat') tl.to(a.root.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.3 });
    else if (a) this.walk(tl, id, 25, 3, 1.4);
    this.settle(tl);
    await this.run(tl);
    this.removeActor(id);
  }

  update(dt: number, realDt: number): void {
    this.applyLighting();
    this.cloud.uniforms.uTime.value = this.time;
    this.trees.forEach((t, k) => {
      t.rotation.z = Math.sin(this.time * 1.1 + k * 1.7) * 0.022;
      t.rotation.x = Math.cos(this.time * 0.8 + k) * 0.015;
    });
    if (this.tvOn) {
      this.tvLight.intensity = 9 + Math.sin(this.time * 11) * 3 + Math.sin(this.time * 27) * 2;
      this.tvLight.color.setHSL(0.55 + 0.1 * Math.sin(this.time * 1.7), 0.7, 0.6);
    }
    // 마당의 낙엽
    this.leafAcc += dt * (this.quality.leaves / 12);
    while (this.leafAcc >= 1) {
      this.leafAcc -= 1;
      this.particles.emit(
        fxRng.range(9, 32), fxRng.range(5, 8), fxRng.range(-9, 8), fxRng.range(-1.6, -0.4), fxRng.range(-1.4, -0.7), fxRng.range(-0.3, 0.6),
        6, 0.34, 0.3, fxRng.chance(0.5) ? 0xe8843a : 0xe2b33c, 1, 0.9, SPR.leaf, 0, 0, 0, fxRng.range(0, 6), fxRng.range(-3, 3),
      );
    }
    if (this.rain) {
      for (let k = 0; k < 6; k++) {
        this.particles.emit(fxRng.range(-10, 30), 11, fxRng.range(-9, 12), -1.5, -26, 0, 0.45, 0.5, 0.5, 0xbfd6ff, 1.2, 0.5, SPR.spark, 0, 0, 0, Math.PI / 2 - 0.06);
      }
    }
    if (this.zzz) {
      this.zzzAcc += dt;
      if (this.zzzAcc > 0.55) {
        this.zzzAcc = 0;
        const p = this.dog.root.position;
        this.particles.emit(p.x + 0.5, 1.3, p.z, 0.4, 0.9, 0, 1.6, 0.4, 0.9, 0xbfe0ff, 1.2, 0.9, SPR.zzz, 0);
      }
    }
    if (this.hearts) {
      this.heartAcc += dt;
      if (this.heartAcc > 0.22) {
        this.heartAcc = 0;
        const p = this.dog.root.position;
        this.particles.emit(p.x + fxRng.range(-0.5, 0.5), 1.5, p.z, fxRng.range(-0.3, 0.3), 1.4, 0, 1.1, 0.5, 0.2, 0xff7a9e, 1.3, 1, SPR.heart, 0);
        if (fxRng.chance(0.4)) audio.synth('heart', { volume: 0.3 });
      }
    }
    if (this.titleMode) {
      this.orbit += realDt * 0.12;
      this.cam.pos.set(8 + Math.sin(this.orbit) * 5, 10.5 + Math.sin(this.orbit * 0.7) * 0.8, 17 + Math.cos(this.orbit) * 2);
      this.cam.look.set(5, 1, -1);
    }
    this.baseUpdate(dt, realDt);
  }

  override dispose(): void {
    gsap.killTweensOf(this.rope.position);
    gsap.killTweensOf(this.ball.position);
    gsap.killTweensOf(this.meteor.position);
    gsap.killTweensOf(this);
    audio.setRain(false);
    super.dispose();
    for (const d of this.disposables) d.dispose();
  }
}

export const DAY_ASSETS = { kits: ['kaykit-furniture', 'kaykit-halloween'] as const };

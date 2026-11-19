import * as THREE from 'three';
import { assets } from './assets';
import { patchCharacterMaterial, type CharacterShading } from '../night/vat';

export const FOX_FILE = 'khronos-fox/Fox.glb';
export const HUMAN_FILES = {
  owner: 'kaykit-adventurers/Mage.glb',
  friend: 'kaykit-adventurers/Rogue.glb',
  delivery: 'kaykit-adventurers/Barbarian.glb',
  neighbor: 'kaykit-adventurers/Knight.glb',
  skelMinion: 'kaykit-skeletons/Skeleton_Minion.glb',
  skelRogue: 'kaykit-skeletons/Skeleton_Rogue.glb',
  skelWarrior: 'kaykit-skeletons/Skeleton_Warrior.glb',
} as const;
export type HumanRole = keyof typeof HUMAN_FILES;

const ACCESSORY = /Hat|Cape|Staff|Wand|Spellbook|Axe|Shield|Sword|Mug|Knife|Crossbow|Throwable|Helmet|Cloak|Hood$/;

let blobTex: THREE.Texture | null = null;
/** 캐릭터 발밑의 동그란 그림자 텍스처. */
export function blobShadowTexture(): THREE.Texture {
  if (!blobTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    blobTex = new THREE.CanvasTexture(c);
  }
  return blobTex;
}

function makeBlob(size: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(size, size);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ map: blobShadowTexture(), color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false }),
  );
  mesh.position.y = 0.04;
  mesh.renderOrder = 2;
  return mesh;
}

let catTexture: THREE.Texture | null = null;
/** 여우 텍스처의 주황색을 회색으로 바꿔 고양이 색을 만든다. */
function grayFoxTexture(src: THREE.Texture): THREE.Texture {
  if (catTexture) return catTexture;
  const img = src.image as CanvasImageSource & { width: number; height: number };
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const gr = d[i + 1];
    const b = d[i + 2];
    const lum = 0.3 * r + 0.59 * gr + 0.11 * b;
    const sat = Math.max(r, gr, b) - Math.min(r, gr, b);
    // 채도가 높은(주황) 부분만 푸른 회색으로, 흰 털과 검은 발은 그대로 둔다.
    const k = Math.min(1, sat / 90);
    d[i] = r + (lum * 0.62 - r) * k;
    d[i + 1] = gr + (lum * 0.68 - gr) * k;
    d[i + 2] = b + (lum * 0.86 + 18 - b) * k;
  }
  g.putImageData(data, 0, 0);
  catTexture = new THREE.CanvasTexture(c);
  catTexture.flipY = false;
  catTexture.colorSpace = THREE.SRGBColorSpace;
  return catTexture;
}

/** 주인공 개(와 고양이). Fox 모델에 걷기·달리기 블렌딩, 눈빛, 림라이트를 붙였다. */
export class Dog {
  readonly root = new THREE.Group();
  readonly body: THREE.Object3D;
  readonly shading: CharacterShading;
  readonly eyes: THREE.Mesh[] = [];
  readonly blob: THREE.Mesh;
  private readonly mixer: THREE.AnimationMixer;
  private readonly idle: THREE.AnimationAction;
  private readonly walk: THREE.AnimationAction;
  private readonly run: THREE.AnimationAction;
  private gait = 0;
  private eyeGlow = 0;
  /** 눈이 빛나는 정도(0~1). */
  eyeTarget = 0;

  constructor(variant: 'dog' | 'cat' = 'dog') {
    const { root, clips } = assets.skinned(FOX_FILE);
    this.body = root;
    const scale = variant === 'cat' ? 0.0105 : 0.0165;
    root.scale.setScalar(scale);
    this.root.add(root);
    const mats: THREE.MeshStandardMaterial[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      const src = mesh.material as THREE.MeshStandardMaterial;
      const mat = src.clone();
      mat.roughness = 0.9;
      mat.metalness = 0;
      if (variant === 'cat' && src.map) mat.map = grayFoxTexture(src.map);
      mesh.material = mat;
      mats.push(mat);
    });
    this.shading = patchCharacterMaterial(mats[0], variant === 'cat' ? 0xb48cff : 0x7df9ff, 0);

    this.mixer = new THREE.AnimationMixer(root);
    this.idle = this.mixer.clipAction(clips.get('Survey')!);
    this.walk = this.mixer.clipAction(clips.get('Walk')!);
    this.run = this.mixer.clipAction(clips.get('Run')!);
    for (const a of [this.idle, this.walk, this.run]) a.play();
    this.walk.setEffectiveWeight(0);
    this.run.setEffectiveWeight(0);

    // 눈빛: 머리 본에 붙인 작은 발광 구
    const head = root.getObjectByName('b_Head_05');
    if (head) {
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x7df9ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(3.4, 8, 6), eyeMat);
        eye.position.set(side * 7.5, 10, 14);
        head.add(eye);
        this.eyes.push(eye);
      }
    }
    this.blob = makeBlob(variant === 'cat' ? 1.5 : 2.2);
    this.root.add(this.blob);
  }

  /** 걸음새: 0 정지, 0.5 걷기, 1 달리기. */
  setGait(target: number, dt: number): void {
    this.gait += (target - this.gait) * Math.min(1, dt * 10);
    const g = this.gait;
    const walkW = g < 0.5 ? g * 2 : (1 - g) * 2;
    const runW = g < 0.5 ? 0 : (g - 0.5) * 2;
    this.idle.setEffectiveWeight(Math.max(0, 1 - g * 2));
    this.walk.setEffectiveWeight(walkW);
    this.run.setEffectiveWeight(runW);
  }

  setEyeColor(color: number): void {
    for (const e of this.eyes) (e.material as THREE.MeshBasicMaterial).color.set(color).multiplyScalar(2.5);
  }

  update(dt: number, animSpeed = 1): void {
    this.mixer.timeScale = animSpeed;
    this.mixer.update(dt);
    this.eyeGlow += (this.eyeTarget - this.eyeGlow) * Math.min(1, dt * 8);
    for (const e of this.eyes) (e.material as THREE.MeshBasicMaterial).opacity = this.eyeGlow;
    if (this.shading.flash.value > 0) this.shading.flash.value = Math.max(0, this.shading.flash.value - dt / 0.2);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.body);
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh !== this.blob) (mesh.material as THREE.Material).dispose();
    });
    this.blob.geometry.dispose();
    (this.blob.material as THREE.Material).dispose();
  }
}

/** 사람 캐릭터(주인, 친구, 택배 기사). 소품(모자·무기)은 숨긴다. */
export class Human {
  readonly root = new THREE.Group();
  readonly body: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly clips: Map<string, THREE.AnimationClip>;
  private current: THREE.AnimationAction | null = null;
  private currentName = '';

  constructor(role: HumanRole, scale = 1, keepAccessories = false) {
    const { root, clips } = assets.skinned(HUMAN_FILES[role]);
    this.body = root;
    this.clips = clips;
    root.scale.setScalar(scale);
    root.traverse((o) => {
      if (!keepAccessories && ACCESSORY.test(o.name)) o.visible = false;
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.frustumCulled = false;
      }
    });
    this.root.add(root);
    this.root.add(makeBlob(1.9 * scale));
    this.mixer = new THREE.AnimationMixer(root);
    this.play('Idle', 0);
  }

  play(name: string, fade = 0.25, once = false): void {
    if (name === this.currentName && !once) return;
    const clip = this.clips.get(name);
    if (!clip) return;
    const next = this.mixer.clipAction(clip);
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.setEffectiveWeight(1);
    if (this.current && this.current !== next) next.crossFadeFrom(this.current, fade, false);
    next.play();
    this.current = next;
    this.currentName = name;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.body);
  }
}

/** 각도 차이를 [-π, π] 로 접어 부드럽게 회전시킨다. */
export function turnToward(current: number, target: number, rate: number, dt: number): number {
  let diff = target - current;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  return current + diff * Math.min(1, rate * dt);
}

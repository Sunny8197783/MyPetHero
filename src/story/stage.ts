import * as THREE from 'three';
import { gsap } from 'gsap';
import { Dog, Human, type HumanRole } from '../core/actors';
import type { GameScene } from '../core/engine';
import { Particles } from '../vfx/particles';
import { Sky, type SkyId } from '../vfx/sky';

export type ActorId = 'dog' | 'owner' | 'cat' | 'friend' | 'delivery' | 'skel1' | 'skel2' | 'skel3';

/** 무대 위 배우 한 명. 개(여우 모델)와 사람(KayKit)을 같은 방식으로 다룬다. */
export class ActorHandle {
  readonly root: THREE.Object3D;
  private gait = 0;
  private idleClip = 'Idle';

  constructor(readonly dog: Dog | null, readonly human: Human | null) {
    this.root = (dog ?? human)!.root;
  }

  static dog(variant: 'dog' | 'cat' = 'dog'): ActorHandle {
    return new ActorHandle(new Dog(variant), null);
  }

  static human(role: HumanRole, scale = 1): ActorHandle {
    return new ActorHandle(null, new Human(role, scale));
  }

  face(x: number, z: number): void {
    const dx = x - this.root.position.x;
    const dz = z - this.root.position.z;
    if (Math.abs(dx) + Math.abs(dz) > 0.01) this.root.rotation.y = Math.atan2(dx, dz);
  }

  startMove(run: boolean, toX: number, toZ: number): void {
    this.face(toX, toZ);
    this.gait = run ? 1 : 0.5;
    this.human?.play(run ? 'Running_A' : 'Walking_A', 0.15);
  }

  stopMove(): void {
    this.gait = 0;
    this.human?.play(this.idleClip, 0.2);
  }

  /** 사람 애니메이션. once 가 아니면 이후의 기본 대기 동작이 된다. */
  anim(clip: string, once = false): void {
    if (!once) this.idleClip = clip;
    this.human?.play(clip, 0.2, once);
  }

  update(dt: number): void {
    if (this.dog) {
      this.dog.setGait(this.gait, dt);
      this.dog.update(dt, this.gait > 0.7 ? 1.5 : 1);
    }
    this.human?.update(dt);
  }

  dispose(): void {
    this.dog?.dispose();
    this.human?.dispose();
  }
}

/** 낮의 집, 밤의 거리 컷씬이 함께 쓰는 무대 기반 클래스. */
export abstract class StageBase implements GameScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.3, 500);
  readonly sky: Sky;
  readonly particles = new Particles(1500);
  readonly actors = new Map<ActorId, ActorHandle>();
  /** 시네마틱 카메라 값. GSAP 이 이 값을 트윈하고 매 프레임 카메라에 적용한다. */
  readonly cam = { pos: new THREE.Vector3(0, 12, 16), look: new THREE.Vector3(0, 1, 0), fov: 38, shake: 0 };
  time = 0;

  protected constructor(sky: SkyId) {
    this.sky = new Sky(sky);
    this.scene.add(this.sky.mesh, this.particles.mesh);
  }

  actor(id: ActorId): ActorHandle | null {
    return this.actors.get(id) ?? null;
  }

  protected addActor(id: ActorId, handle: ActorHandle, x: number, z: number, faceY = 0): ActorHandle {
    handle.root.position.set(x, 0, z);
    handle.root.rotation.y = faceY;
    this.actors.set(id, handle);
    this.scene.add(handle.root);
    return handle;
  }

  /** 배우를 목적지까지 걷게(뛰게) 하는 트윈을 타임라인에 넣는다. */
  walk(tl: gsap.core.Timeline, id: ActorId, x: number, z: number, dur: number, run = false, at?: gsap.Position): void {
    const a = this.actor(id);
    if (!a) return;
    tl.call(() => a.startMove(run, x, z), undefined, at);
    tl.to(a.root.position, { x, z, duration: dur, ease: 'none' }, '<');
    tl.call(() => a.stopMove());
  }

  /** 카메라를 옮기는 트윈. */
  camTo(tl: gsap.core.Timeline, pos: [number, number, number], look: [number, number, number], dur: number, ease = 'power2.inOut', at?: gsap.Position): void {
    tl.to(this.cam.pos, { x: pos[0], y: pos[1], z: pos[2], duration: dur, ease }, at);
    tl.to(this.cam.look, { x: look[0], y: look[1], z: look[2], duration: dur, ease }, '<');
  }

  setCam(pos: [number, number, number], look: [number, number, number], fov?: number): void {
    gsap.killTweensOf(this.cam.pos);
    gsap.killTweensOf(this.cam.look);
    this.cam.pos.set(pos[0], pos[1], pos[2]);
    this.cam.look.set(look[0], look[1], look[2]);
    if (fov) this.cam.fov = fov;
  }

  protected baseUpdate(dt: number, realDt: number): void {
    this.time += dt;
    for (const a of this.actors.values()) a.update(dt);
    this.particles.update(dt);
    const c = this.cam;
    this.camera.position.copy(c.pos);
    if (c.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * c.shake;
      this.camera.position.y += (Math.random() - 0.5) * c.shake;
      c.shake *= Math.exp(-realDt * 5);
    }
    this.camera.lookAt(c.look);
    if (Math.abs(this.camera.fov - c.fov) > 0.01) {
      this.camera.fov = c.fov;
      this.camera.updateProjectionMatrix();
    }
    this.sky.update(this.time, this.camera);
  }

  abstract update(dt: number, realDt: number, elapsed: number): void;

  /** 무대별 연출 효과. 컷씬 스크립트의 fx 단계가 부른다. */
  abstract effect(kind: string, value?: number): void;

  dispose(): void {
    gsap.killTweensOf(this.cam.pos);
    gsap.killTweensOf(this.cam.look);
    gsap.killTweensOf(this.cam);
    for (const a of this.actors.values()) {
      gsap.killTweensOf(a.root.position);
      gsap.killTweensOf(a.root.rotation);
      gsap.killTweensOf(a.root.scale);
      a.dispose();
    }
    this.particles.dispose();
    this.sky.dispose();
  }
}

import * as THREE from 'three';
import { audio } from '../audio/audio';
import { Human } from '../core/actors';
import { buildNightMap, CRATER, HOME, type NightMap } from '../night/map';
import { Fx } from '../vfx/fx';
import { SPR } from '../vfx/particles';
import { ActorHandle, StageBase, type ActorId } from './stage';

export { CRATER, HOME };

/** 밤 거리 컷씬 무대. 전투 맵과 같은 동네를 쓰되 전투 시스템은 없다. */
export class StreetStage extends StageBase {
  readonly fx = new Fx();
  private readonly map: NightMap;
  private readonly light: THREE.PointLight;
  private readonly core: THREE.Mesh;
  private fireflies = 0;

  constructor(seed: number, night: number) {
    super('night');
    this.scene.fog = new THREE.FogExp2(this.sky.fogColor.getHex(), 0.011);
    this.scene.add(new THREE.HemisphereLight(0x4a5aa8, 0x1a1d33, 1.25));
    const moon = new THREE.DirectionalLight(0xa9c1ff, 1.5);
    moon.position.set(-18, 30, -14);
    this.scene.add(moon);
    this.light = new THREE.PointLight(0xffc890, 22, 16, 1.6);
    this.scene.add(this.light);
    this.map = buildNightMap(seed, night);
    this.scene.add(this.map.group, this.fx.group);

    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7df9ff).multiplyScalar(2.2) }));
    this.core.position.set(CRATER.x, -3, CRATER.z);
    this.core.visible = false;
    this.scene.add(this.core);

    const dog = this.addActor('dog', ActorHandle.dog('dog'), HOME.x, HOME.z + 2, 0);
    dog.dog!.setEyeColor(0x7df9ff);
    dog.dog!.shading.rimStrength.value = 0.6;
    this.setCam([HOME.x + 2, 9, HOME.z + 16], [HOME.x, 1, HOME.z + 2], 40);
  }

  ensureActor(id: ActorId): ActorHandle {
    const existing = this.actor(id);
    if (existing) return existing;
    if (id === 'cat') return this.addActor('cat', ActorHandle.dog('cat'), HOME.x + 6, HOME.z + 4, 0);
    if (id === 'owner') return this.addActor('owner', ActorHandle.human('owner'), HOME.x, HOME.z, 0);
    if (id === 'skel1' || id === 'skel2' || id === 'skel3') {
      const role = id === 'skel1' ? 'skelMinion' : id === 'skel2' ? 'skelRogue' : 'skelWarrior';
      const h = new ActorHandle(null, new Human(role, 0.85, true));
      return this.addActor(id, h, HOME.x + 8, HOME.z + 10, 0);
    }
    throw new Error(`거리 무대에는 ${id} 배우가 없습니다`);
  }

  effect(kind: string, value = 1): void {
    const dogHandle = this.actor('dog')!;
    const dog = dogHandle.dog!;
    const p = dogHandle.root.position;
    switch (kind) {
      case 'glowEyes':
        dog.eyeTarget = value;
        break;
      case 'aura':
        dog.shading.rimStrength.value = 0.6 + value * 2;
        if (value > 0) this.particles.burst(p.x, 0.8, p.z, 30, 7, 1.0, 0.5, 0x7df9ff, 2.2, SPR.star, 1, -2, 1.5, 1.2);
        break;
      case 'bark':
        this.fx.ring(p.x, p.z, 7 * value, 0xffd166, 0.5, 0.22, 0.14);
        this.particles.burst(p.x, 0.6, p.z, 16, 12, 0.4, 0.5, 0xffd166, 2.2, SPR.spark, 1, 0, 3, 0.15);
        this.cam.shake = 0.4;
        audio.synth('bark', { volume: 0.8 });
        audio.synth('thump', { volume: 0.5 });
        break;
      case 'dogBang':
        this.particles.emit(p.x, 2.3, p.z, 0, 1.2, 0, 0.9, 1.2, 1.5, 0xff5a5a, 1.6, 1, SPR.bang, 0);
        audio.synth('pop', { volume: 0.7, rate: 1.3 });
        break;
      case 'bang': {
        const o = this.actor('owner')?.root.position ?? p;
        this.particles.emit(o.x, 3.5, o.z, 0, 1.2, 0, 0.9, 1.3, 1.6, 0xffd23f, 1.6, 1, SPR.bang, 0);
        audio.synth('pop', { volume: 0.7 });
        break;
      }
      case 'hearts': {
        const o = this.actor('owner')?.root.position ?? p;
        for (let k = 0; k < 8; k++) this.particles.emit(o.x + (Math.random() - 0.5), 2.6, o.z, (Math.random() - 0.5) * 0.6, 1.2 + Math.random(), 0, 1.4, 0.5, 0.2, 0xff7a9e, 1.3, 1, SPR.heart, 0);
        break;
      }
      case 'spawn': {
        // 해골들이 땅에서 솟는다.
        for (const id of ['skel1', 'skel2', 'skel3'] as const) {
          const a = this.actor(id);
          if (!a || !a.root.visible) continue;
          const q = a.root.position;
          this.fx.ring(q.x, q.z, 2.4, 0xb48cff, 0.5, 0.25, 0.3);
          this.particles.burst(q.x, 0.3, q.z, 12, 4, 0.8, 0.8, 0x6a5a8a, 0.8, SPR.smoke, 0, 0, 2, 0.5);
          a.human?.play('Spawn_Ground', 0, true);
        }
        audio.synth('boom', { volume: 0.4, rate: 1.5 });
        break;
      }
      case 'smash': {
        for (const id of ['skel1', 'skel2', 'skel3'] as const) {
          const a = this.actor(id);
          if (!a || !a.root.visible) continue;
          const q = a.root.position;
          this.particles.burst(q.x, 1, q.z, 16, 9, 0.6, 0.45, 0xe9dcc0, 1.4, SPR.shard, 0.25, 16, 1.2);
          a.root.visible = false;
        }
        audio.file('destroy', { volume: 0.7 });
        break;
      }
      case 'crater':
        this.map.setCraterGlow(value);
        break;
      case 'coreRise':
        this.core.visible = true;
        this.core.position.y = -3;
        this.fx.ring(CRATER.x, CRATER.z, 12, 0x7df9ff, 1.2, 0.14, 0.3);
        this.particles.burst(CRATER.x, 1, CRATER.z, 50, 12, 1.4, 0.8, 0x7df9ff, 2.6, SPR.star, 1, -2, 1);
        this.cam.shake = 0.8;
        audio.synth('boom', { volume: 0.9, rate: 0.6 });
        break;
      case 'lamps':
        this.map.setLampPower(value);
        break;
      case 'shake':
        this.cam.shake = value;
        break;
      default:
        break;
    }
  }

  update(dt: number, realDt: number): void {
    const dog = this.actor('dog')!.root.position;
    this.light.position.set(dog.x, 3.2, dog.z + 0.5);
    this.fx.update(dt);
    this.map.update(this.time);
    if (this.core.visible) {
      this.core.position.y += (3.2 - this.core.position.y) * Math.min(1, dt * 1.2);
      this.core.rotation.y += dt * 1.4;
      this.core.rotation.x += dt * 0.6;
    }
    this.fireflies += dt * 14;
    while (this.fireflies >= 1) {
      this.fireflies -= 1;
      const a = Math.random() * 6.28;
      const r = 3 + Math.random() * 20;
      this.particles.emit(this.cam.look.x + Math.cos(a) * r, 0.5 + Math.random() * 2.2, this.cam.look.z + Math.sin(a) * r * 0.8, (Math.random() - 0.5) * 0.8, Math.random() * 0.3, (Math.random() - 0.5) * 0.8, 3 + Math.random() * 2, 0.18, 0.05, 0xd9ff8a, 2.6, 0.9, SPR.soft, 1);
    }
    this.baseUpdate(dt, realDt);
  }

  override dispose(): void {
    super.dispose();
    this.fx.dispose();
    this.map.dispose();
    this.core.geometry.dispose();
    (this.core.material as THREE.Material).dispose();
  }
}

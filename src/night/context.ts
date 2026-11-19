import type * as THREE from 'three';
import type { Rng } from '../core/rng';
import type { CameraRig } from '../vfx/cameraRig';
import type { Fx } from '../vfx/fx';
import type { Particles } from '../vfx/particles';
import type { EnemySystem } from './enemies';
import type { Gems } from './gems';
import type { NightPlayer } from './player';
import type { EnemyShots } from './shots';

export interface HitOpts {
  /** 타격 이펙트 색. */
  color?: number;
  /** 강공격: 히트스톱과 저음 임팩트가 커진다. */
  heavy?: boolean;
  critBonus?: number;
  stun?: number;
  /** 틱 피해처럼 자주 들어오는 타격은 숫자와 소리를 줄인다. */
  quiet?: boolean;
}

/** 무기·보스가 전투 세계에 접근할 때 쓰는 창구. NightScene 이 구현한다. */
export interface NightContext {
  readonly enemies: EnemySystem;
  readonly fx: Fx;
  readonly particles: Particles;
  readonly rig: CameraRig;
  readonly rng: Rng;
  readonly player: NightPlayer;
  readonly shots: EnemyShots;
  readonly gems: Gems;
  /** 무기 메시 등을 붙일 그룹. */
  readonly layer: THREE.Group;
  time: number;
  /** 적 i 에게 피해를 준다(공격력 배율·치명타 적용). 죽였으면 true. */
  hit(i: number, damage: number, dirX: number, dirZ: number, knock: number, opts?: HitOpts): boolean;
  /** 플레이어가 피해를 입는다(회피·방어 적용). */
  hurtPlayer(amount: number, fromX: number, fromZ: number): void;
  spawnEnemy(typeId: string, x: number, z: number, elite?: boolean): number;
  hitstop(ms: number): void;
  /** 화면 기준 좌우 패닝 값(-1~1). */
  pan(x: number): number;
}

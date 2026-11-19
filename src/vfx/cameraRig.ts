import * as THREE from 'three';
import { feel } from '../data';
import { clamp, damp, pseudoNoise } from '../core/rng';

/**
 * 쿼터뷰 추적 카메라.
 *  - 트라우마 기반 쉐이크(trauma² · 노이즈, 거리 감쇠)
 *  - FOV 펀치(지수 감쇠)
 *  - 줌(보스 처치 연출)
 * 매 프레임 추적 위치에서 다시 계산하므로 흔들림이 누적되지 않는다.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly focus = new THREE.Vector3();
  shakeEnabled = true;
  /** 1 = 기본 거리, 작을수록 가까이. */
  zoom = 1;
  zoomTarget = 1;
  height: number;
  back: number;
  baseFov: number;

  private trauma = 0;
  private time = 0;
  private fovPunch = 0;
  private aheadX = 0;
  private aheadZ = 0;
  private first = true;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    const c = feel.camera;
    this.height = c.height;
    this.back = c.back;
    this.baseFov = c.fov;
    camera.fov = c.fov;
    camera.updateProjectionMatrix();
  }

  /** amount: 0~1. x,z 를 주면 카메라 초점과의 거리로 감쇠한다. */
  addTrauma(amount: number, x?: number, z?: number): void {
    if (!this.shakeEnabled || !feel.shake.enabled) return;
    let k = 1;
    if (x !== undefined && z !== undefined) {
      const d = Math.hypot(x - this.focus.x, z - this.focus.z);
      const s = feel.shake;
      k = 1 - clamp((d - s.falloffStart) / (s.falloffEnd - s.falloffStart), 0, 1);
    }
    this.trauma = Math.min(1, this.trauma + amount * k);
  }

  punch(degrees: number): void {
    this.fovPunch = Math.min(feel.camera.fovPunch.max, this.fovPunch + degrees);
  }

  snap(x: number, z: number): void {
    this.focus.set(x, 0, z);
    this.aheadX = 0;
    this.aheadZ = 0;
    this.first = true;
  }

  update(realDt: number, x: number, z: number, velX = 0, velZ = 0): void {
    const c = feel.camera;
    this.time += realDt;
    this.aheadX = damp(this.aheadX, velX * c.lookAhead * 0.14, 3, realDt);
    this.aheadZ = damp(this.aheadZ, velZ * c.lookAhead * 0.14, 3, realDt);
    const tx = x + this.aheadX;
    const tz = z + this.aheadZ;
    if (this.first) {
      this.focus.set(tx, 0, tz);
      this.first = false;
    } else {
      const lambda = 1 / Math.max(0.01, c.followLag);
      this.focus.x = damp(this.focus.x, tx, lambda, realDt);
      this.focus.z = damp(this.focus.z, tz, lambda, realDt);
    }
    this.zoom = damp(this.zoom, this.zoomTarget, 5, realDt);

    const cam = this.camera;
    cam.position.set(this.focus.x, this.height * this.zoom, this.focus.z + this.back * this.zoom);
    cam.lookAt(this.focus.x, 0.6, this.focus.z);

    if (this.trauma > 0) {
      const s = feel.shake;
      const shake = this.trauma * this.trauma;
      const f = this.time * s.frequency;
      cam.position.x += s.maxOffset * shake * pseudoNoise(f, 1);
      cam.position.y += s.maxOffset * shake * pseudoNoise(f, 2) * 0.6;
      cam.position.z += s.maxOffset * shake * pseudoNoise(f, 3);
      cam.rotation.z += s.maxRoll * shake * pseudoNoise(f, 4);
      this.trauma = Math.max(0, this.trauma - s.decay * realDt);
    }

    if (this.fovPunch > 0.001) {
      this.fovPunch *= Math.exp(-realDt / c.fovPunch.decay);
      if (this.fovPunch < 0.001) this.fovPunch = 0;
    }
    const fov = this.baseFov + this.fovPunch;
    if (Math.abs(cam.fov - fov) > 0.001) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }
}

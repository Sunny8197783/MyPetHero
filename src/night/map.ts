import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { assets, type KitId } from '../core/assets';
import { Rng } from '../core/rng';
import { particleAtlas } from '../vfx/particles';
import type { Obstacle } from './enemies';

/** 동네 지도 배치. 타일 한 칸 = 12 유닛, 11×11 칸. 도로는 2·5·8번 줄. */
export const TILE = 12;
const CITY_SCALE = TILE / 2;
const N = 11;
const HALF = (N - 1) / 2;
const ROADS = [2, 5, 8];

/** 집 대문 위치(플레이어 시작점이자 새벽 귀가 지점). */
export const HOME = { x: -24, z: -43 };
export const CRATER = { x: 18, z: 18 };

interface Placement {
  x: number;
  z: number;
  ry?: number;
  s?: number;
}

export interface NightMap {
  group: THREE.Group;
  obstacles: Obstacle[];
  lamps: { x: number; z: number }[];
  /** 가로등 불빛의 세기를 바꾼다(컷씬, 보스전). */
  setLampPower(v: number): void;
  setCraterGlow(v: number): void;
  update(time: number): void;
  dispose(): void;
}

const tileCenter = (i: number): number => (i - HALF) * TILE;

function instanced(
  group: THREE.Group, kit: KitId, name: string, list: Placement[], baseScale: number,
  align: 'ground' | 'top' = 'ground', shadows = true, yScale?: number,
): void {
  if (list.length === 0) return;
  const parts = assets.geometries(kit, name);
  const geo = parts.length > 1 ? (mergeGeometries(parts, false) ?? parts[0]) : parts[0];
  geo.computeBoundingBox();
  const box = geo.boundingBox!;
  const mesh = new THREE.InstancedMesh(geo, assets.kitMaterial(kit), list.length);
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  list.forEach((p, i) => {
    const s = baseScale * (p.s ?? 1);
    const sy = yScale ?? s;
    const y = align === 'top' ? 0.02 - box.max.y * sy : -box.min.y * sy;
    q.setFromAxisAngle(up, p.ry ?? 0);
    m.compose(pos.set(p.x, y, p.z), q, scl.set(s, sy, s));
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  group.add(mesh);
}

const CONE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uPower;
varying vec2 vUv;
void main() {
  // 삼각형 가장자리에서는 보간된 vUv.y 가 0 보다 살짝 작아질 수 있다. 음수의 pow 는 GPU 에 따라 NaN 이 되고,
  // 그 픽셀 하나가 블룸을 타고 화면 전체를 검게 만든다. 반드시 0~1 로 자른 뒤 계산한다.
  float a = pow(clamp(vUv.y, 0.0, 1.0), 1.6) * 0.34 * uPower;
  gl_FragColor = vec4(uColor * 1.4, clamp(a, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const GLOW_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uColor;
uniform float uPower;
varying vec2 vUv;
void main() {
  // 아틀라스의 soft 칸(0번)
  float a = texture2D(uMap, vec2(vUv.x * 0.25, 1.0 - (1.0 - vUv.y) * 0.25)).a;
  gl_FragColor = vec4(uColor, a * uPower);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const SIMPLE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  #ifdef USE_INSTANCING
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  #else
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #endif
}`;

const GROUND_VERT = /* glsl */ `
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const GROUND_FRAG = /* glsl */ `
uniform vec3 uGrassA; uniform vec3 uGrassB; uniform vec3 uDirt; uniform vec3 uLight; uniform vec3 uCrater; uniform float uCraterGlow; uniform vec2 uCraterPos;
varying vec3 vWorld;
#include <fog_pars_fragment>
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec2 p = vWorld.xz;
  float n = noise(p * 0.18) * 0.6 + noise(p * 0.7) * 0.3 + noise(p * 3.1) * 0.1;
  vec3 col = mix(uGrassA, uGrassB, smoothstep(0.3, 0.75, n));
  float dirtMask = smoothstep(0.62, 0.8, noise(p * 0.09 + 7.3));
  col = mix(col, uDirt, dirtMask * 0.55);
  // 풀잎 느낌의 잔무늬
  col *= 0.9 + 0.2 * noise(p * 9.0);
  float cd = length(p - uCraterPos);
  col = mix(col, uDirt * 0.45, (1.0 - smoothstep(3.0, 7.5, cd)) * step(0.001, uCraterGlow));
  col += uCrater * uCraterGlow * (exp(-cd * 0.32) * 1.6 + smoothstep(0.75, 0.8, noise(p * 1.4 + cd)) * exp(-cd * 0.2) * 2.0);
  gl_FragColor = vec4(col * uLight, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function buildNightMap(seed: number, night: number): NightMap {
  const rng = new Rng(seed);
  const group = new THREE.Group();
  group.name = 'map';
  const obstacles: Obstacle[] = [];
  const disposables: { dispose(): void }[] = [];

  // --- 바닥 (가을 잔디, 절차적 셰이더) ---
  const groundMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uGrassA: { value: new THREE.Color(0x2c4a3a) },
        uGrassB: { value: new THREE.Color(0x4a6338) },
        uDirt: { value: new THREE.Color(0x5a4a38) },
        uLight: { value: new THREE.Color(0.62, 0.72, 1.0) },
        uCrater: { value: new THREE.Color(0x3fe8ff) },
        uCraterGlow: { value: night >= 5 ? 0.5 + (night - 5) * 0.25 : 0 },
        uCraterPos: { value: new THREE.Vector2(CRATER.x, CRATER.z) },
      },
    ]),
    vertexShader: GROUND_VERT,
    fragmentShader: GROUND_FRAG,
    fog: true,
  });
  const groundGeo = new THREE.PlaneGeometry(420, 420);
  groundGeo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.y = -0.03;
  group.add(ground);
  disposables.push(groundGeo, groundMat);

  // --- 도로 타일 ---
  const straight: Placement[] = [];
  const crossing: Placement[] = [];
  const junction: Placement[] = [];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const v = ROADS.includes(i);
      const h = ROADS.includes(j);
      const x = tileCenter(i);
      const z = tileCenter(j);
      if (v && h) junction.push({ x, z });
      else if (v) (j % 3 === 0 ? crossing : straight).push({ x, z, ry: 0 });
      else if (h) (i % 3 === 0 ? crossing : straight).push({ x, z, ry: Math.PI / 2 });
    }
  }
  instanced(group, 'kaykit-city', 'road_straight', straight, CITY_SCALE, 'top', false, 1);
  instanced(group, 'kaykit-city', 'road_straight_crossing', crossing, CITY_SCALE, 'top', false, 1);
  instanced(group, 'kaykit-city', 'road_junction', junction, CITY_SCALE, 'top', false, 1);

  // --- 가장자리 건물 (남쪽 줄은 시야를 가리지 않게 나무로 대신한다) ---
  const buildingNames = ['building_A', 'building_B', 'building_C', 'building_D', 'building_E', 'building_F', 'building_G', 'building_H'];
  const buildings = new Map<string, Placement[]>(buildingNames.map((n) => [n, []]));
  const edgeTrees: Placement[] = [];
  for (let k = 0; k < N; k++) {
    if (ROADS.includes(k)) continue;
    const c = tileCenter(k);
    const far = tileCenter(0);
    const isHomeLot = k === 3;
    // 북쪽(집은 따로 놓는다)
    if (!isHomeLot) buildings.get(rng.pick(buildingNames))!.push({ x: c, z: far, ry: 0 });
    // 서쪽, 동쪽
    buildings.get(rng.pick(buildingNames))!.push({ x: far, z: c, ry: Math.PI / 2 });
    buildings.get(rng.pick(buildingNames))!.push({ x: -far, z: c, ry: -Math.PI / 2 });
    // 남쪽: 나무 줄
    for (let t = 0; t < 3; t++) edgeTrees.push({ x: c - 4 + t * 4 + rng.range(-0.8, 0.8), z: -far + rng.range(-2, 2), s: rng.range(0.9, 1.25), ry: rng.range(0, 6.28) });
  }
  for (const [name, list] of buildings) instanced(group, 'kaykit-city', name, list, CITY_SCALE);
  // 우리 집: 북쪽 3번 칸
  instanced(group, 'kaykit-city', 'building_B', [{ x: tileCenter(3), z: tileCenter(0) + 1, ry: 0 }], CITY_SCALE);
  obstacles.push({ x: tileCenter(3), z: tileCenter(0) + 1, r: 7.2 });

  // --- 소품 배치 ---
  const pinesL: Placement[] = [...edgeTrees];
  const pinesM: Placement[] = [];
  const pinesS: Placement[] = [];
  const pinesY: Placement[] = [];
  const dead: Placement[] = [];
  const benches: Placement[] = [];
  const pumpkins: Placement[] = [];
  const jack: Placement[] = [];
  const lanterns: Placement[] = [];
  const graves: Placement[] = [];
  const gravesB: Placement[] = [];
  const stones: Placement[] = [];
  const fences: Placement[] = [];
  const cars: Record<string, Placement[]> = { car_sedan: [], car_hatchback: [], car_taxi: [], car_stationwagon: [], car_police: [] };
  const hydrants: Placement[] = [];
  const dumpsters: Placement[] = [];
  const boxes: Placement[] = [];
  const bushes: Placement[] = [];
  const paths: Placement[] = [];

  const tree = (list: Placement[], x: number, z: number, s: number, r: number): void => {
    list.push({ x, z, s, ry: rng.range(0, 6.28) });
    obstacles.push({ x, z, r });
  };
  const blockCenter = (bi: number, bj: number): { x: number; z: number } => ({ x: (bi - 0.5) * TILE * 3, z: (bj - 0.5) * TILE * 3 });

  // 집 앞마당 (북쪽 3~4번 칸): 울타리와 등불, 호박
  for (const fx of [HOME.x - 8.5, HOME.x + 8.5]) for (let t = 0; t < 2; t++) fences.push({ x: fx, z: -52 + t * 4, ry: Math.PI / 2 });
  lanterns.push({ x: HOME.x - 3.2, z: HOME.z }, { x: HOME.x + 3.2, z: HOME.z });
  obstacles.push({ x: HOME.x - 3.2, z: HOME.z, r: 0.5 }, { x: HOME.x + 3.2, z: HOME.z, r: 0.5 });
  jack.push({ x: HOME.x + 5.5, z: HOME.z - 2.5, ry: 0.4 });
  pumpkins.push({ x: HOME.x - 6, z: HOME.z - 3, ry: 1.2 }, { x: HOME.x - 5.1, z: HOME.z - 2.2, s: 0.7 });
  tree(pinesM, HOME.x + 8.2, HOME.z - 6, 1.0, 1.0);
  for (let t = 0; t < 4; t++) paths.push({ x: HOME.x + rng.range(-0.4, 0.4), z: HOME.z - 2 - t * 2.1, ry: rng.range(0, 6.28) });

  // 안쪽 블록 A (북서): 놀이 공원
  {
    const c = blockCenter(-0, -0);
    tree(pinesM, c.x - 7, c.z - 7, 1.0, 1.0);
    tree(pinesS, c.x + 7.5, c.z - 6, 1.1, 0.8);
    tree(pinesY, c.x - 6, c.z + 7, 1.0, 0.9);
    benches.push({ x: c.x + 5, z: c.z + 7.5, ry: Math.PI }, { x: c.x - 1, z: c.z - 8, ry: 0 });
    obstacles.push({ x: c.x + 5, z: c.z + 7.5, r: 1.1 }, { x: c.x - 1, z: c.z - 8, r: 1.1 });
    lanterns.push({ x: c.x, z: c.z });
    obstacles.push({ x: c.x, z: c.z, r: 0.5 });
    pumpkins.push({ x: c.x + 2.2, z: c.z + 1.4 }, { x: c.x - 3, z: c.z + 2, s: 0.8 });
    for (let t = 0; t < 5; t++) paths.push({ x: c.x - 8 + t * 4, z: c.z + rng.range(-0.5, 0.5), ry: rng.range(0, 6.28) });
  }
  // 블록 B (북동): 숲 공원
  {
    const c = blockCenter(1, -0);
    const spots: [number, number][] = [[-8, -8], [8, -7], [-7, 8], [7.5, 7.5], [0, -3], [-2, 5]];
    spots.forEach(([dx, dz], k) => tree(k % 3 === 0 ? pinesY : k % 3 === 1 ? pinesM : pinesS, c.x + dx, c.z + dz, rng.range(0.9, 1.15), 0.95));
    for (let t = 0; t < 6; t++) bushes.push({ x: c.x + rng.range(-9, 9), z: c.z + rng.range(-9, 9), s: rng.range(0.8, 1.3), ry: rng.range(0, 6.28) });
    jack.push({ x: c.x + 3.5, z: c.z + 1.5, ry: -0.6 });
    benches.push({ x: c.x - 5, z: c.z - 0.5, ry: Math.PI / 2 });
    obstacles.push({ x: c.x - 5, z: c.z - 0.5, r: 1.1 });
  }
  // 블록 C (남서): 주차장
  {
    const c = blockCenter(-0, 1);
    const names = Object.keys(cars);
    const slots: [number, number, number][] = [[-7.5, -6, 0], [-2.5, -6, 0], [2.5, -6, Math.PI], [7.5, 5.5, Math.PI], [-7.5, 5.5, 0]];
    slots.forEach(([dx, dz, ry], k) => {
      cars[names[k % names.length]].push({ x: c.x + dx, z: c.z + dz, ry });
      obstacles.push({ x: c.x + dx, z: c.z + dz - 1.3, r: 1.5 }, { x: c.x + dx, z: c.z + dz + 1.3, r: 1.5 });
    });
    dumpsters.push({ x: c.x + 7.5, z: c.z - 7.5, ry: Math.PI / 2 });
    obstacles.push({ x: c.x + 7.5, z: c.z - 7.5, r: 2.0 });
    boxes.push({ x: c.x + 4.6, z: c.z - 8.2, ry: 0.3 }, { x: c.x + 5.4, z: c.z - 6.6, ry: 1.1, s: 0.8 }, { x: c.x - 1, z: c.z + 6.5, ry: 0.7 });
    hydrants.push({ x: c.x - 10.2, z: c.z });
    obstacles.push({ x: c.x - 10.2, z: c.z, r: 0.5 });
    tree(pinesS, c.x + 0.5, c.z + 8, 1.0, 0.8);
  }
  // 블록 D (남동): 오래된 묘지 (5밤부터 운석 구덩이가 빛난다)
  {
    const c = blockCenter(1, 1);
    const rows: [number, number][] = [[-7, -7], [-3.5, -7], [3.5, -7], [7, -7], [-7, 7], [-3.5, 7], [3.5, 7], [7, 7], [-8, 0], [8, 0]];
    rows.forEach(([dx, dz], k) => {
      (k % 2 ? gravesB : graves).push({ x: c.x + dx, z: c.z + dz, ry: dz > 0 ? Math.PI : 0 });
      obstacles.push({ x: c.x + dx, z: c.z + dz, r: 0.8 });
    });
    tree(dead, c.x - 9.5, c.z - 9.5, 1.0, 0.6);
    tree(dead, c.x + 9.5, c.z + 9.2, 1.1, 0.6);
    stones.push({ x: c.x - 5, z: c.z + 3.5 }, { x: c.x + 5, z: c.z - 3.5, ry: 2 });
    obstacles.push({ x: c.x - 5, z: c.z + 3.5, r: 0.6 }, { x: c.x + 5, z: c.z - 3.5, r: 0.6 });
    lanterns.push({ x: c.x - 10.5, z: c.z + 10.5 }, { x: c.x + 10.5, z: c.z - 10.5 });
    // 울타리(북쪽과 서쪽 변, 가운데는 출입구로 비워 둔다)
    for (const t of [-8, 8]) {
      fences.push({ x: c.x + t, z: c.z - 11.4, ry: 0 }, { x: c.x - 11.4, z: c.z + t, ry: Math.PI / 2 });
      for (const o of [-1.4, 0, 1.4]) obstacles.push({ x: c.x + t + o, z: c.z - 11.4, r: 0.7 }, { x: c.x - 11.4, z: c.z + t + o, r: 0.7 });
    }
  }
  // 바깥 띠(1번·9번 줄): 나무와 주차된 차
  for (const j of [1, 9]) {
    for (const i of [1, 3, 4, 6, 7, 9]) {
      if (j === 1 && (i === 3 || i === 4)) continue; // 집 앞마당
      const x = tileCenter(i);
      const z = tileCenter(j);
      tree(rng.chance(0.5) ? pinesM : pinesY, x + rng.range(-3, 3), z + (j === 1 ? -2.5 : 2.5) + rng.range(-1, 1), rng.range(0.9, 1.2), 1.0);
      if (rng.chance(0.5)) bushes.push({ x: x + rng.range(-4, 4), z: z + rng.range(-3, 3), s: rng.range(0.8, 1.2) });
    }
  }
  for (const i of [1, 9]) {
    for (const j of [3, 4, 6, 7]) {
      const x = tileCenter(i);
      const z = tileCenter(j);
      tree(rng.chance(0.5) ? pinesS : pinesM, x + (i === 1 ? -2.5 : 2.5) + rng.range(-1, 1), z + rng.range(-3, 3), rng.range(0.9, 1.2), 0.95);
      if (rng.chance(0.6)) pumpkins.push({ x: x + rng.range(-3, 3), z: z + rng.range(-4, 4), s: rng.range(0.7, 1.1), ry: rng.range(0, 6) });
    }
  }
  // 길가에 세운 차 두 대
  cars.car_taxi.push({ x: tileCenter(5) + 3.4, z: tileCenter(3) + 2, ry: 0 });
  obstacles.push({ x: tileCenter(5) + 3.4, z: tileCenter(3) + 0.7, r: 1.5 }, { x: tileCenter(5) + 3.4, z: tileCenter(3) + 3.3, r: 1.5 });
  cars.car_police.push({ x: tileCenter(7), z: tileCenter(5) - 3.4, ry: Math.PI / 2 });
  obstacles.push({ x: tileCenter(7) - 1.3, z: tileCenter(5) - 3.4, r: 1.5 }, { x: tileCenter(7) + 1.3, z: tileCenter(5) - 3.4, r: 1.5 });

  // --- 가로등 ---
  const lamps: { x: number; z: number }[] = [];
  const lampPlace: Placement[] = [];
  for (const i of ROADS) {
    for (const j of [1, 3.5, 6.5, 9]) {
      const side = (Math.round(j * 2) + i) % 2 === 0 ? 1 : -1;
      const a = { x: tileCenter(i) + side * 4.7, z: tileCenter(j) };
      const b = { x: tileCenter(j), z: tileCenter(i) + side * 4.7 };
      lamps.push(a, b);
      // 가로등 팔은 모델의 -X 방향으로 뻗어 있다. 도로 쪽을 향하게 돌린다.
      lampPlace.push({ ...a, ry: side > 0 ? 0 : Math.PI }, { ...b, ry: (-side * Math.PI) / 2 });
      obstacles.push({ ...a, r: 0.45 }, { ...b, r: 0.45 });
    }
  }
  instanced(group, 'kaykit-city', 'streetlight', lampPlace, CITY_SCALE);

  instanced(group, 'kaykit-halloween', 'tree_pine_orange_large', pinesL, 1);
  instanced(group, 'kaykit-halloween', 'tree_pine_orange_medium', pinesM, 1);
  instanced(group, 'kaykit-halloween', 'tree_pine_orange_small', pinesS, 1);
  instanced(group, 'kaykit-halloween', 'tree_pine_yellow_medium', pinesY, 1);
  instanced(group, 'kaykit-halloween', 'tree_dead_large', dead, 1);
  instanced(group, 'kaykit-halloween', 'bench', benches, 1.25);
  instanced(group, 'kaykit-halloween', 'pumpkin_orange', pumpkins, 1);
  instanced(group, 'kaykit-halloween', 'pumpkin_orange_jackolantern', jack, 1.1);
  instanced(group, 'kaykit-halloween', 'post_lantern', lanterns, 1.1);
  instanced(group, 'kaykit-halloween', 'grave_A', graves, 1);
  instanced(group, 'kaykit-halloween', 'grave_B', gravesB, 1);
  instanced(group, 'kaykit-halloween', 'gravestone', stones, 1);
  instanced(group, 'kaykit-halloween', 'fence', fences, 1);
  instanced(group, 'kaykit-halloween', 'path_A', paths, 1.1, 'ground', false);
  for (const [name, list] of Object.entries(cars)) instanced(group, 'kaykit-city', name, list, CITY_SCALE);
  instanced(group, 'kaykit-city', 'firehydrant', hydrants, CITY_SCALE);
  instanced(group, 'kaykit-city', 'dumpster', dumpsters, CITY_SCALE);
  instanced(group, 'kaykit-city', 'box_A', boxes, CITY_SCALE);
  instanced(group, 'kaykit-city', 'bush', bushes, CITY_SCALE);

  // --- 가짜 볼류메트릭: 가로등 빛 원뿔 + 바닥 빛 웅덩이 ---
  const lightColor = new THREE.Color(0xffc27a);
  const coneGeo = new THREE.ConeGeometry(3.2, 5.6, 20, 1, true);
  coneGeo.translate(0, 2.8, 0);
  const coneMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: lightColor.clone() }, uPower: { value: 1 } },
    vertexShader: SIMPLE_VERT,
    fragmentShader: CONE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const glowGeo = new THREE.PlaneGeometry(1, 1);
  glowGeo.rotateX(-Math.PI / 2);
  const glowMat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: particleAtlas() }, uColor: { value: lightColor.clone().multiplyScalar(0.55) }, uPower: { value: 1 } },
    vertexShader: SIMPLE_VERT,
    fragmentShader: GLOW_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const lightSpots = [...lamps.map((l, k) => ({ ...lampPlace[k], x: l.x, z: l.z, lamp: true })), ...lanterns.map((l) => ({ x: l.x, z: l.z, ry: 0, lamp: false }))];
  const cones = new THREE.InstancedMesh(coneGeo, coneMat, lamps.length);
  const glows = new THREE.InstancedMesh(glowGeo, glowMat, lightSpots.length);
  const mm = new THREE.Matrix4();
  let ci = 0;
  lightSpots.forEach((s, k) => {
    // 가로등 머리는 기둥에서 도로 쪽으로 1.35 유닛 나와 있다.
    const ox = s.lamp ? -Math.cos(s.ry ?? 0) * 1.35 : 0;
    const oz = s.lamp ? Math.sin(s.ry ?? 0) * 1.35 : 0;
    const size = s.lamp ? 11 : 6;
    mm.makeScale(size, 1, size).setPosition(s.x + ox, 0.06, s.z + oz);
    glows.setMatrixAt(k, mm);
    if (s.lamp) {
      mm.makeScale(1, 1, 1).setPosition(s.x + ox, 0, s.z + oz);
      cones.setMatrixAt(ci++, mm);
    }
  });
  cones.frustumCulled = false;
  glows.frustumCulled = false;
  cones.renderOrder = 6;
  glows.renderOrder = 5;
  group.add(glows, cones);
  disposables.push(coneGeo, coneMat, glowGeo, glowMat);

  // --- 운석 구덩이의 수정 (5밤부터) ---
  const crystals = new THREE.Group();
  if (night >= 5) {
    const crystalMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x4ff0ff).multiplyScalar(1.8) });
    const crystalGeo = new THREE.ConeGeometry(0.45, 2.2, 5);
    crystalGeo.translate(0, 1.1, 0);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const r = rng.range(2.4, 4.6);
      const cmesh = new THREE.Mesh(crystalGeo, crystalMat);
      cmesh.position.set(CRATER.x + Math.cos(a) * r, 0, CRATER.z + Math.sin(a) * r);
      cmesh.rotation.set(rng.range(-0.4, 0.4), rng.range(0, 6), rng.range(-0.4, 0.4));
      cmesh.scale.setScalar(rng.range(0.6, 1.3));
      crystals.add(cmesh);
    }
    group.add(crystals);
    disposables.push(crystalMat, crystalGeo);
  }

  return {
    group,
    obstacles,
    lamps,
    setLampPower(v: number) {
      coneMat.uniforms.uPower.value = v;
      glowMat.uniforms.uPower.value = v;
    },
    setCraterGlow(v: number) {
      groundMat.uniforms.uCraterGlow.value = v;
    },
    update(time: number) {
      crystals.children.forEach((c, k) => {
        c.scale.y = c.scale.x * (1 + 0.08 * Math.sin(time * 2 + k));
      });
    },
    dispose() {
      for (const d of disposables) d.dispose();
      group.traverse((o) => {
        const im = o as THREE.InstancedMesh;
        if (im.isInstancedMesh && im.geometry !== coneGeo && im.geometry !== glowGeo) im.geometry.dispose();
      });
    },
  };
}

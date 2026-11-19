import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js';
import { feel } from '../data';

/** 버텍스 애니메이션 텍스처(VAT): 스키닝 결과를 프레임별 정점 위치로 구워 인스턴싱에 쓴다. */
export interface VatData {
  geometry: THREE.BufferGeometry;
  texture: THREE.DataTexture;
  frames: number;
  width: number;
  rows: number;
  duration: number;
  map: THREE.Texture | null;
}

const VAT_WIDTH = 1024;

let simplifierOk = false;
/** 메시 단순화기(meshoptimizer WASM) 준비. 실패하면 원본 메시를 그대로 쓴다. */
export const simplifierReady: Promise<void> = Promise.resolve(MeshoptSimplifier.supported ? MeshoptSimplifier.ready : undefined).then(
  () => {
    simplifierOk = MeshoptSimplifier.supported;
  },
  () => undefined,
);

/**
 * 삼각형 수를 ratio 배로 줄인 지오메트리를 돌려준다(적 LOD).
 * 살아남는 정점은 원본 정점 그대로라서 aVid(VAT 좌표)·uv(팔레트 색)·aSolid 가 유지된다.
 */
export function simplifyGeometry(geometry: THREE.BufferGeometry, ratio: number): THREE.BufferGeometry {
  const src = geometry.index;
  if (!simplifierOk || ratio >= 0.999 || !src) return geometry;
  const indices = Uint32Array.from(src.array as ArrayLike<number>);
  const positions = geometry.getAttribute('position').array as Float32Array;
  const uv = geometry.getAttribute('uv')?.array as Float32Array | undefined;
  const target = Math.max(3, Math.floor((indices.length * ratio) / 3) * 3);
  const out = uv
    ? MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, uv, 2, [0.5, 0.5], null, target, 1)[0]
    : MeshoptSimplifier.simplify(indices, positions, 3, target, 1)[0];
  if (out.length < 3) return geometry;
  const [remap, unique] = MeshoptSimplifier.compactMesh(out);
  const result = new THREE.BufferGeometry();
  for (const name of Object.keys(geometry.attributes)) {
    const a = geometry.getAttribute(name) as THREE.BufferAttribute;
    const from = a.array as Float32Array;
    const to = new Float32Array(unique * a.itemSize);
    for (let i = 0; i < remap.length; i++) {
      const t = remap[i];
      if (t === 0xffffffff) continue;
      for (let k = 0; k < a.itemSize; k++) to[t * a.itemSize + k] = from[i * a.itemSize + k];
    }
    result.setAttribute(name, new THREE.BufferAttribute(to, a.itemSize));
  }
  result.setIndex(new THREE.BufferAttribute(out, 1));
  geometry.dispose();
  return result;
}

export function bakeVat(gltf: GLTF, clipName: string, detail = 1, fps = 16): VatData {
  const root = cloneSkinned(gltf.scene);
  const clip = gltf.animations.find((c) => c.name === clipName) ?? gltf.animations[0];
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();

  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (m.isSkinnedMesh) meshes.push(m);
  });
  let total = 0;
  for (const m of meshes) total += m.geometry.getAttribute('position').count;

  const frames = Math.max(2, Math.round(clip.duration * fps));
  const width = Math.min(total, VAT_WIDTH);
  const rows = Math.ceil(total / width);
  const data = new Uint16Array(width * rows * frames * 4);
  const v = new THREE.Vector3();
  const first = new Float32Array(total * 3);

  for (let f = 0; f < frames; f++) {
    mixer.setTime((f / frames) * clip.duration);
    root.updateMatrixWorld(true);
    let base = 0;
    for (const m of meshes) {
      m.skeleton.update();
      const count = m.geometry.getAttribute('position').count;
      for (let i = 0; i < count; i++) {
        m.getVertexPosition(i, v);
        v.applyMatrix4(m.matrixWorld);
        const id = base + i;
        const o = ((f * rows + Math.floor(id / width)) * width + (id % width)) * 4;
        data[o] = THREE.DataUtils.toHalfFloat(v.x);
        data[o + 1] = THREE.DataUtils.toHalfFloat(v.y);
        data[o + 2] = THREE.DataUtils.toHalfFloat(v.z);
        data[o + 3] = 15360; // 1.0
        if (f === 0) {
          first[id * 3] = v.x;
          first[id * 3 + 1] = v.y;
          first[id * 3 + 2] = v.z;
        }
      }
      base += count;
    }
  }

  // 여러 부위 메시를 하나로 합친다. 텍스처가 없는 부위(눈 등)는 aSolid 로 단색 + 발광 처리.
  const uv = new Float32Array(total * 2);
  const vid = new Float32Array(total);
  const solid = new Float32Array(total * 4);
  const index: number[] = [];
  let map: THREE.Texture | null = null;
  let base = 0;
  for (const m of meshes) {
    const g = m.geometry;
    const count = g.getAttribute('position').count;
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
    const uvAttr = g.getAttribute('uv') as THREE.BufferAttribute | undefined;
    if (mat.map && !map) map = mat.map;
    for (let i = 0; i < count; i++) {
      const id = base + i;
      vid[id] = id;
      if (uvAttr) {
        uv[id * 2] = uvAttr.getX(i);
        uv[id * 2 + 1] = uvAttr.getY(i);
      }
      if (!mat.map) {
        solid[id * 4] = mat.color.r;
        solid[id * 4 + 1] = mat.color.g;
        solid[id * 4 + 2] = mat.color.b;
        solid[id * 4 + 3] = 1;
      }
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) index.push(g.index.getX(i) + base);
    else for (let i = 0; i < count; i++) index.push(i + base);
    base += count;
  }

  const full = new THREE.BufferGeometry();
  full.setAttribute('position', new THREE.BufferAttribute(first, 3));
  full.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  full.setAttribute('aVid', new THREE.BufferAttribute(vid, 1));
  full.setAttribute('aSolid', new THREE.BufferAttribute(solid, 4));
  full.setIndex(index);
  const geometry = simplifyGeometry(full, detail);

  const texture = new THREE.DataTexture(data, width, rows * frames, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  return { geometry, texture, frames, width, rows, duration: clip.duration, map };
}

/** 정적 소품 지오메트리를 인스턴스 적 머티리얼과 호환되게 만든다(aSolid 를 0 으로 채움). */
export function prepareProp(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute('aSolid', new THREE.BufferAttribute(new Float32Array(count * 4), 4));
  return geometry;
}

export interface EnemyMaterialOptions {
  map: THREE.Texture | null;
  vat?: VatData;
  rim?: number;
  rimStrength?: number;
}

/**
 * 인스턴스 적 머티리얼. MeshLambert 를 고쳐 다음을 더한다:
 *  - VAT 샘플링(프레임 보간), 스쿼시 & 스트레치
 *  - 인스턴스별 히트 플래시(흰색 번쩍)
 *  - 네온 림라이트, 텍스처 없는 부위의 발광
 * 인스턴스 속성 aAnim = (애니메이션 위상, 플래시, 스쿼시, 미사용)
 */
export function makeEnemyMaterial(opts: EnemyMaterialOptions): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ map: opts.map, flatShading: !!opts.vat });
  const vat = opts.vat;
  const rim = new THREE.Color(opts.rim ?? 0x6fa8ff);
  mat.defines = vat ? { USE_VAT: '' } : {};
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uVat = { value: vat?.texture ?? null };
    shader.uniforms.uVatInfo = { value: new THREE.Vector4(vat?.width ?? 1, vat?.rows ?? 1, vat?.frames ?? 1, 0) };
    shader.uniforms.uFlashI = { value: feel.flash.intensity };
    shader.uniforms.uRim = { value: rim };
    shader.uniforms.uRimStrength = { value: opts.rimStrength ?? 0.9 };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 aAnim;
        attribute vec4 aSolid;
        attribute float aVid;
        uniform highp sampler2D uVat;
        uniform vec4 uVatInfo;
        varying float vFlash;
        varying vec4 vSolid;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#ifdef USE_VAT
          float fr = aAnim.x * uVatInfo.z;
          float f0 = floor(fr);
          float f1 = mod(f0 + 1.0, uVatInfo.z);
          int vcol = int(mod(aVid, uVatInfo.x));
          int vrow = int(floor(aVid / uVatInfo.x));
          vec3 p0 = texelFetch(uVat, ivec2(vcol, vrow + int(f0) * int(uVatInfo.y)), 0).xyz;
          vec3 p1 = texelFetch(uVat, ivec2(vcol, vrow + int(f1) * int(uVatInfo.y)), 0).xyz;
          vec3 transformed = mix(p0, p1, fr - f0);
        #else
          vec3 transformed = vec3(position);
        #endif
        float sq = max(aAnim.z, 0.05);
        transformed.y *= sq;
        transformed.xz *= inversesqrt(sq);
        vFlash = aAnim.y;
        vSolid = aSolid;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uFlashI;
        uniform vec3 uRim;
        uniform float uRimStrength;
        varying float vFlash;
        varying vec4 vSolid;`,
      )
      .replace('#include <map_fragment>', `#include <map_fragment>\n if (vSolid.a > 0.5) diffuseColor.rgb = vSolid.rgb;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n totalEmissiveRadiance += vSolid.rgb * vSolid.a * 2.2;`)
      .replace(
        '#include <opaque_fragment>',
        `float rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.4);
        outgoingLight += uRim * rimF * uRimStrength;
        outgoingLight = mix(outgoingLight, vec3(uFlashI), clamp(vFlash, 0.0, 1.0));
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => (vat ? 'enemy-vat' : 'enemy-prop');
  return mat;
}

/** 캐릭터 한 마리(개, 보스 등)의 머티리얼에 림라이트와 히트 플래시 uniform 을 붙인다. */
export interface CharacterShading {
  flash: { value: number };
  rimStrength: { value: number };
  rimColor: { value: THREE.Color };
}

export function patchCharacterMaterial(mat: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial, rim: number, rimStrength: number): CharacterShading {
  const shading: CharacterShading = {
    flash: { value: 0 },
    rimStrength: { value: rimStrength },
    rimColor: { value: new THREE.Color(rim) },
  };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFlash = shading.flash;
    shader.uniforms.uRimStrength = shading.rimStrength;
    shader.uniforms.uRim = shading.rimColor;
    shader.uniforms.uFlashI = { value: feel.flash.intensity };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uFlash;
        uniform float uFlashI;
        uniform float uRimStrength;
        uniform vec3 uRim;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `float rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.2);
        outgoingLight += uRim * rimF * uRimStrength;
        outgoingLight = mix(outgoingLight, vec3(uFlashI), clamp(uFlash, 0.0, 1.0));
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => 'character-rim';
  mat.needsUpdate = true;
  return shading;
}

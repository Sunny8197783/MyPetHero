import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

export type KitId = 'kaykit-city' | 'kaykit-furniture' | 'kaykit-halloween';

interface Kit {
  material: THREE.MeshLambertMaterial;
  texture: THREE.Texture;
  models: Map<string, THREE.Object3D>;
}

export interface SkinnedInstance {
  root: THREE.Object3D;
  clips: Map<string, THREE.AnimationClip>;
}

/** 에셋 경로를 실제 URL 로 바꾼다. 단일 파일 빌드에서는 data URI 가 된다. */
export function assetUrl(rel: string): string {
  const inline = window.__INLINE_ASSETS__;
  return inline?.[`assets/${rel}`] ?? `./assets/${rel}`;
}

async function fetchBuffer(rel: string): Promise<ArrayBuffer> {
  // 임베드용 빌드(--embed)는 .glb/.pack 을 올릴 수 없는 호스트를 위해 base64 를 담은 .json 으로 감싸 둔다.
  const wrapped = window.__ASSET_JSON__?.some((ext) => rel.endsWith(ext)) ?? false;
  const res = await fetch(wrapped ? `${assetUrl(rel)}.json` : assetUrl(rel));
  if (!res.ok) throw new Error(`에셋을 불러오지 못했습니다: ${rel} (${res.status})`);
  if (!wrapped) return res.arrayBuffer();
  const { data } = (await res.json()) as { data: string };
  const bin = atob(data);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

let blobFetch: Promise<boolean> | null = null;
/**
 * blob: URL 을 fetch 할 수 있는지 한 번만 확인한다.
 * 임베드된 페이지의 보안 정책(CSP connect-src)이 이를 막으면, three 의 GLTFLoader 가 GLB 내장 텍스처를
 * 읽을 때 쓰는 ImageBitmapLoader(fetch 사용)가 실패한다. 그때는 <img> 로더로 바꿔 읽는다.
 */
function canFetchBlob(): Promise<boolean> {
  blobFetch ??= (async () => {
    try {
      const url = URL.createObjectURL(new Blob([new Uint8Array(1)]));
      try {
        return (await fetch(url)).ok;
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      return false;
    }
  })();
  return blobFetch;
}

class AssetStore {
  private readonly loader = new GLTFLoader();
  private readonly textureLoader = new THREE.TextureLoader();
  private readonly kits = new Map<KitId, Kit>();
  private readonly kitLoads = new Map<KitId, Promise<void>>();
  private readonly glbs = new Map<string, GLTF>();
  private readonly glbLoads = new Map<string, Promise<GLTF>>();
  private readonly textures = new Map<string, THREE.Texture>();

  /** 키트(.pack + 팔레트 텍스처)를 불러온다. 같은 키트를 여러 번 불러도 한 번만 받는다. */
  loadKit(id: KitId): Promise<void> {
    let p = this.kitLoads.get(id);
    if (!p) {
      p = this.loadKitNow(id);
      this.kitLoads.set(id, p);
    }
    return p;
  }

  private async loadKitNow(id: KitId): Promise<void> {
    const [pack, texture] = await Promise.all([
      fetchBuffer(`${id}/${id}.pack`),
      this.textureLoader.loadAsync(assetUrl(`${id}/texture.png`)),
    ]);
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshLambertMaterial({ map: texture });
    material.name = id;

    const head = new DataView(pack);
    const jsonLen = head.getUint32(4, true);
    const index = JSON.parse(new TextDecoder().decode(new Uint8Array(pack, 8, jsonLen))) as {
      files: Record<string, [number, number]>;
    };
    const base = 8 + jsonLen;
    const models = new Map<string, THREE.Object3D>();
    await Promise.all(
      Object.entries(index.files).map(async ([name, [offset, length]]) => {
        const gltf = await this.loader.parseAsync(pack.slice(base + offset, base + offset + length), '');
        const root = gltf.scene;
        root.name = name;
        root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const old = mesh.material;
          mesh.material = material;
          for (const m of Array.isArray(old) ? old : [old]) m.dispose();
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        });
        models.set(name, root);
      }),
    );
    this.kits.set(id, { material, texture, models });
  }

  kitNames(id: KitId): string[] {
    return [...(this.kits.get(id)?.models.keys() ?? [])].sort();
  }

  kitMaterial(id: KitId): THREE.MeshLambertMaterial {
    const kit = this.kits.get(id);
    if (!kit) throw new Error(`키트를 먼저 불러와야 합니다: ${id}`);
    return kit.material;
  }

  /** 키트 모델의 복제본. 지오메트리와 머티리얼은 공유한다. */
  model(id: KitId, name: string): THREE.Object3D {
    const src = this.kits.get(id)?.models.get(name);
    if (!src) throw new Error(`모델이 없습니다: ${id}/${name}`);
    return src.clone(true);
  }

  /** 인스턴싱용: 모델의 모든 메시를 월드 변환까지 구워 하나의 지오메트리 목록으로 돌려준다. */
  geometries(id: KitId, name: string): THREE.BufferGeometry[] {
    const src = this.kits.get(id)?.models.get(name);
    if (!src) throw new Error(`모델이 없습니다: ${id}/${name}`);
    src.updateMatrixWorld(true);
    const out: THREE.BufferGeometry[] = [];
    src.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const g = mesh.geometry.clone();
      g.applyMatrix4(mesh.matrixWorld);
      out.push(g);
    });
    return out;
  }

  loadGlb(rel: string): Promise<GLTF> {
    let p = this.glbLoads.get(rel);
    if (!p) {
      p = Promise.all([fetchBuffer(rel), canFetchBlob()])
        .then(([buf, ok]) => (ok ? this.loader.parseAsync(buf, '') : this.parseWithImageElements(buf)))
        .then((gltf) => {
          this.glbs.set(rel, gltf);
          return gltf;
        });
      this.glbLoads.set(rel, p);
    }
    return p;
  }

  /** createImageBitmap 을 잠깐 가려서 GLTFLoader 가 <img> 기반 TextureLoader 를 고르게 한다(파서는 parse 호출 안에서 바로 만들어진다). */
  private parseWithImageElements(buf: ArrayBuffer): Promise<GLTF> {
    const w = window as unknown as { createImageBitmap?: unknown };
    const saved = w.createImageBitmap;
    w.createImageBitmap = undefined;
    try {
      return this.loader.parseAsync(buf, '');
    } finally {
      w.createImageBitmap = saved;
    }
  }

  glb(rel: string): GLTF {
    const gltf = this.glbs.get(rel);
    if (!gltf) throw new Error(`GLB 를 먼저 불러와야 합니다: ${rel}`);
    return gltf;
  }

  /** 스키닝된 캐릭터의 독립 복제본(본 포함)과 애니메이션 클립. */
  skinned(rel: string): SkinnedInstance {
    const gltf = this.glb(rel);
    const root = cloneSkinned(gltf.scene);
    const clips = new Map<string, THREE.AnimationClip>();
    for (const clip of gltf.animations) clips.set(clip.name, clip);
    return { root, clips };
  }

  async loadTexture(rel: string, srgb = true): Promise<THREE.Texture> {
    const cached = this.textures.get(rel);
    if (cached) return cached;
    const tex = await this.textureLoader.loadAsync(assetUrl(rel));
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    this.textures.set(rel, tex);
    return tex;
  }

  texture(rel: string): THREE.Texture {
    const tex = this.textures.get(rel);
    if (!tex) throw new Error(`텍스처를 먼저 불러와야 합니다: ${rel}`);
    return tex;
  }
}

export const assets = new AssetStore();

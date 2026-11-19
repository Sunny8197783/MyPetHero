declare module '*.css';
declare module '*.glsl' {
  const source: string;
  export default source;
}
declare module '*.woff' {
  const url: string;
  export default url;
}
declare module '*.woff2' {
  const url: string;
  export default url;
}
declare const __BUILD_TIME__: string;
interface Window {
  /** 단일 파일 빌드에서 에셋 경로 → data URI 를 담는다. */
  __INLINE_ASSETS__?: Record<string, string>;
  /** 임베드용 빌드에서 base64 JSON 으로 감싼 에셋의 확장자 목록. */
  __ASSET_JSON__?: string[];
}

declare module 'three/addons/libs/meshopt_simplifier.module.js' {
  /** meshoptimizer 단순화기(WASM). three 에 타입 선언이 없어 필요한 부분만 적는다. */
  export const MeshoptSimplifier: {
    supported: boolean;
    ready: Promise<void>;
    simplify(indices: Uint32Array, positions: Float32Array, stride: number, targetIndexCount: number, targetError: number, flags?: string[]): [Uint32Array, number];
    simplifyWithAttributes(
      indices: Uint32Array,
      positions: Float32Array,
      stride: number,
      attributes: Float32Array,
      attributeStride: number,
      weights: number[],
      lock: Uint8Array | null,
      targetIndexCount: number,
      targetError: number,
      flags?: string[],
    ): [Uint32Array, number];
    compactMesh(indices: Uint32Array): [Uint32Array, number];
  };
}

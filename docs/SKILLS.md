# 설치한 스킬과 활용 계획

## 설치 방식

이 작업 환경은 npm 설치가 꺼져 있어 `npx skills add ...`를 실행할 수 없었다. 그래서 세션에 이미 들어 있는 `find-skills` 스킬의 절차를 그대로 따랐다.

1. skills.sh 검색 결과(웹 검색)와 Agent Skill Index(`heilcheng/awesome-agent-skills`)에서 키워드별 후보를 찾는다.
2. 후보 저장소를 `git clone --depth 1`로 받아 SKILL.md와 참조 파일을 직접 읽고 검증한다.
3. 통과한 스킬 폴더를 프로젝트의 `.claude/skills/<이름>/`에 복사한다. `npx skills add -a claude-code`가 설치하는 위치와 같다.
4. 출처와 커밋은 `.claude/skills/skills-lock.json`에 기록한다.

네트워크가 되는 PC에서는 `scripts/install-skills.sh`로 같은 스킬을 공식 CLI로 다시 설치할 수 있다.

### 검증에서 걸러낸 것

| 항목 | 조치 |
|---|---|
| `threejs-game-director/scripts/probe_asset_credentials.sh` (셸 프로필을 읽어 외부 AI 에셋 생성용 API 키 유무를 확인) | 이 프로젝트는 외부 생성 서비스를 쓰지 않으므로 파일을 삭제하고 실행하지 않음 |
| `threejs-3d-generator`, `threejs-image-generator`, `threejs-audio-generator`, `meshyai`, `worldlabs`, `retrodiffusion` | 유료 외부 API 키가 필요해 설치하지 않음 |
| `drawcall-ai/skills` (vfx, audio) | skills.sh에는 있으나 저장소 클론 실패. 설치하지 않음 |
| 배포·수익화·멀티플레이·SEO 계열 | 기획 범위 밖이라 설치하지 않음 |

그 외 선택한 56개 스킬에서는 외부 전송, 자격 증명 접근, 무관한 설정 변경 지시를 찾지 못했다.

## 키워드별 검색 결과

| 키워드 | 찾은 스킬 |
|---|---|
| threejs, webgl | CloudAI-X/threejs-skills 13종, openai `three-webgl-game`, opusgamelabs `threejs-game` |
| react-three-fiber | EnzeD/r3f-skills, CloudAI-X `threejs-react-three-fiber`, openai `react-three-fiber-game` |
| shader, glsl | `threejs-shaders`, `threejs-aaa-graphics-builder`(shader-cookbook), `r3f-shaders` |
| game development | `threejs-game-director`, `threejs-gameplay-systems`, `web-game-foundations`, `game-architecture` |
| game design | `game-designer`, `threejs-gameplay-systems`(genre-design, game-feel) |
| particles, vfx | `threejs-aaa-graphics-builder`(technical-art), `threejs-performance` |
| post-processing | `threejs-postprocessing`, `r3f-postprocessing` |
| animation | `threejs-animation`, `r3f-animation` |
| gsap | greensock/gsap-skills 5종 (공식) |
| audio, web audio | `game-audio`, `add-audio` |
| performance optimization | `threejs-performance`, `threejs-perf`, `performance`, `core-web-vitals` |
| frontend design | `frontend-design`, `web-design-guidelines` |
| ui ux | `ui-ux-pro-max`, `game-ui-frontend`, `threejs-game-ui-designer` |
| typescript | `typescript-magician` |
| vite | `vite`, `vitest` |
| testing, playwright | `webapp-testing`, `playwright-cli`, `playwright`, `game-playtest`, `game-qa`, `threejs-qa-release` |
| pixel art | `sprite-pipeline`, `game-assets` |
| 3d assets, gltf | `threejs-loaders`, `threejs-asset-pipeline`, `web-3d-asset-pipeline`, `game-3d-assets` |

## 설치 목록 (56개)

적용 표시: ● 이 프로젝트에서 지침을 읽고 따름 / ○ 참고용 / × 이 환경에서는 쓸 수 없어 미적용

### Three.js 코어 — CloudAI-X/threejs-skills @0e18186 (MIT)

| 스킬 | 쓰는 곳 | 적용 |
|---|---|---|
| threejs-fundamentals | 렌더러·씬·카메라·리사이즈 (`src/core`) | ● |
| threejs-animation | AnimationMixer, 스키닝, 버텍스 애니메이션 텍스처 베이킹 | ● |
| threejs-loaders | GLTFLoader, 지연 로딩, 로딩 화면 | ● |
| threejs-materials | 톤 통일용 머티리얼 팩토리 | ● |
| threejs-lighting | 낮(따뜻한 햇빛)·밤(달빛, 가로등) 조명 | ● |
| threejs-shaders | 히트 플래시, 충격파 링, 프레넬 오라, 트레일 | ● |
| threejs-postprocessing | EffectComposer 패스 순서, Bloom, 커스텀 패스 | ● |
| threejs-performance | InstancedMesh, 드로우콜 예산 | ● |
| threejs-asset-pipeline | GLB 정리, 압축 방침 | ● |
| threejs-geometry | 프로시저럴 메시(이펙트, 대체 모델) | ● |
| threejs-textures | 파티클·데미지 숫자 아틀라스, 색공간 | ● |
| threejs-interaction | 낮 파트 클릭 상호작용 | ○ |
| threejs-react-three-fiber | R3F 미사용 | × |

### Three.js 게임 제작 — majidmanzarpour/threejs-game-skills @8286774 (MIT)

| 스킬 | 쓰는 곳 | 적용 |
|---|---|---|
| threejs-game-director | 전체 진행 순서, 진행 기록, 검증 책임 | ● |
| threejs-gameplay-systems | 디자인 브리프, 코어 루프, **game-feel.md(타격감)**, 웨이브 설계 | ● |
| threejs-aaa-graphics-builder | 그래픽 패스 순서(형태→머티리얼→조명→이펙트), 셰이더 쿡북 | ● |
| threejs-game-ui-designer | HUD·메뉴·터치 UI | ● |
| threejs-debug-profiler | 빈 캔버스·런타임 오류 진단 | ● |
| threejs-qa-release | 브라우저 QA, 캔버스 픽셀 확인, 프로덕션 빌드 | ● |

### 게임 스튜디오 — openai/plugins (game-studio) @d420d13 (저장소 루트에 라이선스 파일 없음)

| 스킬 | 쓰는 곳 | 적용 |
|---|---|---|
| three-webgl-game | 순수 three.js 런타임 구조(시뮬레이션 상태와 렌더 분리, DOM UI) | ● |
| web-game-foundations | 공통 아키텍처 | ● |
| game-ui-frontend | 게임 UI 방향 | ● |
| game-playtest | 플레이테스트 절차 | ● |
| web-3d-asset-pipeline | 3D 에셋 파이프라인 | ● |
| react-three-fiber-game | R3F 미사용 | × |
| sprite-pipeline | 2D 스프라이트(픽셀 아트) | ○ |

### 게임 크리에이터 — opusgamelabs/game-creator @53676bd (스킬별 frontmatter에 MIT)

| 스킬 | 쓰는 곳 | 적용 |
|---|---|---|
| threejs-game | 이벤트 기반 모듈 구조 | ● |
| threejs-perf | 움직이는 개체 인스턴싱(적 300+), 헤드리스 측정 주의점 | ● |
| game-architecture | 상태·이벤트 버스 구조 | ● |
| game-designer | 밸런스, 진행 곡선 | ● |
| game-audio | Web Audio 절차적 BGM 시퀀서와 SFX | ● |
| add-audio | 게임 이벤트와 사운드 연결 | ● |
| game-qa | QA 체크리스트 | ● |
| game-3d-assets | 3D 에셋 출처 가이드 | ○ |
| game-assets | 픽셀 아트 스프라이트 | ○ |

### GSAP — greensock/gsap-skills @aed9cfd (MIT, 공식)

| 스킬 | 쓰는 곳 | 적용 |
|---|---|---|
| gsap-core | 트윈, 이징 | ● |
| gsap-timeline | 컷씬 타임라인, 포지션 파라미터 | ● |
| gsap-performance | 트윈 성능 | ● |
| gsap-utils | 유틸(clamp, mapRange 등) | ○ |
| gsap-react | React 연동 | ○ |

### R3F — EnzeD/r3f-skills @4a11805 (저장소 루트에 라이선스 파일 없음)

| 스킬 | 쓰는 곳 | 적용 |
|---|---|---|
| r3f-fundamentals, r3f-postprocessing, r3f-shaders, r3f-animation | R3F를 받을 수 없어 순수 three.js로 대체. 나중에 R3F로 옮길 때 참고 | × |

### 웹 품질·프론트엔드·도구

| 스킬 | 출처 | 쓰는 곳 | 적용 |
|---|---|---|---|
| performance | addyosmani/web-quality-skills @afa8da9 (MIT) | 초기 로딩, 번들 크기 | ● |
| core-web-vitals | 〃 | 로딩 지표 | ○ |
| vercel-react-best-practices (react-best-practices) | vercel-labs/agent-skills @1a2c79d | HUD 리렌더 최소화 | ● |
| web-design-guidelines | 〃 | UI 접근성 점검 | ○ |
| frontend-design | anthropics/skills @e4bb5d9 | 타이틀·HUD 비주얼 방향 | ● |
| webapp-testing | 〃 | Playwright로 실행 확인·스크린샷 | ● |
| ui-ux-pro-max | nextlevelbuilder/ui-ux-pro-max-skill @e59ff37 (MIT) | UI 스타일 참고 | ○ |
| typescript-magician | mcollina/skills @c75d70d (MIT) | strict 타입 설계 | ● |
| vite | antfu/skills @4a6bb39 (MIT) | Vite를 받을 수 없어 esbuild로 대체 | × |
| vitest | 〃 | 미사용 | × |
| playwright-cli | microsoft/playwright-cli @b217248 (Apache-2.0) | E2E 흐름 | ● |
| playwright | openai/skills @49f948f | 〃 | ○ |

## 이 환경에서 기획서 스택과 달라진 점

| 기획서 | 실제 | 이유 |
|---|---|---|
| Vite | esbuild (개발 서버·번들) | npm 설치 불가. esbuild는 이미 설치돼 있음 |
| @react-three/fiber, drei | 순수 three.js + React DOM UI | R3F는 GitHub에 빌드 산출물이 없고 react-reconciler를 받을 수 없음 |
| @react-three/postprocessing | three.js 내장 EffectComposer + 커스텀 패스 | 위와 같음 |
| three.quarks | 자체 GPU 인스턴싱 파티클 시스템 | npm 전용 |
| Theatre.js | GSAP 타임라인 | 기획서가 허용한 대안 |
| gltf-transform | 자체 스크립트 `scripts/pack-assets.mjs` (쓰는 애니메이션만 남기고, 키트 모델을 한 파일로 묶음). Draco·Meshopt·KTX2 압축은 없음 | npm 전용 |
| r3f-perf | three.js `renderer.info` + 자체 프레임 측정 (게임 안 F3, `tests/perf.mjs`) | npm 전용 |
| (기획서에 없음) | three.js 애드온의 meshoptimizer 단순화기로 적 메시 LOD 생성 | 삼각형 수 병목 해결 (`docs/PERF.md`) |

# 크레딧

이 프로젝트의 외부 에셋은 모두 공개 GitHub 저장소에서 받았다. 저장소의 라이선스 파일을 직접 확인했고, 받은 커밋을 함께 적는다.
원본은 `scripts/pack-assets.mjs`로 가공해 `public/assets/<출처>/`에 넣는다(가공 내용은 표 아래 참고).

## 3D 모델

| 에셋 | 쓰는 곳 | 작가 | 라이선스 | 출처 (커밋) |
|---|---|---|---|---|
| KayKit City Builder Bits 1.0 | 밤 동네: 도로, 건물, 가로등, 자동차, 벤치, 소화전 | Kay Lousberg | CC0 1.0 | https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0 (6397691) |
| KayKit Furniture Bits 1.0 | 낮 집 안: 소파, 침대, 탁자, 선반, 스탠드, 러그 | Kay Lousberg | CC0 1.0 | https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0 (96d5930) |
| KayKit Halloween Bits 1.0 | 마당·동네 소품: 나무, 울타리, 호박, 묘비, 등불. 호박·해골 몬스터 | Kay Lousberg | CC0 1.0 | https://github.com/KayKit-Game-Assets/KayKit-Halloween-Bits-1.0 (6dc69bf) |
| KayKit Character Pack: Skeletons 1.0 | 몬스터 4종과 보스 (Minion, Rogue, Warrior, Mage) | Kay Lousberg | CC0 1.0 | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0 (15b62b9) |
| KayKit Character Pack: Adventurers 1.0 | 주인(Mage), 친구(Rogue), 택배 기사(Barbarian), 이웃(Knight). 모자·무기 등 소품은 숨김 | Kay Lousberg | CC0 1.0 | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 (672074b) |
| Fox (glTF Sample Assets) | 주인공 개 "호두", 옆집 고양이(같은 모델을 다시 칠함) | 모델: PixelMannen / 리깅·애니메이션: @tomkranis / glTF 변환: @AsoboStudio, @scurest | 모델 CC0 1.0, 리깅·애니메이션·변환 **CC-BY 4.0** | https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/Fox (f0920f5) |

Fox 원작: https://opengameart.org/content/fox-and-shiba (PixelMannen), https://sketchfab.com/3d-models/low-poly-fox-by-pixelmannen-animated-371dea88d7e04a76af5763f2a36866bc (tomkranis). 게임에서는 텍스처 색을 바꾸고 크기를 조정해 썼다.

## 사운드·스프라이트

| 에셋 | 쓰는 곳 | 작가 | 라이선스 | 출처 (커밋) |
|---|---|---|---|---|
| Starter Kit FPS — sounds, sprites | 타격음, 적 사망음, 발사음, 착지음 / 타격 스프라이트 | Kenney | 에셋 CC0 1.0 (코드 MIT) | https://github.com/KenneyNL/Starter-Kit-FPS (185fd23) |
| Starter Kit 3D Platformer — sounds, sprites | 보석 획득음, 파괴음 / 파티클, 그림자 스프라이트 | Kenney | 에셋 CC0 1.0 (코드 MIT) | https://github.com/KenneyNL/Starter-Kit-3D-Platformer (3fa8a04) |
| Starter Kit City Builder — sounds | UI 클릭음, 동네 환경음 | Kenney | 에셋 CC0 1.0 (코드 MIT) | https://github.com/KenneyNL/Starter-Kit-City-Builder (4535092) |

BGM 4곡(낮, 밤, 보스, 컷씬)과 저음 임팩트·짖는 소리·말소리 비프음 등 나머지 효과음은 외부 음원이 아니라 `src/audio/`의 Web Audio 합성 코드로 만든다.

## 폰트

| 폰트 | 쓰는 곳 | 작가 | 라이선스 | 출처 (커밋) |
|---|---|---|---|---|
| Pretendard (Regular, SemiBold, ExtraBold) | 본문·HUD | Kil Hyung-jin | SIL OFL 1.1 | https://github.com/orioncactus/pretendard (7aeb069) |
| Jua | 제목·강조 | The Jua Project Authors (우아한형제들) | SIL OFL 1.1 | https://github.com/google/fonts/tree/main/ofl/jua (7af0d90) |

게임에 나오는 글자만 남긴 서브셋을 쓴다. OFL의 예약 글꼴 이름 조항에 따라 서브셋 파일의 글꼴 이름은 `HeroSans`, `HeroRound`로 바꿨다.

## 라이브러리

| 라이브러리 | 버전 | 라이선스 | 출처 |
|---|---|---|---|
| three.js | r187 | MIT | https://github.com/mrdoob/three.js |
| meshoptimizer (three.js 애드온에 포함된 단순화기) | three r187 동봉 | MIT | https://github.com/zeux/meshoptimizer |
| GSAP | 3.15.1 | GreenSock Standard "no charge" license (https://gsap.com/standard-license) | https://github.com/greensock/GSAP |
| Howler.js | 2.2.4 | MIT | https://github.com/goldfire/howler.js |
| zustand | 5.1.0 | MIT | https://github.com/pmndrs/zustand |
| React, React DOM | 19.2 | MIT | https://github.com/facebook/react |

## 에셋 가공 내용

- KayKit 환경 키트: `.gltf + .bin`을 텍스처 참조 없는 GLB로 바꾸고 키트별 `.pack` 한 파일로 묶었다. 키트마다 팔레트 텍스처 1장과 머티리얼 1개를 공유한다.
- 캐릭터 GLB: 게임에서 쓰는 애니메이션만 남기고 버퍼를 잘랐다 (예: Skeleton_Minion 4.7MB → 0.7MB).
- Draco/Meshopt/KTX2 압축은 하지 않았다. `gltf-transform`을 받을 수 없는 환경이었고, 모델이 로우폴리라 전체 에셋이 약 12MB다.

## 기획서의 1순위 소스 중 쓰지 못한 것

Quaternius, Poly Pizza, Poly Haven, ambientCG, Freesound, OpenGameArt, Incompetech, Kenney 공식 사이트는 GitHub 밖에 있어 이 작업 환경에서 받을 수 없었다. 그래서 개는 Quaternius 대신 Fox 모델을, 하늘은 HDRI 대신 그라디언트 셰이더를, BGM은 합성 음악을 쓴다.

## 라이선스 전문

`licenses/` 폴더에 폰트의 SIL OFL 1.1 전문(Pretendard, Jua)과 번들에 포함된 MIT 라이브러리(three.js, React, Howler, zustand)의 라이선스 전문을 넣어 두었다.
GSAP 은 자체 "no charge" 표준 라이선스를 따른다: https://gsap.com/standard-license

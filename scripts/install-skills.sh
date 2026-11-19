#!/usr/bin/env bash
# 네트워크가 되는 PC에서 같은 스킬을 공식 CLI로 다시 설치한다.
# 사용: bash scripts/install-skills.sh
set -euo pipefail

add() { npx -y skills add "$1" -a claude-code -y "${@:2}"; }

add vercel-labs/skills --skill find-skills
add CloudAI-X/threejs-skills --skill '*'
add majidmanzarpour/threejs-game-skills \
  --skill threejs-game-director --skill threejs-gameplay-systems \
  --skill threejs-aaa-graphics-builder --skill threejs-game-ui-designer \
  --skill threejs-debug-profiler --skill threejs-qa-release
add openai/plugins \
  --skill three-webgl-game --skill web-game-foundations --skill game-ui-frontend \
  --skill game-playtest --skill web-3d-asset-pipeline --skill react-three-fiber-game \
  --skill sprite-pipeline
add opusgamelabs/game-creator \
  --skill threejs-game --skill threejs-perf --skill game-architecture \
  --skill game-designer --skill game-audio --skill add-audio --skill game-qa \
  --skill game-3d-assets --skill game-assets
add greensock/gsap-skills \
  --skill gsap-core --skill gsap-timeline --skill gsap-performance \
  --skill gsap-utils --skill gsap-react
add EnzeD/r3f-skills \
  --skill r3f-fundamentals --skill r3f-postprocessing --skill r3f-shaders --skill r3f-animation
add addyosmani/web-quality-skills --skill performance --skill core-web-vitals
add vercel-labs/agent-skills --skill vercel-react-best-practices --skill web-design-guidelines
add anthropics/skills --skill frontend-design --skill webapp-testing
add nextlevelbuilder/ui-ux-pro-max-skill --skill ui-ux-pro-max
add mcollina/skills --skill typescript-magician
add antfu/skills --skill vite --skill vitest
add microsoft/playwright-cli --skill playwright-cli
add openai/skills --skill playwright

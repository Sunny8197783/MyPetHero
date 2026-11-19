// 성능 측정: 적 수를 늘려 가며 시뮬레이션 비용(CPU)과 드로우콜·삼각형·메모리 지표를 기록한다.
//   node tests/perf.mjs [품질=medium]
// 헤드리스 Chrome 은 GPU 없이 소프트웨어(SwiftShader)로 그리므로 fps 는 믿을 수 없다. CPU 쪽 지표만 본다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openGame } from '../scripts/shot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quality = process.argv[2] ?? 'medium';
const { page, errors, close } = await openGame({ query: `night=7&stats=60&q=${quality}`, width: 1280, height: 720 });
await page.waitForFunction(() => window.__game.getGame().screen === 'night', null, { timeout: 120000 });
const rows = [];
for (const target of [100, 200, 300, 450]) {
  const row = await page.evaluate(async (target) => {
    const g = window.__game;
    const n = g.director.night;
    n.god = true;
    n.debug.bot(true);
    if (n.weapons.owned.length < 5) for (const id of ['tail', 'laser', 'bone', 'paw']) n.debug.give(id, 5);
    n.debug.skipTo(5);
    while (n.enemies.count < target) n.debug.spawn(Math.min(40, target - n.enemies.count), ['minion', 'rogue', 'warrior', 'mage'][n.enemies.count % 4]);
    // 시뮬레이션만 300틱 돌려 틱당 CPU 시간을 잰다(적 수를 유지).
    const times = [];
    for (let k = 0; k < 300; k++) {
      while (n.enemies.count < target) n.debug.spawn(target - n.enemies.count, 'minion');
      const t0 = performance.now();
      g.engine.simulate(1 / 60, 1 / 60);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    await new Promise((r) => setTimeout(r, 1200));
    const st = g.engine.stats;
    return {
      enemies: n.enemies.count,
      simMedianMs: +times[150].toFixed(2),
      simP95Ms: +times[285].toFixed(2),
      drawCalls: st.drawCalls,
      triangles: st.triangles,
      geometries: st.geometries,
      textures: st.textures,
      particles: n.particles.count,
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    };
  }, target);
  rows.push(row);
}
console.table(rows);
fs.writeFileSync(path.join(root, 'artifacts', `perf-${quality}.json`), JSON.stringify(rows, null, 2));
console.log(errors.length ? errors.slice(0, 5).join('\n') : 'no console errors');
await close();

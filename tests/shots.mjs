// 밤 전투의 주요 장면을 스크린샷으로 남긴다(레벨업, 보스 등장, 진화 무기, 각성, 새벽).
//   node tests/shots.mjs [품질=medium] [밤=4]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openGame } from '../scripts/shot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quality = process.argv[2] ?? 'medium';
const night = process.argv[3] ?? '4';
const out = (n) => path.join(root, 'artifacts', 'screens', `night-${n}.png`);
const { page, errors, close } = await openGame({ query: `night=${night}&stats=45&q=${quality}`, width: 1280, height: 720 });
await page.waitForFunction(() => window.__game.getGame().screen === 'night', null, { timeout: 120000 });
const run = (fn, arg) => page.evaluate(fn, arg);
const info = {};

// 1) 레벨업 카드
await run(() => { const n = window.__game.director.night; n.god = true; n.debug.xp(60); window.__game.engine.simulate(0.2); });
await page.waitForTimeout(1200);
await page.screenshot({ path: out('levelup') });
await run(() => { const n = window.__game.director.night; for (let k = 0; k < 12; k++) n.choose(0); });

// 2) 진화 무기 + 적 300마리
await run(() => {
  const n = window.__game.director.night;
  for (const id of ['bark', 'tail', 'laser', 'bone', 'paw']) { n.debug.give(id, 5); n.debug.evolve(id); }
  n.debug.bot(true);
  n.debug.spawn(330, 'minion'); n.debug.spawn(40, 'warrior'); n.debug.spawn(30, 'mage');
  window.__game.engine.simulate(3.2);
});
await page.waitForTimeout(1500);
info.crowd = await run(() => { const s = window.__game.engine.stats; return { enemies: window.__game.director.night.enemies.count, updateMs: +s.updateMs.toFixed(2), drawCalls: s.drawCalls, triangles: s.triangles, particles: window.__game.director.night.particles.count }; });
await page.screenshot({ path: out('evolved') });

// 3) 각성
await run(() => { const n = window.__game.director.night; n.god = false; n.debug.hurt(n.player.hp * 0.8); window.__game.engine.simulate(0.5); });
await page.waitForTimeout(900);
await page.screenshot({ path: out('awaken') });
await run(() => { window.__game.director.night.god = true; });

// 4) 보스 등장
await run(() => { const n = window.__game.director.night; n.debug.killAll(); n.debug.skipTo(127.9); window.__game.engine.simulate(0.3); });
await page.waitForTimeout(1300);
await page.screenshot({ path: out('bossintro') });
await page.waitForTimeout(2500);
await run(() => window.__game.engine.simulate(6));
await page.waitForTimeout(700);
await page.screenshot({ path: out('boss') });
info.boss = await run(() => window.__game.director.night.debug.state().boss);

// 5) 새벽 귀가
await run(() => { const n = window.__game.director.night; n.debug.skipTo(180); window.__game.engine.simulate(1.5); });
await page.waitForTimeout(1500);
await page.screenshot({ path: out('dawn') });

console.log(JSON.stringify(info));
console.log(errors.length ? `콘솔 오류:\n${errors.slice(0, 8).join('\n')}` : 'no console errors');
await close();

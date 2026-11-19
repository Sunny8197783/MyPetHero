// 밸런스 점검: 봇이 1~7밤을 플레이한 결과를 표로 출력한다. (스탯은 그 날짜쯤의 평균적인 성장치로 가정)
//   node tests/balance.mjs [스탯 증가폭=8]
import { openGame } from '../scripts/shot.mjs';

const per = Number(process.argv[2] ?? 8);
const rows = [];
for (let night = 1; night <= 7; night++) {
  const stats = 10 + per * (night - 1);
  const { page, errors, close } = await openGame({ query: `night=${night}&stats=${stats}&bot=1&q=low`, width: 480, height: 270 });
  await page.waitForFunction(() => window.__game.getGame().screen === 'night', null, { timeout: 120000 });
  const r = await page.evaluate(async () => {
    const g = window.__game;
    g.director.night.debug.bot(true);
    let peak = 0;
    let minHp = 1e9;
    let worst = 0;
    for (let k = 0; k < 400 && g.getGame().screen === 'night'; k++) {
      const t0 = performance.now();
      g.engine.simulate(1);
      worst = Math.max(worst, (performance.now() - t0) / 30);
      const n = g.director.night;
      if (!n) break;
      peak = Math.max(peak, n.enemies.count);
      minHp = Math.min(minHp, n.player.hp / n.player.maxHp);
    }
    const res = g.getGame().result;
    return { peak, minHp: Math.round(minHp * 100), worstTickMs: +worst.toFixed(2), res };
  });
  const x = r.res ?? {};
  rows.push({ night, stats, kills: x.kills, level: x.level, boss: x.bossKilled ? '처치' : '놓침', ko: x.knockedOut ? '기절' : '', dmg: x.damageTaken, minHp: `${r.minHp}%`, peak: r.peak, tickMs: r.worstTickMs, sus: x.suspicionDelta, err: errors.length });
  await close();
}
console.table(rows);

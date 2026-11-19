// 캠페인 완주 테스트: 새 게임 → 7일(낮 행동 + 밤 전투) → 엔딩 → 랭킹 등록까지 한 번에 진행한다.
//   node tests/campaign.mjs        (먼저 npm run build)
// 낮은 화면의 행동 카드를 실제로 누르고, 밤은 봇이 조작하며 렌더 없이 빨리 감는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openGame } from '../scripts/shot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.join(root, 'artifacts', 'screens');
fs.mkdirSync(shots, { recursive: true });
const { page, errors, close } = await openGame({ query: 'q=low', width: 960, height: 540 });
const log = [];
const step = (s) => {
  log.push(s);
  console.log(`· ${s}`);
};
const game = () => page.evaluate(() => {
  const g = window.__game.getGame();
  return { screen: g.screen, day: g.day, c: g.campaign, levelUp: !!g.levelUp };
});
const passCutscenes = async (next, timeout = 120000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const { screen } = await game();
    if (next.includes(screen)) return screen;
    if (screen === 'closecall') {
      await page.evaluate(() => {
        const cc = window.__game.getGame().closeCall;
        if (cc && !cc.feedback) window.__game.director.closeCallPick(cc.options.findIndex((o) => o.good));
      });
    } else {
      await page.evaluate(() => {
        const skip = document.getElementById('btn-skip');
        if (skip) skip.click();
        else document.getElementById('dialogue')?.click();
      });
    }
    await page.waitForTimeout(120);
  }
  throw new Error(`컷씬이 끝나지 않음 (기다린 화면: ${next})`);
};

const ROTATION = ['walk', 'train', 'pet', 'tug', 'meal', 'fetch', 'pet', 'run', 'tv'];
let turn = 0;
/** 하루치 낮 행동. 피로가 높으면 낮잠, 아니면 돌아가며 고른다. 더 고를 게 없으면 잠자리에 든다. */
async function playDay() {
  let acted = 0;
  for (let guard = 0; guard < 200; guard++) {
    const g = await game();
    if (g.screen !== 'day') return acted;
    if (g.day.event && !g.day.eventResult) await page.evaluate(() => window.__game.director.chooseEvent(0));
    else if (g.day.popup) await page.click('#btn-popup');
    else if (!g.day.busy) {
      const open = await page.$$eval('.action:not(.blocked)', (els) => els.map((e) => e.dataset.action));
      if (!open.length) break;
      let id = g.c.stats.fatigue >= 55 && open.includes('nap') ? 'nap' : null;
      for (let k = 0; !id && k < ROTATION.length; k++) {
        const cand = ROTATION[(turn + k) % ROTATION.length];
        if (open.includes(cand)) {
          id = cand;
          turn += k + 1;
        }
      }
      await page.click(`[data-action=${id ?? open[0]}]`);
      acted++;
    }
    await page.waitForTimeout(200);
  }
  await page.click('#btn-sleep');
  return acted;
}

let ok = false;
try {
  await page.waitForFunction(() => window.__game?.getGame().loading.done && window.__game.getGame().screen === 'title', null, { timeout: 120000 });
  await page.evaluate(() => {
    localStorage.removeItem('herodog.rank.v1');
    window.__game.gsap.globalTimeline.timeScale(8);
  });
  await page.click('#btn-new');
  await passCutscenes(['day']);
  const nights = await page.evaluate(() => window.__game.getGame().campaign && 7);
  for (let day = 1; day <= nights; day++) {
    const acted = await playDay();
    await passCutscenes(['night']);
    await page.evaluate(() => window.__game.director.night.debug.bot(true));
    for (let k = 0; k < 80; k++) {
      if ((await game()).screen !== 'night') break;
      await page.evaluate(() => window.__game.engine.simulate(6));
      await page.waitForTimeout(30);
    }
    await page.waitForFunction(() => window.__game.getGame().screen === 'result', null, { timeout: 30000 });
    const r = await page.evaluate(() => window.__game.getGame().result);
    const c = (await game()).c;
    step(`${day}일째: 낮 행동 ${acted}회 → 밤 처치 ${r.kills}, Lv.${r.level}, 보스 ${r.bossKilled ? '처치' : '놓침'}${r.knockedOut ? ', 기절' : ''}, 의심도 ${c.suspicion} (이번 밤 ${r.suspicionDelta >= 0 ? '+' : ''}${r.suspicionDelta}) (근력 ${c.stats.strength}, 유대감 ${c.stats.bond})`);
    await page.waitForTimeout(300);
    await page.click('#btn-result');
    const next = await passCutscenes(['day', 'ending'], 180000);
    if (day < nights && next !== 'day') throw new Error(`${day}일째 뒤에 낮으로 돌아오지 않음: ${next}`);
    if (day < nights) {
      const d = (await game()).c.day;
      if (d !== day + 1) throw new Error(`날짜가 맞지 않음: ${d}`);
    }
  }
  const end = await page.evaluate(() => {
    const g = window.__game.getGame();
    return { screen: g.screen, ending: g.ending, score: g.campaign.score, kills: g.campaign.totalKills, bosses: g.campaign.bossKills, ranking: JSON.parse(localStorage.getItem('herodog.rank.v1') ?? '[]'), save: localStorage.getItem('herodog.save.v1') };
  });
  if (end.screen !== 'ending') throw new Error(`엔딩 화면이 아님: ${end.screen}`);
  if (!end.ranking.length) throw new Error('랭킹에 기록되지 않음');
  if (end.save) throw new Error('완주 뒤에도 세이브가 남아 있음');
  step(`엔딩: ${end.ending} · 점수 ${end.score} · 총 처치 ${end.kills} · 보스 ${end.bosses}/7 · 랭킹 ${end.ranking.length}건`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(shots, 'campaign-ending.png') });
  await page.click('#btn-title');
  await page.waitForFunction(() => window.__game.getGame().screen === 'title', null, { timeout: 30000 });
  step('타이틀로 복귀');
  ok = errors.length === 0;
} catch (e) {
  console.error('실패:', e.message);
  await page.screenshot({ path: path.join(shots, 'campaign-failure.png') }).catch(() => undefined);
}
if (errors.length) console.error(`콘솔 오류 ${errors.length}건:\n${errors.slice(0, 10).join('\n')}`);
fs.writeFileSync(path.join(root, 'artifacts', 'campaign-log.txt'), `${ok ? 'PASS' : 'FAIL'}\n${log.join('\n')}\n${errors.join('\n')}\n`);
console.log(ok ? '\nCAMPAIGN PASS' : '\nCAMPAIGN FAIL');
await close();
process.exit(ok ? 0 : 1);

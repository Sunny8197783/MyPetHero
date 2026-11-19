// 기본 플로우 E2E: 타이틀 → 프롤로그 → 낮(행동, 이벤트) → 저녁 → 밤(봇 플레이) → 결과 → 다음 날 아침.
//   node tests/e2e.mjs            (먼저 npm run build)
// 헤드리스 Chrome 은 소프트웨어 렌더링이라 느리다. 그래서 낮은 품질 + 작은 화면으로 띄우고,
// 연출(GSAP)은 배속으로, 밤 전투는 렌더 없이 시뮬레이션만 빨리 감는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openGame } from '../scripts/shot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.join(root, 'artifacts', 'screens');
fs.mkdirSync(shots, { recursive: true });

const { page, errors, close } = await openGame({ query: 'q=low', width: 960, height: 540 });
const log = [];
const step = (name) => {
  log.push(name);
  console.log(`· ${name}`);
};
const screen = () => page.evaluate(() => window.__game.getGame().screen);
const waitScreen = async (want, timeout = 60000) => {
  await page.waitForFunction((w) => w.includes(window.__game.getGame().screen), [].concat(want), { timeout });
};
const shot = (name) => page.screenshot({ path: path.join(shots, `e2e-${name}.png`) });
/** 컷씬을 건너뛴다(스킵 버튼이 없으면 대사를 눌러 넘긴다). next 화면이 될 때까지 반복. */
const passCutscenes = async (next, timeout = 90000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const s = await screen();
    if ([].concat(next).includes(s)) return;
    if (s === 'closecall') {
      // 시치미 떼기: 올바른 답을 고른다.
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
    await page.waitForTimeout(150);
  }
  throw new Error(`컷씬이 끝나지 않음 (기다린 화면: ${next}, 현재: ${await screen()})`);
};

let ok = false;
try {
  await waitScreen('title', 90000);
  await page.waitForFunction(() => window.__game.getGame().loading.done);
  await page.evaluate(() => window.__game.gsap.globalTimeline.timeScale(6));
  step('타이틀 화면');
  await shot('01-title');

  await page.click('#btn-new');
  await passCutscenes('day');
  step('프롤로그·첫 각성 컷씬 통과 → 1일째 낮');
  await page.waitForTimeout(800);
  await shot('02-day');

  // 낮 행동 3개 (이벤트가 끼어들면 첫 선택지를 고른다)
  for (const id of ['meal', 'tug', 'pet']) {
    await page.waitForSelector(`[data-action=${id}]`, { timeout: 30000 });
    await page.click(`[data-action=${id}]`);
    await page.waitForSelector('#btn-popup', { timeout: 60000 });
    if (id === 'tug') await shot('03-day-popup');
    await page.click('#btn-popup');
    await page.waitForTimeout(400);
    // 이벤트 처리
    for (let k = 0; k < 40; k++) {
      const d = await page.evaluate(() => window.__game.getGame().day);
      if (d.event && !d.eventResult) {
        step(`일상 이벤트: ${d.event.title}`);
        await shot('04-day-event');
        await page.evaluate(() => window.__game.director.chooseEvent(0));
      } else if (d.popup) {
        await page.click('#btn-popup');
      } else if (!d.busy) break;
      await page.waitForTimeout(300);
    }
  }
  const c1 = await page.evaluate(() => window.__game.getGame().campaign);
  if (c1.hour <= 8) throw new Error('낮 행동 후 시간이 흐르지 않음');
  if (c1.stats.strength <= 10) throw new Error('터그놀이 후 근력이 오르지 않음');
  step(`낮 행동 3회 완료 (시각 ${c1.hour}시, 근력 ${c1.stats.strength}, 유대감 ${c1.stats.bond})`);

  await page.click('#btn-sleep');
  await passCutscenes('night');
  step('저녁·출동 컷씬 통과 → 1번째 밤');
  await page.evaluate(() => window.__game.director.night.debug.bot(true));
  await page.evaluate(() => window.__game.engine.simulate(40));
  await page.waitForTimeout(1500);
  await shot('05-night');
  const mid = await page.evaluate(() => window.__game.director.night.debug.state());
  if (mid.kills <= 0) throw new Error('밤 40초 동안 처치가 없음');
  step(`밤 40초: 처치 ${mid.kills}, 레벨 ${mid.level}, 무기 ${mid.weapons.join(' ')}`);

  // 새벽까지 빨리 감기
  for (let k = 0; k < 40; k++) {
    if ((await screen()) === 'result') break;
    await page.evaluate(() => window.__game.engine.simulate(8));
    await page.waitForTimeout(60);
  }
  await waitScreen('result', 20000);
  const result = await page.evaluate(() => window.__game.getGame().result);
  step(`결과 화면: 처치 ${result.kills}, 보스 ${result.bossKilled ? '처치' : '놓침'}, 의심도 ${result.suspicionDelta >= 0 ? '+' : ''}${result.suspicionDelta}`);
  await page.waitForTimeout(500);
  await shot('06-result');

  await page.click('#btn-result');
  await passCutscenes('day');
  const c2 = await page.evaluate(() => window.__game.getGame().campaign);
  if (c2.day !== 2) throw new Error(`2일째가 아님: ${c2.day}`);
  step(`아침 컷씬 통과 → ${c2.day}일째 낮 (의심도 ${c2.suspicion}, 누적 처치 ${c2.totalKills})`);
  await page.waitForTimeout(600);
  await shot('07-day2');

  // 세이브가 남았는지 확인
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('herodog.save.v1') ?? 'null'));
  if (!saved || saved.day !== 2) throw new Error('세이브 데이터가 없음');
  step('세이브 확인 (2일째)');
  ok = errors.length === 0;
} catch (e) {
  console.error('실패:', e.message);
  await shot('99-failure').catch(() => undefined);
}
if (errors.length) console.error(`콘솔 오류 ${errors.length}건:\n${errors.slice(0, 10).join('\n')}`);
fs.writeFileSync(path.join(root, 'artifacts', 'e2e-log.txt'), `${ok ? 'PASS' : 'FAIL'}\n${log.join('\n')}\n${errors.join('\n')}\n`);
console.log(ok ? '\nE2E PASS' : '\nE2E FAIL');
await close();
process.exit(ok ? 0 : 1);

// 컷씬 스모크 테스트: 모든 컷씬 스크립트를 배속으로 끝까지 재생해 런타임 오류가 없는지 확인한다.
//   node tests/cutscenes.mjs [스크린샷을 찍을 컷씬 이름들]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openGame } from '../scripts/shot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const want = new Set(process.argv.slice(2));
const { page, errors, close } = await openGame({ query: 'q=low', width: 960, height: 540 });
await page.waitForFunction(() => window.__game.getGame().screen === 'title' && window.__game.getGame().loading.done, null, { timeout: 90000 });
await page.evaluate(() => window.__game.gsap.globalTimeline.timeScale(10));
const names = await page.evaluate(() => Object.keys(window.__game.director.debugCutscenes()));
let failed = 0;
for (const name of names) {
  const done = page.evaluate((n) => window.__game.director.debugPlayCutscene(n).then(() => 'ok', (e) => `ERR ${e.message}`), name);
  let lines = 0;
  let result = null;
  let captured = false;
  done.then((r) => (result = r));
  const t0 = Date.now();
  while (result === null && Date.now() - t0 < 120000) {
    const hasLine = await page.evaluate(() => !!document.getElementById('dialogue'));
    if (hasLine) {
      lines++;
      if (want.has(name) && !captured && lines === 3) {
        await page.waitForTimeout(700);
        await page.screenshot({ path: path.join(root, 'artifacts', 'screens', `cut-${name}.png`) });
        captured = true;
      }
      await page.evaluate(() => {
        document.getElementById('dialogue')?.click();
        document.getElementById('dialogue')?.click();
      });
    }
    await page.waitForTimeout(80);
  }
  const bad = result !== 'ok';
  if (bad) failed++;
  console.log(`${bad ? '✘' : '✔'} ${name} (대사 ${lines}줄) ${bad ? result : ''}`);
}
if (errors.length) console.log(`콘솔 오류:\n${errors.slice(0, 8).join('\n')}`);
console.log(failed === 0 && errors.length === 0 ? '\nCUTSCENES PASS' : '\nCUTSCENES FAIL');
await close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);

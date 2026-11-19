// 타이틀·낮·컷씬에서 셰이더가 NaN/Inf 픽셀을 만드는지 검사한다. (먼저 npm run build)
//   HERO_GL=llvmpipe node tests/nan-story.mjs [품질=medium] [컷씬 이름들…]
// tests/nan.mjs 의 밤 전투 검사와 짝이다. 컷씬을 배속으로 재생하면서 주기적으로 현재 장면의 HDR 버퍼를 읽는다.
import { openGame } from '../scripts/shot.mjs';

const quality = process.argv[2] ?? 'medium';
const only = process.argv.slice(3);
const { page, errors, close } = await openGame({ query: `q=${quality}`, width: 960, height: 540 });
await page.waitForFunction(() => window.__game.getGame().screen === 'title' && window.__game.getGame().loading.done, null, { timeout: 180000 });
const gl = await page.evaluate((quality) => {
  const g = window.__game;
  const r = g.engine.renderer;
  const pf = g.director.postfx;
  if (!pf.composer) return null;
  const RT = pf.composer.renderTarget1.constructor;
  const w = 960;
  const h = 540;
  const rt = new RT(w, h, { type: 1016, samples: quality === 'medium' ? 2 : 0 });
  const buf = new Uint16Array(w * h * 4);
  const scan = (cur) => {
    const prev = r.getRenderTarget();
    r.setRenderTarget(rt);
    r.clear();
    r.render(cur.scene, cur.camera);
    r.setRenderTarget(prev);
    r.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    let bad = 0;
    for (let i = 0; i < buf.length; i++) if (i % 4 !== 3 && ((buf[i] >> 10) & 31) === 31) bad++;
    return bad;
  };
  const c2 = document.createElement('canvas');
  c2.width = 96;
  c2.height = 54;
  const ctx = c2.getContext('2d', { willReadFrequently: true });
  window.__probe = () => {
    const cur = g.engine.current;
    if (!cur) return null;
    const out = { bad: scan(cur), culprits: [], lum: 0 };
    // 화면 밝기는 방금 그린 프레임으로 잰다(후처리 포함).
    pf.render(cur.scene, cur.camera, 0);
    ctx.drawImage(r.domElement, 0, 0, 96, 54);
    const d = ctx.getImageData(0, 0, 96, 54).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
    out.lum = Math.round(s / (96 * 54 * 3));
    if (out.bad && (window.__searched = (window.__searched ?? 0) + 1) <= 4) {
      const meshes = [];
      cur.scene.traverse((o) => {
        if (o.isMesh && o.visible) meshes.push(o);
      });
      for (const m of meshes) {
        m.visible = false;
        const left = scan(cur);
        m.visible = true;
        if (left < out.bad) {
          const mat = Array.isArray(m.material) ? m.material[0] : m.material;
          const path = [];
          for (let p = m; p && p !== cur.scene; p = p.parent) path.unshift(p.name || p.type);
          out.culprits.push(`${path.join('/')} [${mat.type}, ${(m.geometry.index?.count ?? 0) / 3} tris]`);
        }
      }
    }
    return out;
  };
  const dbg = r.getContext().getExtension('WEBGL_debug_renderer_info');
  return dbg ? r.getContext().getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
}, quality);
if (!gl) {
  console.log(`품질 ${quality} 에는 후처리(HDR 버퍼)가 없어 검사할 것이 없습니다.`);
  await close();
  process.exit(0);
}
console.log(`GL: ${gl} · 품질 ${quality}`);
const rows = {};
const culprits = new Map();
const probe = async (label) => {
  const st = await page.evaluate(() => window.__probe());
  if (!st) return;
  const row = (rows[label] ??= { samples: 0, nan: 0, minLum: 255 });
  row.samples++;
  if (st.bad) row.nan++;
  row.minLum = Math.min(row.minLum, st.lum);
  for (const c of st.culprits) culprits.set(`${label}: ${c}`, (culprits.get(`${label}: ${c}`) ?? 0) + 1);
};
for (let k = 0; k < 4; k++) {
  await probe('title');
  await page.waitForTimeout(150);
}
await page.evaluate(() => window.__game.gsap.globalTimeline.timeScale(6));
const all = await page.evaluate(() => Object.keys(window.__game.director.debugCutscenes()));
const names = only.length ? all.filter((n) => only.includes(n)) : all;
for (const name of names) {
  let result = null;
  page.evaluate((n) => window.__game.director.debugPlayCutscene(n).then(() => 'ok', (e) => `ERR ${e.message}`), name).then((r) => (result = r));
  const t0 = Date.now();
  while (result === null && Date.now() - t0 < 240000) {
    await probe(name);
    await page.evaluate(() => {
      document.getElementById('dialogue')?.click();
      document.getElementById('dialogue')?.click();
    });
    await page.waitForTimeout(60);
  }
  if (result !== 'ok') console.log(`✘ ${name}: ${result}`);
}
console.table(rows);
if (culprits.size) console.log('NaN 을 만든 메시:\n' + [...culprits].map(([k, v]) => `  ${v}회  ${k}`).join('\n'));
const total = Object.values(rows).reduce((a, r) => a + r.nan, 0);
console.log(errors.length ? errors.slice(0, 5).join('\n') : 'no console errors');
console.log(total === 0 ? '\nNAN STORY CHECK PASS' : '\nNAN STORY CHECK FAIL');
await close();
process.exit(total === 0 ? 0 : 1);

// 셰이더가 NaN/Inf 픽셀을 만드는지 검사한다. (먼저 npm run build)
//   HERO_GL=llvmpipe node tests/nan.mjs [품질=medium] [밤=1]
// 블룸은 HDR 버퍼의 NaN 픽셀 하나를 화면 전체로 퍼뜨려 화면을 검게 만든다. 이런 값은 드라이버마다 생기는 조건이 달라서
// (예: 음수의 pow), SwiftShader 에서는 멀쩡해도 다른 GPU 에서는 터질 수 있다. Mesa llvmpipe 로도 돌려 본다.
// 싸움 → 보스 등장 → 새벽 → 귀가까지 매 프레임 장면 버퍼를 읽어 유한하지 않은 픽셀과 그 픽셀을 그린 메시를 찾는다.
import { openGame } from '../scripts/shot.mjs';

const quality = process.argv[2] ?? 'medium';
const night = process.argv[3] ?? '1';
// --inject: 가로등 빛의 색에 일부러 NaN 을 넣는다. 이때는 NaN 픽셀이 있어도 화면이 검게 되지 않아야 통과.
const inject = process.argv.includes('--inject');
const { page, errors, close } = await openGame({ query: `night=${night}&stats=20&q=${quality}`, width: 960, height: 540 });
await page.waitForFunction(() => window.__game.getGame().screen === 'night', null, { timeout: 120000 });
const gl = await page.evaluate((quality) => {
  const g = window.__game;
  const n = g.director.night;
  n.god = true;
  n.debug.bot(true);
  g.engine.simulate(3);
  n.debug.skipTo(n.def.duration - 9);
  const r = g.engine.renderer;
  const pf = g.director.postfx;
  const RT = pf.composer ? pf.composer.renderTarget1.constructor : null;
  if (!RT) return null;
  const w = 960;
  const h = 540;
  const rt = new RT(w, h, { type: 1016, samples: quality === 'medium' ? 2 : 0 });
  const buf = new Uint16Array(w * h * 4);
  const scan = () => {
    const prev = r.getRenderTarget();
    r.setRenderTarget(rt);
    r.clear();
    r.render(n.scene, n.camera);
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
  window.__frame = () => {
    if (g.getGame().screen !== 'night') return null;
    if (g.getGame().levelUp) n.choose(0);
    g.engine.step(1 / 15);
    ctx.drawImage(r.domElement, 0, 0, 96, 54);
    const d = ctx.getImageData(0, 0, 96, 54).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
    const out = { phase: n.phase, lum: Math.round(s / (96 * 54 * 3)), bad: scan(), culprits: [] };
    // 원인 메시 찾기는 느리므로(메시마다 다시 그림) 처음 몇 프레임만 한다.
    if (out.bad && (window.__searched = (window.__searched ?? 0) + 1) <= 3) {
      const meshes = [];
      n.scene.traverse((o) => {
        if (o.isMesh && o.visible) meshes.push(o);
      });
      for (const m of meshes) {
        m.visible = false;
        const left = scan();
        m.visible = true;
        if (left < out.bad) {
          const mat = Array.isArray(m.material) ? m.material[0] : m.material;
          const path = [];
          for (let p = m; p && p !== n.scene; p = p.parent) path.unshift(p.name || p.type);
          out.culprits.push(`${path.join('/')} [${mat.type}, ${(m.geometry.index?.count ?? 0) / 3} tris, count ${m.count ?? '-'}]`);
        }
      }
    }
    return out;
  };
  const dbg = r.getContext().getExtension('WEBGL_debug_renderer_info');
  return dbg ? r.getContext().getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
}, quality);
if (gl && inject) {
  await page.evaluate(() => {
    window.__game.director.night.scene.traverse((o) => {
      const u = o.material?.uniforms;
      if (u?.uPower && !u.uMap) u.uColor.value.r = NaN;
    });
  });
}
if (!gl) {
  console.log(`품질 ${quality} 에는 후처리(HDR 버퍼)가 없어 검사할 것이 없습니다.`);
  await close();
  process.exit(0);
}
console.log(`GL: ${gl} · 품질 ${quality} · ${night}번째 밤`);
const stats = {};
const culprits = new Map();
for (let f = 0; f < 300; f++) {
  const st = await page.evaluate(() => window.__frame());
  if (!st) break;
  const s = (stats[st.phase] ??= { frames: 0, nan: 0, black: 0 });
  s.frames++;
  if (st.bad) s.nan++;
  if (st.lum < 12) s.black++;
  for (const c of st.culprits) culprits.set(c, (culprits.get(c) ?? 0) + 1);
}
console.table(stats);
if (culprits.size) console.log('NaN 을 만든 메시:\n' + [...culprits].map(([k, v]) => `  ${v}프레임  ${k}`).join('\n'));
const total = Object.values(stats).reduce((a, s) => a + (inject ? 0 : s.nan) + s.black, 0);
if (inject && !Object.values(stats).some((s) => s.nan > 0)) console.log('주의: 주입한 NaN 이 화면에 잡히지 않았습니다(가로등이 화면 밖).');
console.log(errors.length ? errors.slice(0, 5).join('\n') : 'no console errors');
console.log(total === 0 ? '\nNAN CHECK PASS' : '\nNAN CHECK FAIL');
await close();
process.exit(total === 0 ? 0 : 1);

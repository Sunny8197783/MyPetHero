// 헤드리스 Chrome 으로 빌드 결과를 띄워 스크린샷과 콘솔 오류를 확인한다.
//   node scripts/shot.mjs <out.png> [query] [waitMs] [evalJs] [WxH]
// evalJs 는 페이지 안에서 실행할 자바스크립트(표현식 또는 async 본문). 결과는 JSON 으로 출력한다.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { startServer } from './serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const pw = require(
  require.resolve('playwright', { paths: [root, process.env.HERO_NODE_PATH ?? '/opt/npm-tools/node_modules'] }),
);

export const CHROME_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--enable-webgl',
  '--autoplay-policy=no-user-gesture-required',
  '--mute-audio',
];

/**
 * HERO_GL=llvmpipe 로 실행하면 SwiftShader 대신 Mesa llvmpipe(OpenGL ES) 로 그린다.
 * 셰이더 동작이 드라이버마다 다른 문제(NaN 처리 등)를 두 번째 백엔드로 확인할 때 쓴다.
 */
export async function launch() {
  const executablePath = process.env.CHROME_PATH ?? (fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);
  if (process.env.HERO_GL === 'llvmpipe') {
    const args = ['--use-gl=angle', '--use-angle=gl-egl', ...CHROME_ARGS.slice(3)];
    return pw.chromium.launch({ headless: true, executablePath, args, env: { ...process.env, LIBGL_ALWAYS_SOFTWARE: '1', EGL_PLATFORM: 'surfaceless', GALLIUM_DRIVER: 'llvmpipe' } });
  }
  return pw.chromium.launch({ headless: true, executablePath, args: CHROME_ARGS });
}

export async function openGame({ query = '', width = 1280, height = 720, file = 'index.html' } = {}) {
  const { server, port } = await startServer(path.join(root, 'dist'));
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[console] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`[requestfailed] ${r.url()}`));
  await page.goto(`http://127.0.0.1:${port}/${file}${query ? `?${query}` : ''}`);
  const close = async () => {
    await browser.close();
    server.close();
  };
  return { page, errors, close, port };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [out = '/tmp/shot.png', query = '', wait = '1500', evalJs = '', size = '1280x720'] = process.argv.slice(2);
  const [width, height] = size.split('x').map(Number);
  const { page, errors, close } = await openGame({ query, width, height });
  await page.waitForTimeout(Number(wait));
  if (evalJs) {
    const body = evalJs.startsWith('body:') ? evalJs.slice(5) : `return (${evalJs})`;
    const result = await page.evaluate(`(async () => { ${body} })()`);
    console.log('eval:', JSON.stringify(result));
  }
  await page.screenshot({ path: out });
  console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no console errors');
  console.log('saved', out);
  await close();
}

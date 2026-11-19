// 빌드·개발 서버 스크립트 (esbuild).
//   node scripts/build.mjs            → dist/ 에 개발 빌드
//   node scripts/build.mjs --minify   → 프로덕션 빌드
//   node scripts/build.mjs --serve    → 감시 + 로컬 서버 (http://127.0.0.1:5173)
//   node scripts/build.mjs --single   → 에셋까지 한 파일에 넣은 dist/hero-dog.html 추가 생성
//   node scripts/build.mjs --embed    → 바이너리(.glb/.pack)를 올릴 수 없는 호스트용 dist-embed/ 추가 생성
//
// node_modules 가 있으면 그대로 쓰고, 없으면 ../vendor/lib (GitHub 클론)에서 라이브러리를 찾는다.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const TOOL_PATHS = [root, process.env.HERO_NODE_PATH ?? '/opt/npm-tools/node_modules'];
const load = (name) => require(require.resolve(name, { paths: TOOL_PATHS }));
const esbuild = load('esbuild');

const args = new Set(process.argv.slice(2));
const minify = args.has('--minify');
const serve = args.has('--serve');
const single = args.has('--single');
const embed = args.has('--embed');
const dist = path.join(root, 'dist');

const hasNodeModules = fs.existsSync(path.join(root, 'node_modules', 'three'));
const vendor = process.env.HERO_VENDOR ?? path.resolve(root, '..', 'vendor', 'lib');
if (!hasNodeModules && !fs.existsSync(path.join(vendor, 'three'))) {
  console.error('라이브러리를 찾을 수 없습니다. `npm install` 을 먼저 실행하세요.');
  process.exit(1);
}

/** node_modules 가 없을 때 GitHub 클론을 패키지 이름에 연결한다. */
const vendorAlias = hasNodeModules
  ? {}
  : {
      'three/addons': path.join(vendor, 'three', 'examples', 'jsm'),
      three: path.join(vendor, 'three', 'build', 'three.module.js'),
      gsap: path.join(vendor, 'gsap', 'esm', 'index.js'),
      howler: path.join(vendor, 'howler', 'dist', 'howler.js'),
      zustand: path.join(vendor, 'zustand', 'src', 'index.ts'),
    };

const options = {
  absWorkingDir: root,
  entryPoints: { app: 'src/main.tsx' },
  outdir: path.join(dist, 'assets'),
  bundle: true,
  format: 'iife',
  target: ['es2022'],
  platform: 'browser',
  jsx: 'automatic',
  sourcemap: minify ? false : 'linked',
  minify,
  legalComments: 'none',
  alias: vendorAlias,
  nodePaths: hasNodeModules ? [] : [TOOL_PATHS[1]],
  loader: { '.glsl': 'text', '.woff': 'file', '.woff2': 'file', '.ttf': 'file', '.png': 'file' },
  assetNames: '[name]-[hash]',
  define: {
    'process.env.NODE_ENV': JSON.stringify(minify ? 'production' : 'development'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  logLevel: 'info',
  logOverride: { 'package.json': 'silent' },
  metafile: true,
};

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function writeStatic() {
  fs.mkdirSync(dist, { recursive: true });
  fs.copyFileSync(path.join(root, 'index.html'), path.join(dist, 'index.html'));
  copyDir(path.join(root, 'public'), dist);
}

const MIME = {
  '.glb': 'model/gltf-binary',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.json': 'application/json',
};

/** 에셋을 data URI 로 넣어 파일 하나로 실행되는 HTML 을 만든다 (file:// 로 바로 열 수 있다). */
function writeSingleFile() {
  const js = fs.readFileSync(path.join(dist, 'assets', 'app.js'), 'utf8');
  let css = fs.readFileSync(path.join(dist, 'assets', 'app.css'), 'utf8');
  const inline = {};
  const walk = (dir, rel) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const r = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(abs, r);
      else {
        const mime = MIME[path.extname(entry.name).toLowerCase()] ?? 'application/octet-stream';
        inline[`assets/${r}`] = `data:${mime};base64,${fs.readFileSync(abs).toString('base64')}`;
      }
    }
  };
  walk(path.join(root, 'public', 'assets'), '');
  // CSS 가 참조하는 번들 에셋(폰트 등)도 data URI 로 바꾼다.
  css = css.replace(/url\((["']?)\.\/([^)"']+)\1\)/g, (m, _q, file) => {
    const abs = path.join(dist, 'assets', file);
    if (!fs.existsSync(abs)) return m;
    const mime = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    return `url(data:${mime};base64,${fs.readFileSync(abs).toString('base64')})`;
  });
  const html = fs
    .readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace(/<link rel="stylesheet"[^>]*>/, () => `<style>${css}</style>`)
    .replace(
      /<script defer src="[^"]*"><\/script>/,
      () =>
        `<script>window.__INLINE_ASSETS__=${JSON.stringify(inline)};</script>\n<script>${js.replace(/<\/script/g, '<\\/script')}</script>`,
    );
  const out = path.join(dist, 'hero-dog.html');
  fs.writeFileSync(out, html);
  console.log(`single file: ${path.relative(root, out)} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`);
}

/**
 * 임베드용 빌드: 정해진 확장자만 올릴 수 있는 호스트(.glb/.pack 불가)를 위해
 * 바이너리 에셋을 base64 를 담은 JSON 으로 감싼 dist-embed/ 를 만든다. 게임은 window.__ASSET_JSON__ 을 보고 .json 을 받아 푼다.
 */
function writeEmbed() {
  const WRAP = ['.glb', '.pack'];
  const out = path.join(root, 'dist-embed');
  fs.rmSync(out, { recursive: true, force: true });
  let files = 0;
  let bytes = 0;
  const walk = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const r = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(abs, r);
      else if (r !== 'hero-dog.html' && !r.endsWith('.map')) {
        const dest = path.join(out, r);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        if (WRAP.includes(path.extname(r))) fs.writeFileSync(`${dest}.json`, JSON.stringify({ encoding: 'base64', data: fs.readFileSync(abs).toString('base64') }));
        else if (r === 'index.html') fs.writeFileSync(dest, fs.readFileSync(abs, 'utf8').replace('<script defer', `<script>window.__ASSET_JSON__=${JSON.stringify(WRAP)};</script>\n    <script defer`));
        else fs.copyFileSync(abs, dest);
        files++;
        bytes += fs.statSync(WRAP.includes(path.extname(r)) ? `${dest}.json` : dest).size;
      }
    }
  };
  walk(dist, '');
  console.log(`embed build: dist-embed/ (${files} files, ${(bytes / 1048576).toFixed(1)} MB)`);
}

if (serve) {
  writeStatic();
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const port = Number(process.env.PORT ?? 5173);
  await startServer(dist, port);
  console.log(`\n  ➜  http://127.0.0.1:${port}/\n`);
} else {
  fs.rmSync(dist, { recursive: true, force: true });
  writeStatic();
  const result = await esbuild.build(options);
  const outputs = Object.entries(result.metafile.outputs)
    .filter(([f]) => !f.endsWith('.map'))
    .map(([f, o]) => `${path.relative(root, path.join(root, f))} ${(o.bytes / 1024).toFixed(0)}KB`);
  console.log(outputs.join('\n'));
  fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'artifacts', 'bundle-meta.json'), JSON.stringify(result.metafile));
  if (single) writeSingleFile();
  if (embed) writeEmbed();
}

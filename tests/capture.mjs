// 밤 전투를 프레임 단위로 진행하며 캡처해 영상(mp4)과 GIF 로 만든다. (ffmpeg 필요)
//   node tests/capture.mjs [밤=4] [품질=medium] [시작 초=70] [길이 초=7]
// 헤드리스 Chrome 은 실시간으로는 몇 fps 밖에 안 나오므로, 엔진을 1/24초씩 직접 진행시키고 한 장씩 찍는다.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openGame } from '../scripts/shot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const night = Number(process.argv[2] ?? 4);
const quality = process.argv[3] ?? 'medium';
const startAt = Number(process.argv[4] ?? 70);
const seconds = Number(process.argv[5] ?? 7);
const FPS = 24;
const dir = path.join(root, 'artifacts', 'frames');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const { page, errors, close } = await openGame({ query: `night=${night}&stats=${10 + night * 8}&q=${quality}`, width: 960, height: 540 });
await page.waitForFunction(() => window.__game.getGame().screen === 'night', null, { timeout: 120000 });
await page.evaluate((startAt) => {
  const g = window.__game;
  const n = g.director.night;
  n.debug.bot(true);
  for (let t = 0; t < startAt && g.getGame().screen === 'night'; t += 1) g.engine.simulate(1);
}, startAt);
const frames = Math.round(seconds * FPS);
for (let f = 0; f < frames; f++) {
  await page.evaluate((dt) => window.__game.engine.step(dt), 1 / FPS);
  await page.screenshot({ path: path.join(dir, `f${String(f).padStart(4, '0')}.png`) });
}
const state = await page.evaluate(() => window.__game.director.night?.debug.state());
console.log(`captured ${frames} frames`, JSON.stringify({ kills: state?.kills, level: state?.level, enemies: state?.enemies }), errors.length ? errors.slice(0, 3) : 'no console errors');
await close();

const out = path.join(root, 'artifacts', `gameplay-night${night}`);
const input = ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%04d.png')];
execFileSync('ffmpeg', [...input, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', `${out}.mp4`]);
execFileSync('ffmpeg', [...input, '-vf', 'fps=12,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', `${out}.gif`]);
for (const ext of ['mp4', 'gif']) console.log(`${out}.${ext}`, Math.round(fs.statSync(`${out}.${ext}`).size / 1024) + 'KB');
fs.rmSync(dir, { recursive: true, force: true });

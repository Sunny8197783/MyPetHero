// 에셋 파이프라인 (gltf-transform 대체, 의존성 없음).
//   node scripts/pack-assets.mjs
// GitHub 에서 받은 원본(기본 ../vendor/assets-src)을 읽어 public/assets/<출처>/ 로 정리한다.
//  - KayKit 키트(.gltf + .bin): 텍스처 참조를 떼어 낸 GLB 로 바꾼 뒤 키트별 .pack 한 파일로 묶는다.
//    (키트마다 팔레트 텍스처 1장을 공유하므로 런타임에 공유 머티리얼 1개를 입힌다)
//  - 캐릭터 GLB: 쓰는 애니메이션만 남기고 나머지 버퍼를 잘라 낸다 (4.7MB → 수백 KB).
//  - 사운드, 폰트: 그대로 복사하거나 쓰는 글자만 남긴다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.HERO_ASSET_SRC ?? path.resolve(root, '..', 'vendor', 'assets-src');
const OUT = path.join(root, 'public', 'assets');

const pad4 = (n) => (n + 3) & ~3;

function buildGlb(json, bin) {
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonLen = pad4(jsonBuf.length);
  const binLen = pad4(bin.length);
  const out = Buffer.alloc(12 + 8 + jsonLen + 8 + binLen);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(jsonLen, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  out.fill(0x20, 20, 20 + jsonLen);
  jsonBuf.copy(out, 20);
  const binStart = 20 + jsonLen;
  out.writeUInt32LE(binLen, binStart);
  out.writeUInt32LE(0x004e4942, binStart + 4);
  bin.copy(out, binStart + 8);
  return out;
}

function readGlb(file) {
  const buf = fs.readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen;
  const binLen = buf.readUInt32LE(binStart);
  return { json, bin: buf.subarray(binStart + 8, binStart + 8 + binLen) };
}

/** .gltf + .bin → 텍스처 없는 GLB. */
function gltfToBareGlb(file) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (json.buffers.length !== 1) throw new Error(`${file}: 버퍼가 1개가 아님`);
  const bin = fs.readFileSync(path.join(path.dirname(file), json.buffers[0].uri));
  json.buffers = [{ byteLength: bin.length }];
  delete json.images;
  delete json.textures;
  delete json.samplers;
  for (const m of json.materials ?? []) {
    if (m.pbrMetallicRoughness) delete m.pbrMetallicRoughness.baseColorTexture;
    delete m.normalTexture;
    delete m.emissiveTexture;
    delete m.occlusionTexture;
  }
  return buildGlb(json, bin);
}

/** 쓰지 않는 애니메이션·액세서·버퍼뷰를 잘라 낸다. keep: 남길 애니메이션 이름, dropNodes: 지울 메시 노드 이름. */
function pruneGlb(file, { keep, dropNodes = [] }) {
  const { json, bin } = readGlb(file);
  json.animations = (json.animations ?? []).filter((a) => keep.includes(a.name));
  const missing = keep.filter((k) => !json.animations.some((a) => a.name === k));
  if (missing.length) throw new Error(`${path.basename(file)}: 애니메이션 없음 ${missing.join(', ')}`);
  for (const n of json.nodes) if (dropNodes.includes(n.name)) delete n.mesh;

  const usedMeshes = new Set(json.nodes.filter((n) => n.mesh !== undefined).map((n) => n.mesh));
  const usedAcc = new Set();
  json.meshes.forEach((m, i) => {
    if (!usedMeshes.has(i)) {
      m.primitives = [];
      return;
    }
    for (const p of m.primitives) {
      for (const a of Object.values(p.attributes)) usedAcc.add(a);
      if (p.indices !== undefined) usedAcc.add(p.indices);
      for (const t of p.targets ?? []) for (const a of Object.values(t)) usedAcc.add(a);
    }
  });
  for (const s of json.skins ?? []) if (s.inverseBindMatrices !== undefined) usedAcc.add(s.inverseBindMatrices);
  for (const a of json.animations) for (const s of a.samplers) usedAcc.add(s.input).add(s.output);

  // 빈 메시를 가리키는 노드가 없도록 메시 목록을 다시 매긴다.
  const meshMap = new Map();
  json.meshes = json.meshes.filter((m, i) => {
    if (!usedMeshes.has(i)) return false;
    meshMap.set(i, meshMap.size);
    return true;
  });
  for (const n of json.nodes) if (n.mesh !== undefined) n.mesh = meshMap.get(n.mesh);

  const accMap = new Map();
  const newAccessors = [];
  [...usedAcc].sort((a, b) => a - b).forEach((old) => {
    accMap.set(old, newAccessors.length);
    newAccessors.push(json.accessors[old]);
  });
  const usedViews = new Set();
  for (const a of newAccessors) if (a.bufferView !== undefined) usedViews.add(a.bufferView);
  for (const img of json.images ?? []) if (img.bufferView !== undefined) usedViews.add(img.bufferView);

  const viewMap = new Map();
  const newViews = [];
  const chunks = [];
  let offset = 0;
  [...usedViews].sort((a, b) => a - b).forEach((old) => {
    const v = json.bufferViews[old];
    const data = bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
    viewMap.set(old, newViews.length);
    newViews.push({ ...v, byteOffset: offset });
    chunks.push(data);
    const padded = pad4(data.length);
    if (padded > data.length) chunks.push(Buffer.alloc(padded - data.length));
    offset += padded;
  });
  for (const a of newAccessors) if (a.bufferView !== undefined) a.bufferView = viewMap.get(a.bufferView);
  for (const img of json.images ?? []) if (img.bufferView !== undefined) img.bufferView = viewMap.get(img.bufferView);
  for (const m of json.meshes) {
    for (const p of m.primitives) {
      for (const k of Object.keys(p.attributes)) p.attributes[k] = accMap.get(p.attributes[k]);
      if (p.indices !== undefined) p.indices = accMap.get(p.indices);
      for (const t of p.targets ?? []) for (const k of Object.keys(t)) t[k] = accMap.get(t[k]);
    }
  }
  for (const s of json.skins ?? []) {
    if (s.inverseBindMatrices !== undefined) s.inverseBindMatrices = accMap.get(s.inverseBindMatrices);
  }
  for (const a of json.animations) {
    for (const s of a.samplers) {
      s.input = accMap.get(s.input);
      s.output = accMap.get(s.output);
    }
  }
  json.accessors = newAccessors;
  json.bufferViews = newViews;
  const newBin = Buffer.concat(chunks);
  json.buffers = [{ byteLength: newBin.length }];
  return buildGlb(json, newBin);
}

/** 여러 GLB 를 한 파일로: 'HPAK' | u32 jsonLen | json{files:{name:[offset,length]}} | data */
function writePack(outFile, entries) {
  const index = {};
  let offset = 0;
  const bodies = [];
  for (const [name, buf] of entries) {
    index[name] = [offset, buf.length];
    bodies.push(buf);
    const padded = pad4(buf.length);
    if (padded > buf.length) bodies.push(Buffer.alloc(padded - buf.length));
    offset += padded;
  }
  const jsonBuf = Buffer.from(JSON.stringify({ files: index }), 'utf8');
  const jsonLen = pad4(jsonBuf.length);
  const head = Buffer.alloc(8 + jsonLen, 0x20);
  head.write('HPAK', 0, 'ascii');
  head.writeUInt32LE(jsonLen, 4);
  jsonBuf.copy(head, 8);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, Buffer.concat([head, ...bodies]));
  return 8 + jsonLen + offset;
}

const report = [];
const kb = (n) => `${(n / 1024).toFixed(0)}KB`;
function copy(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return fs.statSync(dest).size;
}

function packKit({ id, dir, texture, only }) {
  const abs = path.join(SRC, dir);
  const names = fs
    .readdirSync(abs)
    .filter((f) => f.endsWith('.gltf'))
    .map((f) => f.slice(0, -5))
    .filter((n) => !only || only.includes(n))
    .sort();
  const entries = names.map((n) => [n, gltfToBareGlb(path.join(abs, `${n}.gltf`))]);
  const size = writePack(path.join(OUT, id, `${id}.pack`), entries);
  const texSize = copy(path.join(abs, texture), path.join(OUT, id, 'texture.png'));
  report.push(`${id}: 모델 ${names.length}개 → ${kb(size)} + 텍스처 ${kb(texSize)}`);
}

function pruneCharacter({ src, dest, keep, dropNodes }) {
  const before = fs.statSync(path.join(SRC, src)).size;
  const out = pruneGlb(path.join(SRC, src), { keep, dropNodes });
  const file = path.join(OUT, dest);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out);
  report.push(`${dest}: ${kb(before)} → ${kb(out.length)} (애니메이션 ${keep.length}개)`);
}

fs.rmSync(OUT, { recursive: true, force: true });

// --- 환경 키트 (KayKit, CC0) ---
packKit({ id: 'kaykit-city', dir: 'KayKit-City-Builder-Bits-1.0/addons/kaykit_city_builder_bits/Assets/gltf', texture: 'citybits_texture.png' });
packKit({ id: 'kaykit-furniture', dir: 'KayKit-Furniture-Bits-1.0/addons/kaykit_furniture_bits/Assets/gltf', texture: 'furniturebits_texture.png' });
packKit({ id: 'kaykit-halloween', dir: 'KayKit-Halloween-Bits-1.0/addons/kaykit_halloween_bits/Assets/gltf', texture: 'halloweenbits_texture.png' });

// --- 몬스터 (KayKit Skeletons, CC0) ---
const SK = 'KayKit-Character-Pack-Skeletons-1.0/addons/kaykit_character_pack_skeletons/Characters/gltf';
const MONSTER_CLIPS = ['Walking_A', 'Running_A', 'Idle', 'Taunt', 'Spawn_Ground', 'Death_A', '1H_Melee_Attack_Chop', 'Spellcast_Shoot'];
for (const name of ['Skeleton_Minion', 'Skeleton_Rogue', 'Skeleton_Warrior', 'Skeleton_Mage']) {
  pruneCharacter({ src: `${SK}/${name}.glb`, dest: `kaykit-skeletons/${name}.glb`, keep: MONSTER_CLIPS });
}

// --- 주인 (KayKit Adventurers, CC0) ---
const AD = 'KayKit-Character-Pack-Adventures-1.0/addons/kaykit_character_pack_adventures/Characters/gltf';
const OWNER_CLIPS = ['Idle', 'Walking_A', 'Running_A', 'Sit_Chair_Idle', 'Sit_Floor_Idle', 'Lie_Idle', 'Interact', 'PickUp', 'Cheer', 'Throw', 'Use_Item', 'Hit_A', 'Unarmed_Idle'];
for (const name of (process.env.OWNERS ?? 'Mage,Rogue,Barbarian,Knight').split(',')) {
  pruneCharacter({ src: `${AD}/${name}.glb`, dest: `kaykit-adventurers/${name}.glb`, keep: OWNER_CLIPS });
}

// --- 개 (Khronos glTF Sample Assets "Fox": 모델 CC0, 리깅·애니메이션 CC-BY 4.0) ---
report.push(`khronos-fox/Fox.glb: ${kb(copy(path.join(SRC, 'gltf-samples/Models/Fox/glTF-Binary/Fox.glb'), path.join(OUT, 'khronos-fox', 'Fox.glb')))}`);

// --- 사운드·스프라이트 (Kenney Starter Kits) ---
const SOUNDS = {
  'Starter-Kit-FPS/sounds': ['enemy_hurt', 'enemy_destroy', 'enemy_attack', 'blaster', 'land', 'jump_a', 'weapon_change'],
  'Starter-Kit-3D-Platformer/sounds': ['coin', 'break', 'fall', 'walking'],
  'Starter-Kit-City-Builder/sounds': ['placement-a', 'placement-b', 'placement-c', 'removal-a', 'toggle', 'rotate', 'ambience'],
};
let soundBytes = 0;
for (const [dir, names] of Object.entries(SOUNDS)) {
  for (const n of names) soundBytes += copy(path.join(SRC, dir, `${n}.ogg`), path.join(OUT, 'kenney-starter', 'sounds', `${n}.ogg`));
}
report.push(`kenney-starter/sounds: ${Object.values(SOUNDS).flat().length}개 ${kb(soundBytes)}`);
for (const [dir, name] of [['Starter-Kit-3D-Platformer/sprites', 'particle'], ['Starter-Kit-FPS/sprites', 'burst'], ['Starter-Kit-FPS/sprites', 'hit'], ['Starter-Kit-3D-Platformer/sprites', 'blob_shadow']]) {
  report.push(`kenney-starter/sprites/${name}.png: ${kb(copy(path.join(SRC, dir, `${name}.png`), path.join(OUT, 'kenney-starter', 'sprites', `${name}.png`)))}`);
}

// --- 폰트: 게임에 나오는 글자만 남긴다 (fonttools 가 있을 때) ---
const FONT_SRC = path.join(SRC, 'fonts');
if (fs.existsSync(FONT_SRC)) {
  const chars = new Set(' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~…·•×→←↑↓♥★☆♪※○●△▲▽▼「」『』〈〉“”‘’—–');
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx?|json|html|css)$/.test(e.name)) for (const ch of fs.readFileSync(p, 'utf8')) chars.add(ch);
    }
  };
  walk(path.join(root, 'src'));
  for (const ch of fs.readFileSync(path.join(root, 'index.html'), 'utf8')) chars.add(ch);
  const text = [...chars].filter((c) => c >= ' ').join('');
  const textFile = path.join(root, 'artifacts', 'font-chars.txt');
  fs.mkdirSync(path.dirname(textFile), { recursive: true });
  fs.writeFileSync(textFile, text);
  const FONTS = [
    ['Jua-Regular.ttf', 'HeroRound.woff', 'HeroRound'],
    ['Pretendard-Regular.otf', 'HeroSans-400.woff', 'HeroSans'],
    ['Pretendard-SemiBold.otf', 'HeroSans-600.woff', 'HeroSans SemiBold'],
    ['Pretendard-ExtraBold.otf', 'HeroSans-800.woff', 'HeroSans ExtraBold'],
  ];
  for (const [srcName, outName, family] of FONTS) {
    const dest = path.join(root, 'src', 'ui', 'fonts', outName);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    try {
      execFileSync('python3', ['-I', path.join(root, 'scripts', 'subset-font.py'), path.join(FONT_SRC, srcName), textFile, dest, family], { stdio: 'pipe' });
      report.push(`fonts/${outName}: ${kb(fs.statSync(path.join(FONT_SRC, srcName)).size)} → ${kb(fs.statSync(dest).size)} (${text.length}자)`);
    } catch (e) {
      report.push(`fonts/${outName}: 서브셋 실패 (${String(e.stderr ?? e.message).slice(-200)})`);
    }
  }
}

fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
fs.writeFileSync(path.join(root, 'artifacts', 'asset-report.txt'), report.join('\n') + '\n');
console.log(report.join('\n'));

// GLB/glTF 요약 출력: 메시·정점 수, 스킨, 애니메이션, 텍스처.  node scripts/inspect-gltf.mjs <file...>
import fs from 'node:fs';
import path from 'node:path';
function readJson(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) === 0x46546c67) {
    const len = buf.readUInt32LE(12);
    return JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
  }
  return JSON.parse(buf.toString('utf8'));
}
for (const file of process.argv.slice(2)) {
  try {
    const g = readJson(file);
    let verts = 0, tris = 0;
    for (const m of g.meshes ?? []) for (const p of m.primitives) {
      verts += g.accessors[p.attributes.POSITION].count;
      tris += (p.indices !== undefined ? g.accessors[p.indices].count : g.accessors[p.attributes.POSITION].count) / 3;
    }
    const anims = (g.animations ?? []).map((a) => a.name);
    console.log(`${path.basename(file)} | ${(fs.statSync(file).size / 1024).toFixed(0)}KB | meshes ${g.meshes?.length ?? 0} verts ${verts} tris ${Math.round(tris)} | skins ${g.skins?.length ?? 0} joints ${g.skins?.[0]?.joints.length ?? 0} | mats ${g.materials?.length ?? 0} tex ${g.images?.length ?? 0} | anims ${anims.length}${anims.length ? ': ' + anims.slice(0, 80).join(',') : ''}`);
    if (process.env.NODES) console.log('  nodes:', (g.nodes ?? []).filter((n) => n.mesh !== undefined).map((n) => n.name).join(', '));
  } catch (e) { console.log(`${file} ERR ${e.message}`); }
}

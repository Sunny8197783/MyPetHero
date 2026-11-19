import * as THREE from 'three';
import type { GameScene } from '../core/engine';
import { assets, type KitId } from '../core/assets';

/** 개발용 에셋 미리보기.  ?preview=kaykit-city | kaykit-furniture | kaykit-halloween | chars */
export class PreviewScene implements GameScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
  private readonly mixers: THREE.AnimationMixer[] = [];

  constructor(private readonly what: string, private readonly opts: URLSearchParams) {
    this.scene.background = new THREE.Color(0xe9e2d6);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9488, 1.4));
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
    sun.position.set(6, 12, 8);
    this.scene.add(sun);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0xd8d0c2 }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    void this.build();
  }

  private label(text: string, size = 1): THREE.Sprite {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 48;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#222';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(text, 128, 32);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
    sprite.scale.set(4 * size, 0.75 * size, 1);
    return sprite;
  }

  private async build(): Promise<void> {
    if (this.what === 'chars') {
      const files = [
        'khronos-fox/Fox.glb',
        'kaykit-adventurers/Mage.glb',
        'kaykit-adventurers/Rogue.glb',
        'kaykit-adventurers/Barbarian.glb',
        'kaykit-adventurers/Knight.glb',
        'kaykit-skeletons/Skeleton_Minion.glb',
        'kaykit-skeletons/Skeleton_Rogue.glb',
        'kaykit-skeletons/Skeleton_Warrior.glb',
        'kaykit-skeletons/Skeleton_Mage.glb',
      ];
      await Promise.all(files.map((f) => assets.loadGlb(f)));
      const strip = this.opts.get('strip') === '1';
      const clipName = this.opts.get('clip') ?? '';
      files.forEach((f, i) => {
        const { root, clips } = assets.skinned(f);
        const isFox = f.includes('Fox');
        if (isFox) root.scale.setScalar(0.02);
        root.position.set((i - (files.length - 1) / 2) * 2.4, 0, 0);
        if (strip) {
          root.traverse((o) => {
            if (/Hat|Cape|Staff|Wand|Spellbook|Axe|Shield|Sword|Mug|Knife|Crossbow|Throwable|Helmet|Cloak|Hood$/.test(o.name)) o.visible = false;
          });
        }
        this.scene.add(root);
        const mixer = new THREE.AnimationMixer(root);
        const clip = clips.get(clipName) ?? clips.get('Walking_A') ?? clips.get('Walk');
        if (clip) mixer.clipAction(clip).play();
        this.mixers.push(mixer);
        const l = this.label(f.split('/')[1].replace('.glb', ''), 0.55);
        l.position.set(root.position.x, 3.2, 0);
        this.scene.add(l);
      });
      this.camera.position.set(0, 3.4, 15);
      this.camera.lookAt(0, 1.2, 0);
      return;
    }
    const kit = this.what as KitId;
    await assets.loadKit(kit);
    const names = assets.kitNames(kit);
    const from = Number(this.opts.get('from') ?? 0);
    const count = Number(this.opts.get('count') ?? 24);
    const cols = Number(this.opts.get('cols') ?? 6);
    const cell = Number(this.opts.get('cell') ?? 5);
    const shown = names.slice(from, from + count);
    shown.forEach((name, i) => {
      const m = assets.model(kit, name);
      const x = ((i % cols) - (cols - 1) / 2) * cell;
      const z = Math.floor(i / cols) * cell;
      m.position.set(x, 0, z);
      this.scene.add(m);
      const box = new THREE.Box3().setFromObject(m);
      const size = box.getSize(new THREE.Vector3());
      const l = this.label(name, cell / 5);
      l.position.set(x, box.max.y + 0.6, z);
      this.scene.add(l);
      const dim = this.label(`${size.x.toFixed(1)}x${size.y.toFixed(1)}x${size.z.toFixed(1)}`, cell / 7);
      dim.position.set(x, -0.1, z + cell * 0.42);
      this.scene.add(dim);
    });
    const rows = Math.ceil(shown.length / cols);
    const depth = (rows - 1) * cell;
    this.camera.position.set(0, cols * cell * 0.75, depth / 2 + cols * cell * 0.85);
    this.camera.lookAt(0, 0, depth / 2);
  }

  update(dt: number): void {
    for (const m of this.mixers) m.update(dt);
  }

  dispose(): void {}
}

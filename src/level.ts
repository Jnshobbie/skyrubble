import * as THREE from 'three';
// Palette: swap these to re-theme blocks/trees (blocks are terracotta, not gray).
export const PAL = { grass: 0x8fe04a, block: 0xc4703f, leafA: 0x4fc23a, leafB: 0xd63ea8, trunk: 0x5a3b2a, sky: 0x8fd8ee };
const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
type Deb = { m: THREE.Mesh; v: THREE.Vector3; life: number };
export class Level {
  tiles = new Set<string>(); idx = new Map<string, number>();
  body: THREE.InstancedMesh; cap: THREE.InstancedMesh; deb: Deb[] = [];
  constructor(public scene: THREE.Scene, rects: number[][]) {
    for (const [x, y, w, h] of rects) for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) this.tiles.add(`${x + i},${y + j}`);
    const n = this.tiles.size;
    const bm = new THREE.MeshStandardMaterial({ color: PAL.block, roughness: 0.85, flatShading: true });
    const cm = new THREE.MeshStandardMaterial({ color: PAL.grass, roughness: 0.9 });
    this.body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 2), bm, n);
    this.cap = new THREE.InstancedMesh(new THREE.BoxGeometry(1.04, 0.2, 2.06), cm, n);
    for (const m of [this.body, this.cap]) { m.castShadow = m.receiveShadow = true; scene.add(m); }
    const M = new THREE.Matrix4(); const zero = new THREE.Matrix4().makeScale(0, 0, 0); let k = 0;
    for (const key of this.tiles) {
      const [x, y] = key.split(',').map(Number);
      this.idx.set(key, k);
      this.body.setMatrixAt(k, M.makeTranslation(x + 0.5, y + 0.5, 0));
      this.cap.setMatrixAt(k, this.tiles.has(`${x},${y + 1}`) ? zero : M.makeTranslation(x + 0.5, y + 0.92, 0));
      k++;
    }
    for (let i = 0; i < 70; i++) this.tree(-4 + i * 1.6 + rnd(), 0, -3 - rnd() * 9, rnd() < 0.3);
    for (let i = 0; i < 70; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), bm); m.visible = false; scene.add(m);
      this.deb.push({ m, v: new THREE.Vector3(), life: 0 });
    }
  }
  tree(x: number, y: number, z: number, magenta: boolean) {
    const g = new THREE.Group(); const h = 2 + rnd() * 3;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, h, 6), new THREE.MeshStandardMaterial({ color: PAL.trunk }));
    t.position.y = h / 2; g.add(t);
    const lm = new THREE.MeshStandardMaterial({ color: magenta ? PAL.leafB : PAL.leafA, roughness: 0.8, flatShading: true });
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3 + rnd() * 0.9, 1), lm);
      b.position.set((rnd() - 0.5) * 2, h + rnd() * 1.4, (rnd() - 0.5) * 1.5); b.castShadow = true; g.add(b);
    }
    g.position.set(x, y + 1.4, z); this.scene.add(g);
  }
  solid(ix: number, iy: number) { return this.tiles.has(`${ix},${iy}`); }
  destroy(ix: number, iy: number) {
    const key = `${ix},${iy}`; const k = this.idx.get(key);
    if (k === undefined || !this.tiles.has(key)) return false;
    this.tiles.delete(key);
    const z = new THREE.Matrix4().makeScale(0, 0, 0);
    this.body.setMatrixAt(k, z); this.cap.setMatrixAt(k, z);
    this.body.instanceMatrix.needsUpdate = this.cap.instanceMatrix.needsUpdate = true;
    this.burst(ix + 0.5, iy + 0.5, 6); return true;
  }
  burst(x: number, y: number, n: number) {
    for (const d of this.deb) {
      if (n <= 0) break; if (d.life > 0) continue; n--;
      d.life = 0.9 + rnd() * 0.5; d.m.visible = true; d.m.position.set(x, y, (rnd() - 0.5));
      d.v.set((rnd() - 0.5) * 9, 3 + rnd() * 7, (rnd() - 0.5) * 4);
    }
  }
  update(dt: number) {
    for (const d of this.deb) {
      if (d.life <= 0) continue; d.life -= dt; d.v.y -= 30 * dt;
      d.m.position.addScaledVector(d.v, dt); d.m.rotation.x += dt * 8; d.m.rotation.z += dt * 6;
      if (d.life <= 0) d.m.visible = false;
    }
  }
}

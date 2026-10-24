import * as THREE from 'three';
// Art lives in public/art/*.png (sliced from the AI sprite sheet). Collision stays on the invisible tile grid.
export const PAL = { grass: 0x4f9a2a, block: 0x55555b, trunk: 0x4a3a30, sky: 0x8fd8ee };
const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const loader = new THREE.TextureLoader();
const tex = (n: string) => { const t = loader.load(`art/${n}.png`); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
const sprite = (n: string) => new THREE.MeshBasicMaterial({ map: tex(n), alphaTest: 0.5, color: 0xe8e8e8 });
const V = 5, vary = (x: number, y: number) => (x * 7 + y * 13 + ((x * y) & 3)) % V;
type Deb = { m: THREE.Mesh; v: THREE.Vector3; life: number };
type Part = { m: THREE.InstancedMesh; i: number };
export class Level {
  tiles = new Set<string>(); parts = new Map<string, Part[]>(); deb: Deb[] = [];
  body: THREE.InstancedMesh; cap: THREE.InstancedMesh;
  constructor(public scene: THREE.Scene, rects: number[][]) {
    for (const [x, y, w, h] of rects) for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) this.tiles.add(`${x + i},${y + j}`);
    const all = [...this.tiles].map(k => k.split(',').map(Number)), top = ([x, y]: number[]) => !this.tiles.has(`${x},${y + 1}`), bottom = ([x, y]: number[]) => !this.tiles.has(`${x},${y - 1}`);
    const M = new THREE.Matrix4(), add = (k: string, p: Part) => (this.parts.get(k) ?? this.parts.set(k, []).get(k)!).push(p);
    const bm = new THREE.MeshStandardMaterial({ color: PAL.block, roughness: 0.95, flatShading: true });
    this.body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 2), bm, all.length);
    const tops = all.filter(top); this.cap = new THREE.InstancedMesh(new THREE.BoxGeometry(1.0, 0.16, 2.0), new THREE.MeshStandardMaterial({ color: PAL.grass, roughness: 1 }), tops.length);
    all.forEach(([x, y], k) => { this.body.setMatrixAt(k, M.makeTranslation(x + 0.5, y + 0.5, 0)); add(`${x},${y}`, { m: this.body, i: k }); });
    tops.forEach(([x, y], k) => { this.cap.setMatrixAt(k, M.makeTranslation(x + 0.5, y + 0.96, 0)); add(`${x},${y}`, { m: this.cap, i: k }); });
    this.body.castShadow = this.body.receiveShadow = true; scene.add(this.body, this.cap);
    // stone faces (5 variants) on every tile front; grass fringe (5 variants) on every top tile
    const stoneMats = Array.from({ length: V }, (_, i) => new THREE.MeshBasicMaterial({ map: tex(`stone${i}`), color: 0xd8d8d8 }));
    const grassMats = Array.from({ length: V }, (_, i) => sprite(`grass${i}`));
    const place = (list: number[][], mats: THREE.Material[], geo: THREE.BufferGeometry, pos: (x: number, y: number) => THREE.Vector3) => {
      for (let v = 0; v < V; v++) {
        const mine = list.filter(([x, y]) => vary(x, y) === v); if (!mine.length) continue;
        const im = new THREE.InstancedMesh(geo, mats[v], mine.length);
        mine.forEach(([x, y], i) => { im.setMatrixAt(i, M.makeTranslation(...pos(x, y).toArray())); add(`${x},${y}`, { m: im, i }); });
        scene.add(im);
      }
    };
    place(all, stoneMats, new THREE.PlaneGeometry(1.0, 1.0), (x, y) => new THREE.Vector3(x + 0.5, y + 0.5, 1.01));
    place(tops, grassMats, new THREE.PlaneGeometry(1.08, 0.42), (x, y) => new THREE.Vector3(x + 0.5, y + 1.07, 1.03));
    // hanging vines under floating platforms (every 3rd exposed bottom tile)
    const vt = all.filter(t => bottom(t) && t[1] >= 2).filter((_, i) => i % 3 === 0);
    if (vt.length) { const vm = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.5, 1.25), sprite('vines'), vt.length);
      vt.forEach(([x, y], i) => { vm.setMatrixAt(i, M.makeTranslation(x + 0.5, y - 0.45, 1.06)); add(`${x},${y}`, { m: vm, i }); }); scene.add(vm); }
    this.scenery(tops);
    for (let i = 0; i < 70; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), bm); m.visible = false; scene.add(m);
      this.deb.push({ m, v: new THREE.Vector3(), life: 0 });
    }
  }
  // Round bush sprites as tree canopies: far background forest + small trees on platforms + low bushes behind the lane
  scenery(tops: number[][]) {
    const bushes: { p: THREE.Vector3; s: number; pink: boolean }[] = [], trunks: { p: THREE.Vector3; h: number; w: number }[] = [];
    const tree = (x: number, y: number, z: number, h: number, s: number, pink: boolean) => { trunks.push({ p: new THREE.Vector3(x, y + h / 2, z), h, w: 0.18 + s * 0.07 }); bushes.push({ p: new THREE.Vector3(x, y + h + s * 0.3, z + 0.01), s, pink }); };
    for (let x = -6; x < 105; x += 5.5) {
      const z = -5 - rnd() * 6, pink = rnd() < 0.4, s = 5 + rnd() * 3;
      tree(x + rnd() * 3, -1, z, 4 + rnd() * 3, s, pink); bushes.push({ p: new THREE.Vector3(x + 2 + rnd() * 3, 3 + rnd() * 2, z - 1), s: s * 0.7, pink: !pink });
    }
    tops.forEach(([x, y], i) => {
      if (i % 7 === 3 && x > 3 && x < 76) tree(x + 0.5, y + 1, -1.4, 0.8 + rnd() * 1.5, 1.6 + rnd() * 0.9, rnd() < 0.3);
      if (i % 5 === 1) bushes.push({ p: new THREE.Vector3(x + 0.5, y + 1.4, -0.9), s: 1.1 + rnd() * 0.4, pink: false });
    });
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion();
    for (const pink of [false, true]) {
      const list = bushes.filter(b => b.pink === pink); if (!list.length) continue;
      const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1.04), sprite(pink ? 'bush_pink' : 'bush'), list.length);
      list.forEach((b, i) => im.setMatrixAt(i, M.compose(b.p, Q.setFromEuler(new THREE.Euler(0, 0, (rnd() - 0.5) * 0.15)), new THREE.Vector3(b.s * 1.6, b.s * 1.6, 1))));
      this.scene.add(im);
    }
    const tm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.6, 1, 1, 6), new THREE.MeshStandardMaterial({ color: PAL.trunk, roughness: 1 }), trunks.length);
    trunks.forEach((t, i) => tm.setMatrixAt(i, M.compose(t.p, new THREE.Quaternion(), new THREE.Vector3(t.w, t.h, t.w)))); this.scene.add(tm);
  }
  solid(ix: number, iy: number) { return this.tiles.has(`${ix},${iy}`); }
  destroy(ix: number, iy: number) {
    const key = `${ix},${iy}`; if (!this.tiles.has(key)) return false;
    this.tiles.delete(key);
    const z = new THREE.Matrix4().makeScale(0, 0, 0), touched = new Set<THREE.InstancedMesh>();
    for (const p of this.parts.get(key) ?? []) { p.m.setMatrixAt(p.i, z); touched.add(p.m); }
    touched.forEach(m => (m.instanceMatrix.needsUpdate = true));
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

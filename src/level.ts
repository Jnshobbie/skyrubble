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
    this.decorate();
    for (let i = 0; i < 70; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), bm); m.visible = false; scene.add(m);
      this.deb.push({ m, v: new THREE.Vector3(), life: 0 });
    }
  }
    // ---- Fluffy foliage: alpha-tested leaf cards, ONE draw call for every canopy/bush ----
  leaves: { p: THREE.Vector3; q: THREE.Quaternion; s: number; c: THREE.Color }[] = [];
  trunks: { p: THREE.Vector3; h: number; w: number }[] = [];
  static leafTex() {
    const N = 64, d = new Uint8Array(N * N * 4), h = (x: number, y: number) => Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
    const blobs = Array.from({ length: 9 }, () => [16 + rnd() * 32, 16 + rnd() * 32, 8 + rnd() * 9]);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let a = 0, best = 0;
      for (const [bx, by, r] of blobs) { const dd = Math.hypot(x - bx, y - by) / (r * (0.8 + h(x, y) * 0.4)); if (dd < 1) { a = 1; best = Math.max(best, 1 - dd); } }
      const i = (y * N + x) * 4, sh = Math.min(255, (0.5 + 0.5 * ((y / N) * 0.6 + best * 0.4)) * 255);
      d[i] = d[i + 1] = d[i + 2] = sh; d[i + 3] = a * 255;
    }
    const t = new THREE.DataTexture(d, N, N); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
  }
  foliage(cx: number, cy: number, cz: number, rx: number, ry: number, n: number, magenta = false) {
    const pal = (magenta ? [0x7a1a5a, 0xc23a9a, 0xff7ac8] : [0x1f6b2a, 0x3f9a34, 0xa6d84a]).map(c => new THREE.Color(c));
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.283, r = Math.sqrt(rnd()), py = Math.sin(a) * r * ry, t = (py / ry + 1) / 2;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.6, (rnd() - 0.5) * 0.6, rnd() * 6.283));
      this.leaves.push({ p: new THREE.Vector3(cx + Math.cos(a) * r * rx, cy + py, cz + (rnd() - 0.5) * rx * 0.7), q, s: 0.9 + rnd() * 0.9,
        c: pal[t > 0.66 ? 2 : t > 0.33 ? 1 : 0].clone().offsetHSL((rnd() - 0.5) * 0.03, 0, (rnd() - 0.5) * 0.06) });
    }
  }
  tree(x: number, y: number, z: number, h: number, rx: number, magenta: boolean, n = 45) {
    this.trunks.push({ p: new THREE.Vector3(x, y + h / 2, z), h, w: 0.18 + rx * 0.08 });
    this.foliage(x, y + h + rx * 0.35, z, rx, rx * 0.8, n, magenta);
  }
  decorate() {
    const tops = [...this.tiles].map(k => k.split(',').map(Number)).filter(([x, y]) => !this.tiles.has(`${x},${y + 1}`)).sort((a, b) => a[0] - b[0]);
    // far background forest (depth + fog = fake atmosphere)
    for (let x = -6; x < 110; x += 3.2) this.tree(x + rnd() * 2, -1, -5 - rnd() * 7, 4 + rnd() * 5, 2.6 + rnd() * 1.6, rnd() < 0.25, 55);
    tops.forEach(([x, y], i) => {
      const top = y + 1;
      if (i % 7 === 3 && x > 3 && x < 76) this.tree(x + 0.5, top, -1.3, 1.2 + rnd() * 2, 1.2 + rnd() * 0.8, rnd() < 0.3, 40); // trees ON platforms
      if (i % 3 === 0) this.foliage(x + 0.5, top + 0.3, 1.15, 0.8, 0.35, 12, rnd() < 0.2);                                   // front bushes overlapping edges
    });
    // leaf cards -> one InstancedMesh
    const tex = Level.leafTex(), mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 });
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, this.leaves.length), M = new THREE.Matrix4();
    this.leaves.forEach((l, i) => { im.setMatrixAt(i, M.compose(l.p, l.q, new THREE.Vector3(l.s, l.s, l.s))); im.setColorAt(i, l.c); });
    this.scene.add(im);
    // trunks
    const tm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.6, 1, 1, 6), new THREE.MeshStandardMaterial({ color: PAL.trunk, roughness: 1 }), this.trunks.length);
    this.trunks.forEach((t, i) => tm.setMatrixAt(i, M.compose(t.p, new THREE.Quaternion(), new THREE.Vector3(t.w, t.h, t.w)))); this.scene.add(tm);
    // grass tufts on every top tile
    const gm = new THREE.InstancedMesh(new THREE.ConeGeometry(0.05, 0.35, 3), new THREE.MeshStandardMaterial({ roughness: 1 }), tops.length * 7), c = new THREE.Color();
    tops.forEach(([x, y], i) => { for (let k = 0; k < 7; k++) {
      const hh = 0.6 + rnd() * 0.9; gm.setMatrixAt(i * 7 + k, M.compose(new THREE.Vector3(x + rnd(), y + 1.05 + hh * 0.12, (rnd() - 0.5) * 1.9),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, (rnd() - 0.5) * 0.5)), new THREE.Vector3(1, hh, 1)));
      gm.setColorAt(i * 7 + k, c.set(rnd() < 0.5 ? 0x9be34a : 0x5fbf3a)); } });
    this.scene.add(gm);
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

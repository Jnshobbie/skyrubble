import * as THREE from 'three';
import { THEME, SNOW } from './theme';
// Art lives in public/art/*.png (sliced from the AI sprite sheet). Collision stays on the invisible tile grid.
export const PAL = { grass: THEME.grass, block: THEME.block, trunk: THEME.trunk, sky: THEME.sky };
const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const loader = new THREE.TextureLoader();
const tex = (n: string) => { const t = loader.load(`art/${n}.png`); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
// lum = night glow: use only the texture's brightness and paint it with the tint (so green leaves can become blue)
const sprite = (n: string, c: THREE.ColorRepresentation = THEME.tint, lum = false) => {
  const m = new THREE.MeshBasicMaterial({ map: tex(n), alphaTest: 0.5, color: c });
  if (lum) { m.customProgramCacheKey = () => 'lum'; m.onBeforeCompile = s => { s.fragmentShader = s.fragmentShader.replace('#include <map_fragment>', 'vec4 sampledDiffuseColor = texture2D(map, vMapUv); diffuseColor *= vec4(vec3(dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114)) * 1.6), sampledDiffuseColor.a);'); }; }
  return m;
};
const V = 5, vary = (x: number, y: number) => (x * 7 + y * 13 + ((x * y) & 3)) % V;
type Deb = { m: THREE.Mesh; v: THREE.Vector3; life: number };
type Part = { m: THREE.InstancedMesh; i: number };
export class Level {
  tiles = new Set<string>(); parts = new Map<string, Part[]>(); deb: Deb[] = []; locked = new Set<string>(); treeSpots: { x: number; y: number; z: number; s: number }[] = [];   // locked = unbreakable tiles (the mini-boss gate); treeSpots = tree crowns (snow falls off them)
  body: THREE.InstancedMesh; cap: THREE.InstancedMesh;
  constructor(public scene: THREE.Scene, rects: number[][], public len = 110, public maxY = 0) {
    for (const [x, y, w, h] of rects) for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) this.tiles.add(`${x + i},${y + j}`);
    const all = [...this.tiles].map(k => k.split(',').map(Number)), top = ([x, y]: number[]) => !this.tiles.has(`${x},${y + 1}`), bottom = ([x, y]: number[]) => !this.tiles.has(`${x},${y - 1}`);
    const M = new THREE.Matrix4(), add = (k: string, p: Part) => (this.parts.get(k) ?? this.parts.set(k, []).get(k)!).push(p);
    const bm = new THREE.MeshStandardMaterial({ color: PAL.block, roughness: 0.95, flatShading: true });
    this.body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 2), bm, all.length);
    const tops = all.filter(top); this.cap = new THREE.InstancedMesh(new THREE.BoxGeometry(1.0, 0.16, 2.0), new THREE.MeshStandardMaterial({ color: PAL.grass, roughness: 1, emissive: THEME.edge, emissiveIntensity: THEME.edgeI }), tops.length);
    all.forEach(([x, y], k) => { this.body.setMatrixAt(k, M.makeTranslation(x + 0.5, y + 0.5, 0)); add(`${x},${y}`, { m: this.body, i: k }); });
    tops.forEach(([x, y], k) => { this.cap.setMatrixAt(k, M.makeTranslation(x + 0.5, y + 0.96, 0)); add(`${x},${y}`, { m: this.cap, i: k }); });
    this.body.castShadow = this.body.receiveShadow = true; scene.add(this.body, this.cap);
    // stone faces (5 variants) on every tile front; grass fringe (5 variants) on every top tile
    const stoneMats = Array.from({ length: V }, (_, i) => new THREE.MeshBasicMaterial({ map: tex(`stone${i}`), color: THEME.stone }));
    const grassMats = Array.from({ length: V }, (_, i) => sprite(`grass${i}`, THEME.grassTint, SNOW));          // snow level: the green tufts are painted white
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
    if (vt.length && !SNOW) { const vm = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.5, 1.25), sprite('vines'), vt.length);
      vt.forEach(([x, y], i) => { vm.setMatrixAt(i, M.makeTranslation(x + 0.5, y - 0.45, 1.06)); add(`${x},${y}`, { m: vm, i }); }); scene.add(vm); }
    this.scenery(tops);
    for (let i = 0; i < 70; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), bm); m.visible = false; scene.add(m);
      this.deb.push({ m, v: new THREE.Vector3(), life: 0 });
    }
  }
  // Layered background: far hazy silhouettes (fog:false, flat blue) -> mid trees on floating rocks -> mist bank
  scenery(tops: number[][]) {
    const S = this.scene, M = new THREE.Matrix4(), Q = new THREE.Quaternion(), ID = new THREE.Quaternion();
    const bushes: { p: THREE.Vector3; s: number; pink: boolean }[] = [], trunks: { p: THREE.Vector3; h: number; w: number }[] = [];
    const rockMat = new THREE.MeshStandardMaterial({ color: THEME.rock, roughness: 1, flatShading: true }), topMat = new THREE.MeshStandardMaterial({ color: PAL.grass, roughness: 1 });
    const isl: { x: number; y: number; z: number; r: number }[] = [], island = (x: number, y: number, z: number, r: number) => { isl.push({ x, y, z, r }); };   // drawn instanced below (2 draw calls for all the floating rocks)
    const tree = (x: number, y: number, z: number, h: number, s: number, pink: boolean, rock = false) => {
      this.treeSpots.push({ x, y: y + h + s * 0.3, z, s });
      trunks.push({ p: new THREE.Vector3(x, y + h / 2, z), h, w: 0.18 + s * 0.07 }); bushes.push({ p: new THREE.Vector3(x, y + h + s * 0.3, z + 0.01), s, pink });
      if (rock) island(x, y, z, s * 0.55);
    };
    const rows = this.maxY > 12 ? [0, 9, 18, 27].filter(r => r < this.maxY) : [0];      // vertical bands of scenery (level 3 has 4 ground tiers)
    // far hazy giant trees: 3 layers, farther = lighter. Not fogged on purpose (they should read as a bluish shadow)
    for (let L = 0; L < 3; L++) {
      const z = -24 - L * 14, col = THEME.far.cols[L], op = THEME.far.ops[L], list: { x: number; y: number; s: number }[] = [];
      for (let x = -50 - L * 8; x < this.len + 60; x += 22 + L * 4 + rnd() * 6) list.push({ x, y: 4 + rnd() * 7, s: 16 + rnd() * 10 });
      for (const r of rows) if (r > 0) for (let x = -40 - L * 8 + rnd() * 10; x < this.len + 60; x += 44 + L * 6 + rnd() * 10) list.push({ x, y: 4 + r + rnd() * 7, s: 16 + rnd() * 10 });   // tall levels: more rows higher up
      const mk = (map: boolean) => new THREE.MeshBasicMaterial({ map: map ? tex('silhouette') : null, color: col, transparent: true, opacity: op, depthWrite: false, fog: false, alphaTest: map ? 0.02 : 0 });
      const crowns = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1.04), mk(true), list.length), stems = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mk(false), list.length);
      list.forEach((t, i) => {
        crowns.setMatrixAt(i, M.compose(new THREE.Vector3(t.x, t.y, z), ID, new THREE.Vector3(t.s, t.s, 1)));
        stems.setMatrixAt(i, M.compose(new THREE.Vector3(t.x, t.y - t.s * 0.9, z), ID, new THREE.Vector3(t.s * 0.1, t.s * 1.3, 1)));
      });
      crowns.renderOrder = stems.renderOrder = -20 + L * -1; S.add(stems, crowns);
    }
    // mid layers: real textured trees standing on floating rocks (so nothing floats), slightly hazed by scene fog
    for (const r of rows) for (let x = -6; x < this.len + 5; x += r ? 15 : 6.5) { const z = -5 - rnd() * 5, pink = THEME.allPink || rnd() < 0.4; tree(x + rnd() * 3, -1.5 + r + rnd() * 2, z, 3 + rnd() * 3, 3.2 + rnd() * 2.2, pink, true); }
    for (const r of rows) for (let x = -10; x < this.len + 10; x += r ? 22 : 10) { const z = -14 - rnd() * 4, pink = THEME.allPink || rnd() < 0.5; tree(x + rnd() * 4, 1 + r + rnd() * 4, z, 4 + rnd() * 3, 5 + rnd() * 2.5, pink, true); }
    tops.forEach(([x, y], i) => {
      if (i % 7 === 3 && x > 3 && x < this.len - 55) tree(x + 0.5, y + 1, -1.4, 0.8 + rnd() * 1.5, 1.6 + rnd() * 0.9, THEME.allPink || rnd() < 0.3);
      if (i % 5 === 1) bushes.push({ p: new THREE.Vector3(x + 0.5, y + 1.4, -0.9), s: 1.1 + rnd() * 0.4, pink: THEME.allPink });
    });
    if (isl.length) {
      const cone = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1.5, 7), rockMat, isl.length), capI = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.02, 0.95, 0.4, 7), topMat, isl.length), FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
      isl.forEach((o, i) => { cone.setMatrixAt(i, M.compose(new THREE.Vector3(o.x, o.y - o.r * 0.75, o.z), FLIP, new THREE.Vector3(o.r, o.r, o.r))); capI.setMatrixAt(i, M.compose(new THREE.Vector3(o.x, o.y - 0.18, o.z), ID, new THREE.Vector3(o.r, 1, o.r))); });
      S.add(cone, capI);
    }
    for (const pink of [false, true]) {
      const list = bushes.filter(b => b.pink === pink); if (!list.length) continue;
      const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1.04), sprite(pink ? 'bush_pink' : 'bush', pink ? THEME.bushPink : THEME.bush, THEME.lum), list.length);
      list.forEach((b, i) => im.setMatrixAt(i, M.compose(b.p, Q.setFromEuler(new THREE.Euler(0, 0, (rnd() - 0.5) * 0.15)), new THREE.Vector3(b.s * 1.6, b.s * 1.6, 1))));
      S.add(im);
    }
    const tm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.6, 1, 1, 6), new THREE.MeshStandardMaterial({ color: PAL.trunk, roughness: 1 }), trunks.length);
    trunks.forEach((t, i) => tm.setMatrixAt(i, M.compose(t.p, ID, new THREE.Vector3(t.w, t.h, t.w)))); S.add(tm);
    // mist bank: vertical gradient (clear at top, milky at bottom) hides the bottoms of rocks and the void under the level
    const N = 64, d = new Uint8Array(N * 4); for (let i = 0; i < N; i++) { const a = Math.pow(1 - i / (N - 1), 1.4); d.set([...THEME.mist, Math.round(a * 235)], i * 4); }
    const gt = new THREE.DataTexture(d, 1, N); gt.colorSpace = THREE.SRGBColorSpace; gt.magFilter = gt.minFilter = THREE.LinearFilter; gt.needsUpdate = true;
    const mist = new THREE.Mesh(new THREE.PlaneGeometry(this.len + 300, 22), new THREE.MeshBasicMaterial({ map: gt, transparent: true, depthWrite: false, fog: false }));
    mist.position.set(this.len / 2, -3, -3.2); mist.renderOrder = -5; S.add(mist);
  }
  solid(ix: number, iy: number) { return this.tiles.has(`${ix},${iy}`); }
  /** Make a rect [x,y,w,h] of tiles unbreakable (bullets stop on it) until open() is called. */
  lock(r: number[]) { for (let i = 0; i < r[2]; i++) for (let j = 0; j < r[3]; j++) this.locked.add(`${r[0] + i},${r[1] + j}`); }
  open(r: number[]) { for (let i = 0; i < r[2]; i++) for (let j = 0; j < r[3]; j++) { this.locked.delete(`${r[0] + i},${r[1] + j}`); this.destroy(r[0] + i, r[1] + j); } }
  destroy(ix: number, iy: number) {
    const key = `${ix},${iy}`; if (!this.tiles.has(key) || this.locked.has(key)) return false;
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

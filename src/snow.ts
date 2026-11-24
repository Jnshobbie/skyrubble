import * as THREE from 'three';
import { isTouch } from './input';
import type { Level } from './level';
// Level 3 weather (Japan in winter): snowfall in two depth layers, a few pink petals drifting down, puffs of snow that tumble off the tree crowns,
// and small pink petals lying on every platform. Everything lives in a window around the camera, so the cost does not grow with the level.
const FLAKES = isTouch ? 200 : 420, FAR_FLAKES = isTouch ? 120 : 260, PETALS = isTouch ? 22 : 40, PUFFS = 48;
const WIND = 1.1;                                              // snow drifts sideways at this speed (tiles/s)
const PETAL = new THREE.Color(0xe0409a), GROUND_PETAL = new THREE.Color(0xd62f90);       // same hot-pink tones as the tree crowns
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
type Fl = { x: number; y: number; z: number; v: number; ph: number; sp: number };
type Pt = { x: number; y: number; z: number; v: number; ph: number; sp: number; rot: number };
type Pf = { x: number; y: number; z: number; vx: number; vy: number; life: number; max: number; s: number };
const dot = () => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };

export class Snow {
  private layers: { pts: THREE.Points; fl: Fl[]; pos: Float32Array; depth: [number, number] }[] = []; private petals: THREE.InstancedMesh; private pd: Pt[]; private puff: THREE.InstancedMesh; private pf: Pf[] = [];
  private t = 0; private shakeT = 0; private M = new THREE.Matrix4(); private P = new THREE.Vector3(); private Q = new THREE.Quaternion(); private E = new THREE.Euler(); private S = new THREE.Vector3(1, 1, 1);
  constructor(scene: THREE.Scene, private lvl: Level) {
    const tex = dot();
    for (const [n, size, depth, op] of [[FLAKES, 0.2, [-1.5, 4], 0.95], [FAR_FLAKES, 0.11, [-14, -3], 0.75]] as const) {
      const fl: Fl[] = Array.from({ length: n }, () => ({ x: rnd(-34, 34), y: rnd(-12, 14), z: rnd(depth[0], depth[1]), v: rnd(0.9, 1.9), ph: rnd(0, 6.28), sp: rnd(0.6, 1.8) })), pos = new Float32Array(n * 3);
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: tex, size, sizeAttenuation: true, transparent: true, opacity: op, depthWrite: false, fog: false }));
      pts.frustumCulled = false; pts.renderOrder = 12; scene.add(pts); this.layers.push({ pts, fl, pos, depth: [depth[0], depth[1]] });
    }
    // drifting pink petals
    this.petals = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.22, 0.14), new THREE.MeshBasicMaterial({ color: PETAL, side: THREE.DoubleSide, fog: false }), PETALS); this.petals.frustumCulled = false;
    this.pd = Array.from({ length: PETALS }, () => ({ x: rnd(-30, 30), y: rnd(-2, 16), z: rnd(-5, 3), v: rnd(0.45, 0.95), ph: rnd(0, 6.28), sp: rnd(1, 3), rot: rnd(0, 6.28) })); scene.add(this.petals);
    // snow puffs that fall off the trees
    this.puff = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }), PUFFS); this.puff.frustumCulled = false;
    for (let i = 0; i < PUFFS; i++) { this.pf.push({ x: 0, y: -999, z: 0, vx: 0, vy: 0, life: 0, max: 1, s: 1 }); this.puff.setMatrixAt(i, this.M.makeScale(0, 0, 0)); } scene.add(this.puff);
    this.lieOnGround(scene);
  }
  /** pink petals lying on the platforms (small flecks on the white snow, in front of the grass fringe) */
  private lieOnGround(scene: THREE.Scene) {
    const tops = [...this.lvl.tiles].map(k => k.split(',').map(Number)).filter(([x, y]) => !this.lvl.tiles.has(`${x},${y + 1}`)), spots: number[][] = [];
    let s = 5; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (const [x, y] of tops) { if (r() < 0.55) spots.push([x + 0.1 + r() * 0.8, y + 1.1 + r() * 0.05, 1.06 + r() * 0.3, r() * 3.14, 0.7 + r() * 0.7]); if (r() < 0.2) spots.push([x + 0.1 + r() * 0.8, y + 1.1, 1.06 + r() * 0.3, r() * 3.14, 0.6 + r() * 0.6]); }
    if (!spots.length) return;
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.1), new THREE.MeshBasicMaterial({ color: GROUND_PETAL, side: THREE.DoubleSide }), spots.length);
    spots.forEach(([x, y, z, rot, sc], i) => im.setMatrixAt(i, this.M.compose(this.P.set(x, y, z), this.Q.setFromEuler(this.E.set(0, 0, rot)), this.S.set(sc, sc, 1)))); this.S.set(1, 1, 1);
    scene.add(im);
  }
  update(dt: number, cx: number, cy: number) {
    const t = (this.t += dt);
    for (const L of this.layers) {
      L.fl.forEach((f, i) => {
        f.y -= f.v * dt; f.x += (WIND + Math.sin(t * f.sp + f.ph) * 0.45) * dt;
        if (f.y < cy - 12) { f.y = cy + rnd(11, 15); f.z = rnd(L.depth[0], L.depth[1]); }
        else if (f.y > cy + 16) f.y = cy - 11;                                                            // the camera moved up fast: fold flakes back into view
        f.x = cx - 34 + (((f.x - (cx - 34)) % 68) + 68) % 68;                                            // flakes live in a 68-wide window around the camera
        L.pos[i * 3] = f.x; L.pos[i * 3 + 1] = f.y; L.pos[i * 3 + 2] = f.z;
      });
      (L.pts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
    this.pd.forEach((l, i) => {
      l.y -= l.v * dt; l.x += Math.sin(t * l.sp + l.ph) * 0.7 * dt + 0.5 * dt;
      if (l.y < cy - 9) l.y = cy + rnd(8, 11); else if (l.y > cy + 16) l.y = cy - 8;
      l.x = cx - 30 + (((l.x - (cx - 30)) % 60) + 60) % 60;
      this.petals.setMatrixAt(i, this.M.compose(this.P.set(l.x, l.y, l.z), this.Q.setFromEuler(this.E.set(t * l.sp * 0.8 + l.rot, t * l.sp * 0.5, t * l.sp)), this.S));
    });
    this.petals.instanceMatrix.needsUpdate = true;
    // every so often a tree near the camera shakes a little snow loose
    if ((this.shakeT -= dt) <= 0) {
      this.shakeT = rnd(0.25, 0.7);
      const near = this.lvl.treeSpots.filter(o => Math.abs(o.x - cx) < 22 && Math.abs(o.y - cy) < 9 && o.z > -12);
      if (near.length) { const o = near[Math.floor(Math.random() * near.length)]; for (let k = 0; k < 4; k++) { const p = this.pf.find(q => q.life <= 0); if (!p) break; Object.assign(p, { x: o.x + rnd(-0.6, 0.6) * o.s, y: o.y + rnd(-0.2, 0.3) * o.s, z: o.z + 0.2, vx: rnd(-0.4, 0.6), vy: rnd(-0.2, 0.3), life: rnd(1.5, 2.4), s: rnd(0.7, 1.3) }); p.max = p.life; } }
    }
    this.pf.forEach((p, i) => {
      if (p.life > 0) { p.life -= dt; p.vy -= 2.6 * dt; p.vy = Math.max(p.vy, -3.2); p.x += p.vx * dt; p.y += p.vy * dt; }
      const k = p.life > 0 ? Math.sin(Math.PI * Math.min(1, (1 - p.life / p.max) * 1.1)) * p.s : 0;   // grows in, melts away
      this.puff.setMatrixAt(i, this.M.compose(this.P.set(p.x, p.y, p.z), this.Q.identity(), this.S.set(k, k, 1)));
    }); this.S.set(1, 1, 1);
    this.puff.instanceMatrix.needsUpdate = true;
  }
}

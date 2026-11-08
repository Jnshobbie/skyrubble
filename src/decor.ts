import * as THREE from 'three';
import { load } from './glb';
import type { Level } from './level';
// Glowing night scenery: platform edges (and some tops) get glowing plants, mushrooms and lamps, plus the odd tall alien plant, so you can see where you land.
// fit = size in world units (w = width, h = height), glow = emissive strength, max = most instances of that kind.
const KINDS = [
  { url: 'models/glowing_plants.glb', fit: { w: 1.25 }, glow: 2.6, max: 999 },
  { url: 'models/glowing_mushroom.glb', fit: { h: 0.85 }, glow: 2.6, max: 999 },
  { url: 'models/eggplant_lamp.glb', fit: { h: 1.0 }, glow: 3.2, max: 4 },
  { url: 'models/alien_plant.glb', fit: { h: 3.4 }, glow: 2.4, max: 6 },
];
export function addDecor(scene: THREE.Scene, lvl: Level) {
  let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const spots: { x: number; y: number; z: number; r: number; sc: number }[][] = KINDS.map(() => []);
  const tops = [...lvl.tiles].map(k => k.split(',').map(Number)).filter(([x, y]) => !lvl.tiles.has(`${x},${y + 1}`)).sort((a, b) => a[0] - b[0]);
  for (const [x, y] of tops) {
    const left = !lvl.tiles.has(`${x - 1},${y}`), right = !lvl.tiles.has(`${x + 1},${y}`), edge = left || right, q = rnd();
    const kind = edge ? (q < 0.55 ? 0 : q < 0.85 ? 1 : q < 0.93 ? 2 : -1) : (q < 0.1 ? 0 : q < 0.15 ? 1 : q < 0.17 ? 2 : q < 0.185 ? 3 : -1);   // edges mostly get low glowing plants/mushrooms
    if (kind < 0 || spots[kind].length >= KINDS[kind].max) continue;
    spots[kind].push({ x: x + (edge ? (left ? 0.3 : 0.7) : 0.2 + rnd() * 0.6), y: y + 1, z: kind === 3 ? -1.4 : -0.8 + rnd() * 0.9, r: (rnd() - 0.5) * 1.2, sc: 0.8 + rnd() * 0.45 });
  }
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
  KINDS.forEach((k, i) => { if (!spots[i].length) return;
    load(k.url, k.fit, k.glow).then(parts => parts.forEach(p => {
      const im = new THREE.InstancedMesh(p.geo, p.mat, spots[i].length);
      spots[i].forEach((o, n) => im.setMatrixAt(n, M.compose(new THREE.Vector3(o.x, o.y - 0.02, o.z), Q.setFromAxisAngle(UP, o.r), new THREE.Vector3(o.sc, o.sc, o.sc))));
      scene.add(im);
    }));
  });
}

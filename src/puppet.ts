import * as THREE from 'three';
// Helpers to cut a static low-poly model into its separate rigid pieces (arms, legs, head, sword...) so they can be animated like a puppet (no skeleton needed).
/** Groups the triangles of a mesh into connected pieces (vertices are welded by position first, so flat-shaded meshes with duplicated vertices work too). Returns, per piece, its triangle numbers. */
export function components(pos: ArrayLike<number>, idx: ArrayLike<number> | null): number[][] {
  const nv = pos.length / 3, tris = idx ? idx.length / 3 : nv / 3, id = (t: number, k: number) => (idx ? idx[t * 3 + k] : t * 3 + k);
  const key = new Map<string, number>(), w = new Int32Array(nv);
  for (let v = 0; v < nv; v++) { const k = `${Math.round(pos[v * 3] * 1000)},${Math.round(pos[v * 3 + 1] * 1000)},${Math.round(pos[v * 3 + 2] * 1000)}`; let n = key.get(k); if (n === undefined) key.set(k, n = key.size); w[v] = n; }
  const par = Array.from({ length: key.size }, (_, i) => i), find = (a: number) => { while (par[a] !== a) a = par[a] = par[par[a]]; return a; };
  for (let t = 0; t < tris; t++) { const a = find(w[id(t, 0)]); par[find(w[id(t, 1)])] = a; par[find(w[id(t, 2)])] = a; }
  const out = new Map<number, number[]>(); for (let t = 0; t < tris; t++) { const r = find(w[id(t, 0)]); (out.get(r) ?? out.set(r, []).get(r)!).push(t); }
  return [...out.values()];
}
/** A new (non-indexed) geometry made of the given triangles of `src` (position, normal, uv copied). */
export function subGeometry(src: THREE.BufferGeometry, tris: number[]): THREE.BufferGeometry {
  const idx = src.index, g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv'] as const) {
    const a = src.getAttribute(name); if (!a) continue; const n = a.itemSize, out = new Float32Array(tris.length * 3 * n);
    tris.forEach((t, i) => { for (let k = 0; k < 3; k++) { const v = idx ? idx.getX(t * 3 + k) : t * 3 + k; for (let c = 0; c < n; c++) out[(i * 3 + k) * n + c] = a.getComponent(v, c); } });
    g.setAttribute(name, new THREE.BufferAttribute(out, n));
  }
  return g;
}
export const boxOf = (g: THREE.BufferGeometry) => { g.computeBoundingBox(); return g.boundingBox!.clone(); };

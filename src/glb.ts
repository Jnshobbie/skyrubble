import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// Shared loader for the scenery models. three 0.170 ignores KHR_materials_pbrSpecularGlossiness (monster_plant + alien_plant use it and would load plain white),
// so this plugin maps it to a normal standard material (diffuse texture -> map).
class SpecGloss {
  name = 'KHR_materials_pbrSpecularGlossiness';
  constructor(private parser: any) {}
  private ext(i: number) { return this.parser.json.materials[i]?.extensions?.[this.name]; }
  getMaterialType(i: number) { return this.ext(i) ? THREE.MeshStandardMaterial : null; }
  extendMaterialParams(i: number, p: any) {
    const e = this.ext(i); if (!e) return Promise.resolve();
    const d = e.diffuseFactor ?? [1, 1, 1, 1]; p.color = new THREE.Color().setRGB(d[0], d[1], d[2], THREE.LinearSRGBColorSpace); p.opacity = d[3]; p.metalness = 0; p.roughness = 1 - (e.glossinessFactor ?? 0.5);
    return e.diffuseTexture ? this.parser.assignTexture(p, 'map', e.diffuseTexture, THREE.SRGBColorSpace) : Promise.resolve();
  }
}
export const loader = new GLTFLoader(); loader.register(p => new SpecGloss(p) as any);
export interface Part { geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial }
/** Loads a static model, bakes all its nodes and merges every mesh that shares a material into ONE geometry (so a whole plant = 1-4 draw calls),
 *  stands it on y = 0 centered on x/z and scales it to a height `h` or a width `w` (world units). `glow` = emissive strength for the glowing materials. A missing file just returns []. */
export function load(url: string, fit: { h?: number; w?: number }, glow = 0): Promise<Part[]> {
  return new Promise(res => loader.load(url, gltf => res(bake(gltf.scene, fit, glow)), undefined, () => res([])));
}
export function bake(root: THREE.Object3D, fit: { h?: number; w?: number }, glow = 0): Part[] {
  root.updateMatrixWorld(true); const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
    root.traverse(o => {
      const m = o as THREE.Mesh; if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || Array.isArray(m.material)) return;
      let g = m.geometry.clone(); g.morphAttributes = {}; g.applyMatrix4(m.matrixWorld); if (g.index) g = g.toNonIndexed();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      (by.get(m.material) ?? by.set(m.material, []).get(m.material)!).push(g);
    });
    const parts = [...by].map(([mat, gs]) => ({ mat: mat as THREE.MeshStandardMaterial, geo: mergeGeometries(gs, false)! })).filter(p => p.geo);
    const box = new THREE.Box3(); parts.forEach(p => { p.geo.computeBoundingBox(); box.union(p.geo.boundingBox!); });
    const sz = box.getSize(new THREE.Vector3()), k = fit.h ? fit.h / sz.y : (fit.w ?? 1) / Math.max(sz.x, sz.z), cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    parts.forEach(p => { p.geo.translate(-cx, -box.min.y, -cz); p.geo.scale(k, k, k); if (glow && (p.mat.emissiveMap || p.mat.emissive.getHex() > 0)) p.mat.emissiveIntensity = glow; });
    return parts;
}

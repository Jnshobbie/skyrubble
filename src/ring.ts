import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { NIGHT } from './theme';
// Fireball impact animation (level 2): the energy rings from models/anime_vfx.glb. We take the thin ring bands out of that file and play 3 of them, nested and tilted differently,
// expanding and fading in the fireball's colour (blue for the phantoms). The file's own sphere / column pieces are not used.
const POOL = 6, LIFE = 0.55, SIZE = 1.6, START = 0.18;                  // simultaneous impacts, seconds, final radius (tiles), starting fraction of it
const TILT = 1.0, BAND = 0.3;                                          // how far the rings are turned towards the camera (rad; 0 = flat, 1.57 = face-on = invisible edge), band height as a fraction of radius
const RINGS = [{ r: 1, tilt: 0, roll: 0, delay: 0 }, { r: 0.72, tilt: 0.45, roll: 0.7, delay: 0.06 }, { r: 0.46, tilt: -0.4, roll: -0.6, delay: 0.12 }];
type Item = { g: THREE.Group; t: number; bands: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; r: number; delay: number }[]; on: boolean };
class VfxRing {
  private pool: Item[] = []; private i = 0; ready = false;
  init(scene: THREE.Scene) {
    if (!NIGHT || this.ready) return;
    new GLTFLoader().load('models/anime_vfx.glb', gl => {
      const geos: THREE.BufferGeometry[] = []; gl.scene.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; m.geometry.computeBoundingBox(); const s = m.geometry.boundingBox!.getSize(new THREE.Vector3()); if (s.y < 0.1 && s.x > 1.9) geos.push(m.geometry); });   // thin unit-radius bands = the rings
      if (!geos.length) return; const h = 0.0125;                          // the bands sit at y = 0.006 .. 0.019: re-centre them
      for (let k = 0; k < POOL; k++) {
        const g = new THREE.Group(), bands = RINGS.map((rg, n) => {
          const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide, fog: false });
          const pivot = new THREE.Group(), m = new THREE.Mesh(geos[n % geos.length], mat); m.scale.set(1, BAND / (h * 2), 1); m.position.y = -h * (BAND / (h * 2)); m.frustumCulled = false;
          pivot.rotation.set(TILT + rg.tilt, 0, rg.roll); pivot.add(m); g.add(pivot); return { m: pivot as unknown as THREE.Mesh, mat, r: rg.r, delay: rg.delay };
        });
        g.visible = false; scene.add(g); this.pool.push({ g, t: 1, bands, on: false });
      }
      this.ready = true;
    }, undefined, e => console.warn('ring: could not load anime_vfx.glb', e));
  }
  /** Starts one impact. Returns false if the effect is not available (caller then draws its simple ring). */
  play(x: number, y: number, c: THREE.Color) {
    if (!this.ready) return false; const it = this.pool[this.i++ % POOL]; it.t = 0; it.on = true; it.g.visible = true; it.g.position.set(x, y, 0.5);
    for (const b of it.bands) b.mat.color.copy(c).multiplyScalar(1.3); return true;
  }
  update(dt: number) {
    for (const it of this.pool) {
      if (!it.on) continue; it.t += dt / LIFE; if (it.t >= 1) { it.on = false; it.g.visible = false; continue; }
      for (const b of it.bands) { const k = Math.max(0, Math.min(1, (it.t * LIFE - b.delay) / (LIFE - b.delay))), e = 1 - (1 - k) ** 3, s = SIZE * b.r * (START + (1 - START) * e);
        b.m.scale.set(s, s, s); b.mat.opacity = k <= 0 ? 0 : (1 - k) ** 1.2; b.m.rotation.y += dt * 2; }
    }
  }
}
export const vfxRing = new VfxRing();

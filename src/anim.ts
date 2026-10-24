import * as THREE from 'three';
import type { Meta } from './sprites';
const cache = new Map<string, THREE.Texture>();
const base = (n: string) => {
  let t = cache.get(n);
  if (!t) { t = new THREE.TextureLoader().load(`art/${n}.png`); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; cache.set(n, t); }
  return t;
};
// Atlas-based flipbook sprite. Origin = feet, sprites face RIGHT; face=-1 mirrors.
export class AnimSprite {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; map: THREE.Texture; clip = ''; t = 0; loop = true; done = false; fps = 0;
  constructor(public m: Meta, atlas: string, scene: THREE.Scene) {
    this.map = base(atlas).clone(); this.map.needsUpdate = true; this.map.repeat.set(1 / m.cols, 1 / m.rows);
    this.mat = new THREE.MeshBasicMaterial({ map: this.map, alphaTest: 0.5, side: THREE.DoubleSide });
    const w = m.cw * m.scale, h = m.ch * m.scale, g = new THREE.PlaneGeometry(w, h); g.translate(0, h / 2 - 2 * m.scale, 0);
    this.mesh = new THREE.Mesh(g, this.mat); scene.add(this.mesh); this.play(Object.keys(m.clips)[0]);
  }
  play(name: string, loop = true, fps = 0) {
    if (this.clip === name && this.loop === loop && !this.done) return;
    this.clip = name; this.loop = loop; this.fps = fps; this.t = 0; this.done = false; this.apply(0);
  }
  apply(i: number) {
    const f = this.m.clips[this.clip][i], c = f % this.m.cols, r = Math.floor(f / this.m.cols);
    this.map.offset.set(c / this.m.cols, 1 - (r + 1) / this.m.rows);
  }
  update(dt: number) {
    const fr = this.m.clips[this.clip]; this.t += dt * (this.fps || this.m.fps[this.clip] || 8);
    let i = Math.floor(this.t);
    if (i >= fr.length) { if (this.loop) i %= fr.length; else { i = fr.length - 1; this.done = true; } }
    this.apply(i);
  }
  set(x: number, y: number, z: number, face: number) { this.mesh.position.set(x, y, z); this.mesh.scale.x = face; }
}

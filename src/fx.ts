import * as THREE from 'three';
import { vfxRing } from './ring';
// Tiny shared effects layer: pooled additive sparks/dust (one draw call), expanding shockwave rings, and camera trauma/shake.
// Usage: fx.init(scene) once; fx.burst()/fx.impact()/fx.dust() anywhere; fx.update(dt) every frame (returns the camera offset).
const N = 700, RINGS = 6;
/** CAMERA SHAKE STRENGTH: 1 = current. 1.5 = 50% stronger, 0.5 = half. Multiplies every shake in the game (fireballs, monster slams). */
export const SHAKE_SCALE = 1.5;
/** Biggest camera offset (world units) at full trauma, before SHAKE_SCALE. */
const SHAKE_MAX = 0.55;
const round = () => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.7)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); };

class Fx {
  scale = SHAKE_SCALE;                                                 // runtime shake strength (set from the Settings menu)
  focusX = 0;                                                         // player x: far-away impacts shake the camera less
  private trauma = 0; private i = 0; private ready = false;
  private pos = new Float32Array(N * 3); private col = new Float32Array(N * 3); private vel = new Float32Array(N * 3);
  private life = new Float32Array(N); private max = new Float32Array(N); private grav = new Float32Array(N); private base = new Float32Array(N * 3);
  private geo = new THREE.BufferGeometry(); private rings: { m: THREE.Mesh; t: number; c: THREE.Color }[] = []; private ri = 0;
  init(scene: THREE.Scene) {
    if (this.ready) return; this.ready = true; vfxRing.init(scene);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.pos.fill(0, 0); for (let k = 0; k < N; k++) this.pos[k * 3 + 1] = -999;
    const pts = new THREE.Points(this.geo, new THREE.PointsMaterial({ size: 0.32, map: round(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    pts.frustumCulled = false; scene.add(pts);
    for (let k = 0; k < RINGS; k++) { const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide })); m.visible = false; scene.add(m); this.rings.push({ m, t: 1, c: new THREE.Color() }); }
  }
  /** One particle. */
  private add(x: number, y: number, z: number, vx: number, vy: number, vz: number, c: THREE.Color, life: number, grav: number) {
    const k = this.i++ % N, p = k * 3; this.pos.set([x, y, z], p); this.vel.set([vx, vy, vz], p); this.base.set([c.r, c.g, c.b], p); this.col.set([c.r, c.g, c.b], p); this.life[k] = this.max[k] = life; this.grav[k] = grav;
  }
  /** Sparks flying out in all directions (biased upward). */
  burst(x: number, y: number, c: THREE.Color, n = 24, speed = 6, up = 2, grav = 14, life = 0.6) {
    for (let k = 0; k < n; k++) { const a = Math.random() * Math.PI * 2, s = speed * (0.35 + Math.random() * 0.65);
      this.add(x, y, 0.4 + (Math.random() - 0.5) * 0.6, Math.cos(a) * s, Math.abs(Math.sin(a)) * s * 0.6 + up * Math.random(), (Math.random() - 0.5) * s * 0.4, c, life * (0.6 + Math.random() * 0.6), grav); }
  }
  /** Smoke-trail puff behind a moving projectile. */
  trail(x: number, y: number, c: THREE.Color) { this.add(x + (Math.random() - 0.5) * 0.12, y + (Math.random() - 0.5) * 0.12, 0.4, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, 0, c, 0.3, 0); }
  /** Fireball hit: sparks + ring + a few embers. */
  impact(x: number, y: number, c: THREE.Color) {
    const n = c.clone().multiplyScalar(0.55); this.burst(x, y, n, 30, 7.5, 3, 16, 0.7); this.burst(x, y, new THREE.Color(1.6, 1.4, 1.1), 8, 4, 1, 10, 0.35);
    if (vfxRing.play(x, y, c)) return;                                 // level 2: the anime_vfx rings; otherwise the simple ring below
    const r = this.rings[this.ri++ % RINGS]; r.t = 0; r.c.copy(n); r.m.position.set(x, y, 0.45); r.m.visible = true;
  }
  /** Dust cloud (monster slam / landing). */
  dust(x: number, y: number, dir = 1) {
    const c = new THREE.Color(0.55, 0.45, 0.32);
    for (let k = 0; k < 16; k++) this.add(x + (Math.random() - 0.5) * 0.8, y + 0.1, 0.5, (dir * (0.5 + Math.random()) + (Math.random() - 0.5) * 2) * 2.2, 0.8 + Math.random() * 1.8, 0, c, 0.5 + Math.random() * 0.3, 2);
  }
  /** Camera shake. amp ~0.15 small, 0.35 medium, 0.6 big. If atX is given the effect fades with distance from the player. */
  shake(amp: number, atX?: number) { if (atX !== undefined) amp *= THREE.MathUtils.clamp(1.25 - Math.abs(atX - this.focusX) / 16, 0, 1); this.trauma = Math.min(1, this.trauma + amp); }
  update(dt: number) {
    for (let k = 0; k < N; k++) { if (this.life[k] <= 0) continue; const p = k * 3; this.life[k] -= dt;
      if (this.life[k] <= 0) { this.pos[p + 1] = -999; continue; }
      this.vel[p + 1] -= this.grav[k] * dt; this.pos[p] += this.vel[p] * dt; this.pos[p + 1] += this.vel[p + 1] * dt; this.pos[p + 2] += this.vel[p + 2] * dt;
      const f = this.life[k] / this.max[k]; this.col[p] = this.base[p] * f; this.col[p + 1] = this.base[p + 1] * f; this.col[p + 2] = this.base[p + 2] * f; }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true; (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    for (const r of this.rings) { if (!r.m.visible) continue; r.t += dt / 0.35; if (r.t >= 1) { r.m.visible = false; continue; }
      const s = 0.3 + r.t * 1.9; r.m.scale.set(s, s, 1); (r.m.material as THREE.MeshBasicMaterial).color.copy(r.c).multiplyScalar(1 - r.t); }
    vfxRing.update(dt); this.trauma = Math.max(0, this.trauma - dt * 1.8); const m = this.trauma * this.trauma * SHAKE_MAX * this.scale;
    return { x: (Math.random() * 2 - 1) * m, y: (Math.random() * 2 - 1) * m };
  }
}
export const fx = new Fx();

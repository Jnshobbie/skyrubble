import * as THREE from 'three';
import type { Player } from './player';

// Boss roar shockwave: a glowing ring that expands from the boss's mouth (a circle in the XY plane) with ONE visible gap.
// It only hurts where the ring is solid, so the player reads the gap and moves into it (jump up through it, or stay low).
const SPEED = 8;                 // how fast the ring grows, tiles per second
const MAX_R = 30;                // removed once it is this big
const BAND = 0.07;               // ring thickness as a fraction of its radius (drawn size AND hit zone)
const COL = new THREE.Color(1.6, 2.6, 4);   // HDR, so it blooms
const TAU = Math.PI * 2;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

interface Wave { g: THREE.Group; mats: THREE.MeshBasicMaterial[]; x: number; y: number; r: number; gap: number; half: number; }

export class SoundWaves {
  list: Wave[] = [];
  constructor(public scene: THREE.Scene) {}
  /** gap = direction (radians) of the safe opening, half = half of its angular width. */
  spawn(x: number, y: number, gap: number, half: number) {
    const arc = TAU - half * 2, start = gap + half, g = new THREE.Group(), mats: THREE.MeshBasicMaterial[] = [];
    for (const [a, b, op] of [[1 - BAND, 1, 0.95], [1 - BAND * 3.5, 1 - BAND, 0.28]] as const) {      // bright core line + a soft echo behind it
      const m = new THREE.MeshBasicMaterial({ color: COL, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
      g.add(new THREE.Mesh(new THREE.RingGeometry(a, b, 96, 1, start, arc), m)); mats.push(m);
    }
    g.position.set(x, y, 0.6); g.scale.setScalar(1.2); this.scene.add(g);
    this.list.push({ g, mats, x, y, r: 1.2, gap, half, });
  }
  private drop(w: Wave) { this.scene.remove(w.g); w.g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); }); w.mats.forEach(m => m.dispose()); }
  clear() { for (const w of this.list) this.drop(w); this.list = []; }
  update(dt: number, p: Player, speed = 1) {
    for (const w of this.list) {
      w.r += SPEED * speed * dt; w.g.scale.setScalar(w.r);
      const f = Math.max(0, 1 - w.r / MAX_R); w.mats[0].opacity = 0.95 * Math.sqrt(f); w.mats[1].opacity = 0.28 * Math.sqrt(f);
      const dx = p.x - w.x, dy = p.y + 0.65 - w.y, d = Math.hypot(dx, dy);
      if (d > w.r * (1 - BAND) - 0.5 && d < w.r + 0.5 && Math.abs(wrap(Math.atan2(dy, dx) - w.gap)) > w.half) p.hurt(Math.sign(dx) || 1);   // inside the solid part of the ring
    }
    this.list = this.list.filter(w => { if (w.r < MAX_R) return true; this.drop(w); return false; });
  }
}
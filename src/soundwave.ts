import * as THREE from 'three';
import type { Player } from './player';

// Boss roar shockwave: a soft, blurry, see-through ring that expands from the boss's mouth (a circle in the XY plane) with ONE gap.
// It only hurts where the ring is solid, so the player reads the gap and moves into it (jump up through it, or stay low).
const SPEED = 8;                 // how fast the ring grows, tiles per second
const MAX_R = 30;                // removed once it is this big
const SOFT = 0.055;              // how blurry the ring is (fraction of its radius): bigger = softer / wider
const ALPHA = 0.55;              // how visible it is: lower = more transparent
const COL = new THREE.Color(0.6, 0.85, 1);
const TAU = Math.PI * 2;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

const VERT = `varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = `
varying vec2 vP; uniform float uGap, uHalf, uOpacity, uSoft; uniform vec3 uCol;
void main() {
  float d = length(vP), ang = atan(vP.y, vP.x);
  float ring = exp(-pow((d - 0.95) / uSoft, 2.0));                                  // soft glowing line
  float haze = smoothstep(0.55, 0.95, d) * (1.0 - smoothstep(0.95, 1.12, d)) * 0.25;   // faint haze trailing behind it
  float da = abs(atan(sin(ang - uGap), cos(ang - uGap)));
  float solid = smoothstep(uHalf - 0.12, uHalf + 0.12, da);                         // soft edges around the gap
  gl_FragColor = vec4(uCol, (ring + haze) * solid * uOpacity);
}`;

interface Wave { m: THREE.Mesh; mat: THREE.ShaderMaterial; x: number; y: number; r: number; gap: number; half: number; }

export class SoundWaves {
  list: Wave[] = [];
  private geo = new THREE.PlaneGeometry(2.4, 2.4);
  constructor(public scene: THREE.Scene) {}
  /** gap = direction (radians) of the safe opening, half = half of its angular width. */
  spawn(x: number, y: number, gap: number, half: number) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uGap: { value: gap }, uHalf: { value: half }, uOpacity: { value: ALPHA }, uSoft: { value: SOFT }, uCol: { value: COL } },
    });
    const m = new THREE.Mesh(this.geo, mat); m.frustumCulled = false; m.position.set(x, y, 0.6); m.scale.setScalar(1.2); this.scene.add(m);
    this.list.push({ m, mat, x, y, r: 1.2, gap, half });
  }
  private drop(w: Wave) { this.scene.remove(w.m); w.mat.dispose(); }
  clear() { for (const w of this.list) this.drop(w); this.list = []; }
  update(dt: number, p: Player, speed = 1) {
    for (const w of this.list) {
      w.r += SPEED * speed * dt; w.m.scale.setScalar(w.r);
      w.mat.uniforms.uOpacity.value = ALPHA * Math.sqrt(Math.max(0, 1 - w.r / MAX_R));
      const dx = p.x - w.x, dy = p.y + 0.65 - w.y, d = Math.hypot(dx, dy);
      if (d > w.r * 0.9 - 0.4 && d < w.r + 0.35 && Math.abs(wrap(Math.atan2(dy, dx) - w.gap)) > w.half) p.hurt(Math.sign(dx) || 1);   // inside the solid part of the ring
    }
    this.list = this.list.filter(w => { if (w.r < MAX_R) return true; this.drop(w); return false; });
  }
}

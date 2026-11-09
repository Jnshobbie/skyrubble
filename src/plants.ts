import * as THREE from 'three';
import { load, type Part } from './glb';
import { fx } from './fx';
import type { Player, Bullets } from './player';
import type { Level } from './level';
// Level-2 obstacle (it replaces the saws): the purple monster plant. It glows, sways, snaps at you when you get close, and you can shoot it:
// it flashes when hit and explodes when it dies. The model has no bones, so the lunge is a small bend written into its vertex shader.
const HP = 5, SCORE = 250, GLOW = 3.5, SELF = 0.75;                 // hits to kill, points, glow of the purple pods, how much the whole plant lights itself
const REACH = 5.5;                                                  // it starts to lunge when you are this close (tiles)
let cache: Promise<Part[]> | null = null, haloTex: THREE.CanvasTexture | null = null;
const model = () => (cache ??= load('models/monster_plant.glb', { h: 1.9 }, GLOW));
const halo = () => haloTex ??= (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!, r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.4, 'rgba(255,255,255,0.3)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
type St = 'idle' | 'wind' | 'strike' | 'recover';
export class PlantTrap {
  g = new THREE.Group(); t = Math.random() * 6; alive = true; hp = HP; st: St = 'idle'; ts = 0; cd = 1 + Math.random(); dir = 1; bend = 0; flash = 0;
  private uBend = { value: 0 }; private uSelf = { value: SELF }; private aura: THREE.Mesh; private mats: THREE.MeshStandardMaterial[] = [];
  constructor(private scene: THREE.Scene, public x: number, public y: number) {          // y = the platform surface it grows from
    this.g.position.set(x, y - 0.05, 0.1); scene.add(this.g);
    this.aura = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), new THREE.MeshBasicMaterial({ map: halo(), color: new THREE.Color(1.4, 0.35, 2.2), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.aura.position.set(0, 1.0, -0.4); this.g.add(this.aura);
    model().then(parts => { for (const p of parts) {
      const m = p.mat.clone(); m.customProgramCacheKey = () => 'plant';
      m.onBeforeCompile = s => {
        s.uniforms.uBend = this.uBend; s.uniforms.uSelf = this.uSelf;
        s.vertexShader = 'uniform float uBend;\n' + s.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = vec3(position); float hh = clamp(position.y / 1.9, 0.0, 1.0); hh *= hh; transformed.x += uBend * hh * 1.3; transformed.y -= abs(uBend) * hh * 0.25;');
        s.fragmentShader = 'uniform float uSelf;\n' + s.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * uSelf;');
      };
      this.mats.push(m); const me = new THREE.Mesh(p.geo, m); me.frustumCulled = false; this.g.add(me);
    } });
  }
  /** returns the points earned (when it dies) */
  update(dt: number, p: Player, bul: Bullets, lvl: Level): number {
    if (!this.alive) return 0;
    this.t += dt; const dx = p.x - this.x, ady = Math.abs(p.y - this.y);
    if (this.st === 'idle') { this.cd -= dt; if (this.cd <= 0 && Math.abs(dx) < REACH && ady < 3.5) { this.st = 'wind'; this.ts = 0; this.dir = Math.sign(dx) || 1; } }
    else this.ts += dt;
    if (this.st === 'wind' && this.ts > 0.45) { this.st = 'strike'; this.ts = 0; } else if (this.st === 'strike' && this.ts > 0.2) { this.st = 'recover'; this.ts = 0; } else if (this.st === 'recover' && this.ts > 0.6) { this.st = 'idle'; this.cd = 1.4 + Math.random() * 0.8; }
    const tgt = this.st === 'wind' ? -0.4 * this.dir : this.st === 'strike' ? this.dir : Math.sin(this.t * 1.7) * 0.12;                // lean back, snap forward, sway
    this.bend += (tgt - this.bend) * Math.min(1, (this.st === 'strike' ? 28 : this.st === 'wind' ? 7 : 5) * dt); this.uBend.value = this.bend;
    this.flash = Math.max(0, this.flash - dt * 6); this.uSelf.value = SELF + this.flash * 1.6 + (this.st === 'wind' ? 0.5 : 0);                // lights up when hit and when about to strike
    (this.aura.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.12 * Math.sin(this.t * 2.4) + this.flash * 0.3 + (this.st === 'wind' ? 0.2 : 0);
    this.g.scale.y = 1 + (this.st === 'wind' ? -0.06 : 0) + Math.sin(this.t * 2.4) * 0.025;
    const hx = this.x + this.bend * 0.8, hy = this.y + 1.5;                                                    // head position (follows the bend)
    const bx = (p.x - this.x) / 0.7, by = (p.y + 0.65 - (this.y + 0.9)) / 1.0, hd = Math.hypot(p.x - hx, p.y + 0.65 - hy);
    if (bx * bx + by * by < 1 || (Math.abs(this.bend) > 0.5 && hd < 0.95)) p.hurt(Math.sign(p.x - this.x) || 1);     // touching the base, or being hit by the lunging head
    if (bul.hit(this.x, this.y + 0.95, 1.05)) {
      this.flash = 1; fx.burst(this.x, this.y + 1.2, new THREE.Color(1.6, 0.4, 2.4), 8, 5, 2, 12, 0.4);
      if (--this.hp <= 0) {
        this.alive = false; this.g.visible = false; lvl.burst(this.x, this.y + 1, 30);
        fx.burst(this.x, this.y + 1, new THREE.Color(2.4, 0.6, 3), 60, 10, 4, 9, 1); fx.burst(this.x, this.y + 1, new THREE.Color(3, 2.2, 3.5), 14, 5, 2, 8, 0.5); fx.shake(0.4, this.x);
        return SCORE;
      }
    }
    return 0;
  }
}

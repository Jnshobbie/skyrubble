import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { fx } from './fx';
import type { Player, Bullets } from './player';
import type { Level } from './level';
// Level-2 obstacle (it replaces the saws): the purple monster plant, now a rigged Mixamo character. Idle loop (built into the GLB) + the Attack clip (public/models/plant_attack.json).
// It glows, sways, and when you get close it plays the whole attack: arms/head lash out. The hurt zone follows the bones (head + both hands), so you are hit only where it actually swings.
// You can shoot it: it flashes when hit and explodes when it dies.
const HP = 5, SCORE = 250, SELF = 0.9;                              // hits to kill, points, how much the whole plant lights itself
const H = 2.1, REACH = 5.0, HIT_R = 0.8;                            // height (tiles), trigger distance (tiles), hurt radius around head / hands
const ATK_SPEED = 1.3, ATK_ON = 0.5, ATK_OFF = 2.2;                 // attack playback speed, and which part of the clip (seconds, clip time) can hurt you
const FACE = 0;                                                     // if it turns the wrong way: set to Math.PI (the model's front is assumed to be +z, towards the camera)
type Shared = { g: GLTF; bb: THREE.Box3; atk: THREE.AnimationClip | null };
let cache: Promise<Shared> | null = null, haloTex: THREE.CanvasTexture | null = null;
const shared = () => (cache ??= new GLTFLoader().loadAsync('models/monster_plant-rigged.glb').then(async g => {
  const atk = await fetch('models/plant_attack.json').then(r => r.json()).then(j => THREE.AnimationClip.parse(j)).catch(e => { console.warn('plants: no attack clip', e); return null; });
  g.scene.updateMatrixWorld(true); return { g, bb: new THREE.Box3().setFromObject(g.scene), atk };
}));
const halo = () => haloTex ??= (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!, r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.4, 'rgba(255,255,255,0.3)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
type St = 'idle' | 'attack' | 'recover';
export class PlantTrap {
  g = new THREE.Group(); private inner = new THREE.Group(); t = Math.random() * 6; alive = true; hp = HP; st: St = 'idle'; ts = 0; cd = 1 + Math.random(); dir = 1; flash = 0; private yaw = 0;
  private mixer?: THREE.AnimationMixer; private idle?: THREE.AnimationAction; private atk?: THREE.AnimationAction; private mats: THREE.MeshStandardMaterial[] = [];
  private bones: THREE.Object3D[] = []; private aura: THREE.Mesh; private v = new THREE.Vector3();
  constructor(private scene: THREE.Scene, public x: number, public y: number) {          // y = the platform surface it grows from
    this.g.position.set(x, y - 0.05, 0.1); this.g.add(this.inner); scene.add(this.g);
    this.aura = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), new THREE.MeshBasicMaterial({ map: halo(), color: new THREE.Color(1.4, 0.35, 2.2), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.aura.position.set(0, 1.0, -0.4); this.g.add(this.aura);
    shared().then(({ g, bb, atk }) => {
      const s = H / (bb.max.y - bb.min.y), m = clone(g.scene); m.scale.setScalar(s); m.position.y = -bb.min.y * s; this.inner.add(m);
      m.traverse(o => {
        const me = o as THREE.Mesh; if (!me.isMesh) return; me.frustumCulled = false;
        const mt = (me.material as THREE.MeshStandardMaterial).clone(); mt.metalness = 0; mt.roughness = 0.8;
        if (!mt.map && mt.emissiveMap) mt.map = mt.emissiveMap;                      // the GLB only lists its texture as emissive (spec-gloss data is ignored): use it as colour too
        mt.emissive.set(0xffffff); mt.emissiveIntensity = SELF; this.mats.push(mt); me.material = mt;
      });
      for (const n of ['Head', 'LeftHand', 'RightHand']) { const b = m.getObjectByName(n); if (b) this.bones.push(b); }
      this.mixer = new THREE.AnimationMixer(m); this.mixer.timeScale = 1;
      const idle = g.animations.find(c => c.name === 'Idle') ?? g.animations[0]; if (idle) { this.idle = this.mixer.clipAction(idle); this.idle.time = Math.random() * idle.duration; this.idle.play(); }
      if (atk) { this.atk = this.mixer.clipAction(atk); this.atk.setLoop(THREE.LoopOnce, 1); this.atk.clampWhenFinished = true; this.atk.timeScale = ATK_SPEED; }
    });
  }
  private startAttack() { this.st = 'attack'; this.ts = 0; this.atk?.reset().fadeIn(0.15).play(); this.idle?.fadeOut(0.15); }
  private endAttack() { this.st = 'recover'; this.ts = 0; this.idle?.reset().fadeIn(0.3).play(); this.atk?.fadeOut(0.3); }
  /** returns the points earned (when it dies) */
  update(dt: number, p: Player, bul: Bullets, lvl: Level): number {
    if (!this.alive) return 0;
    this.t += dt; const dx = p.x - this.x, ady = Math.abs(p.y - this.y); this.mixer?.update(dt);
    const clipT = this.ts * ATK_SPEED, len = this.atk ? this.atk.getClip().duration : 0;                       // where we are inside the attack clip (seconds)
    if (this.st === 'idle') { this.cd -= dt; if (this.cd <= 0 && Math.abs(dx) < REACH && ady < 3.5) { this.dir = Math.sign(dx) || 1; this.startAttack(); } }
    else this.ts += dt;
    if (this.st === 'attack' && (!this.atk || clipT >= len - 0.05)) this.endAttack();
    else if (this.st === 'recover' && this.ts > 0.4) { this.st = 'idle'; this.cd = 1.2 + Math.random() * 0.8; }
    const yawT = FACE + this.dir * (this.st === 'attack' ? Math.PI / 2 : Math.PI / 4);                     // faces you while attacking, 3/4 view otherwise
    this.yaw += (yawT - this.yaw) * Math.min(1, 8 * dt); this.inner.rotation.y = this.yaw;
    const wind = this.st === 'attack' && clipT < ATK_ON;
    this.flash = Math.max(0, this.flash - dt * 6); const e = SELF + this.flash * 1.6 + (wind ? 0.5 : 0); for (const m of this.mats) m.emissiveIntensity = e;   // lights up when hit and when about to strike
    (this.aura.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.12 * Math.sin(this.t * 2.4) + this.flash * 0.3 + (wind ? 0.2 : 0);
    const bx = (p.x - this.x) / 0.7, by = (p.y + 0.65 - (this.y + 0.9)) / 1.0;
    if (bx * bx + by * by < 1) p.hurt(Math.sign(p.x - this.x) || 1);                                         // touching the base
    else if (this.st === 'attack' && clipT > ATK_ON && clipT < ATK_OFF) {                                     // swinging: hurt only where the head / hands really are
      this.g.updateMatrixWorld(true);
      for (const b of this.bones) { b.getWorldPosition(this.v); if (Math.hypot(p.x - this.v.x, p.y + 0.65 - this.v.y) < HIT_R) { p.hurt(Math.sign(p.x - this.x) || 1); break; } }
    }
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

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { aimBone } from './hero3d';
// Rigged 3D ground enemies (one GLB per kind, cloned per enemy). Same interface as AnimSprite. Models natively face +x.
export type Cfg = { url: string; h: number; map: Record<string, string>; runScale: number; slamClip?: string; slamScale: number; bob: boolean };
export const SOLDIER: Cfg = { url: 'models/enemy.glb', h: 1.75, map: { idle: 'Idle', walk: 'Walk', run: 'Walk', shield: 'Idle', slash: 'Idle', hurt: 'Idle' }, runScale: 1.8, slamScale: 1, bob: false };
// Orc (boss.glb: club in right hand, shield in left). Has no walk clip, so walking = Idle + procedural bob; attack = the Slam clip (impact ~0.8s in, sped up).
export const ORC: Cfg = { url: 'models/boss.glb', h: 2.6, map: { idle: 'Idle', walk: 'Idle', run: 'Idle', shield: 'Idle', slash: 'Slam', hurt: 'Idle' }, runScale: 1.0, slamClip: 'Slam', slamScale: 1.6, bob: true };
const shared = new Map<string, Promise<{ g: GLTF; s: number; y: number }>>();
const loadShared = (c: Cfg) => { let p = shared.get(c.url); if (!p) { p = new GLTFLoader().loadAsync(c.url).then(g => { const bb = new THREE.Box3().setFromObject(g.scene), s = c.h / (bb.max.y - bb.min.y); return { g, s, y: -bb.min.y * s }; }); shared.set(c.url, p); } return p; };
const DIE = 0.35, HOLD = 0.25, SHRINK = 0.25;                       // fall over, lie there, vanish: 0.85s total (was ~2.2s)
const ease = (k: number) => 1 - (1 - k) * (1 - k);
export class Enemy3D {
  mesh = new THREE.Group(); private inner = new THREE.Group(); private mixer?: THREE.AnimationMixer; private acts: Record<string, THREE.AnimationAction> = {};
  private bones: Record<string, THREE.Object3D> = {}; private mats: THREE.MeshStandardMaterial[] = []; private moving = false; private bobT = Math.random() * 6;
  private cur = ''; private want = 'idle'; private yaw = 0; private deadT = 0; private slashT = 0; private flash = 0; private tint = new THREE.Color(1, 1, 1); done = false;
  constructor(scene: THREE.Scene, private cfg: Cfg = SOLDIER) {
    this.mesh.add(this.inner); scene.add(this.mesh);
    loadShared(cfg).then(({ g, s, y }) => {
      const m = clone(g.scene); m.scale.setScalar(s); m.position.y = y; this.inner.add(m);
      m.traverse(o => {
        const me = o as THREE.Mesh; if (!me.isMesh) return; me.frustumCulled = false;
        const mt = (me.material as THREE.MeshStandardMaterial).clone(); mt.metalness = 0; mt.roughness = 0.85; me.material = mt;
        if (mt.map) { mt.emissive.set(0xffffff); mt.emissiveMap = mt.map; mt.emissiveIntensity = 0.45; this.mats.push(mt); }   // lift dark textures (only textured mats, else they'd glow white)
      });
      for (const n of ['RightArm', 'RightForeArm', 'RightHand']) { const b = m.getObjectByName(n); if (b) this.bones[n] = b; }
      this.mixer = new THREE.AnimationMixer(m); for (const c of g.animations) this.acts[c.name] = this.mixer.clipAction(c); this.apply();
    });
  }
  play(name: string, _loop = true) {
    if (this.deadT) return;                                            // once dying, nothing can interrupt it (was re-triggered every frame)
    if (name === 'slash' && this.want !== 'slash') this.slashT = 0;
    if (name === 'hurt') { this.flash = 0.15; this.tint.set(1, 0.2, 0.2); return; }   // flash only: never switch clip (it would restart an attack mid-swing)
    if (name === 'shield' && this.want !== 'shield') { this.flash = 0.2; this.tint.set(0.3, 0.6, 1.4); }
    if (name === 'death') { this.deadT = 1e-4; this.inner.position.x = 0; this.inner.rotation.z = 0; if (this.mixer) this.mixer.timeScale = 0; }
    this.want = name; this.moving = name === 'walk' || name === 'run'; this.apply();
  }
  private apply() {
    const n = this.cfg.map[this.want] ?? 'Idle'; if (n === this.cur || !this.acts[n]) return;
    const next = this.acts[n], prev = this.acts[this.cur], slam = n === this.cfg.slamClip;
    next.reset().fadeIn(0.15); next.setLoop(slam ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); next.clampWhenFinished = slam; next.play(); prev?.fadeOut(0.15); this.cur = n;
    next.timeScale = slam ? this.cfg.slamScale : this.want === 'run' ? this.cfg.runScale : 1;
  }
  update(dt: number) {
    if (this.deadT) {                                                  // death is fully procedural and time-boxed: fall -> lie -> shrink -> done
      this.deadT += dt; const t = this.deadT;
      this.inner.rotation.z = ease(Math.min(1, t / DIE)) * Math.PI / 2; this.inner.position.y = 0.2 * Math.min(1, t / DIE);
      const sh = Math.max(0, Math.min(1, (t - DIE - HOLD) / SHRINK)); this.inner.scale.setScalar(Math.max(0.001, 1 - ease(sh)));
      if (t >= DIE + HOLD + SHRINK) { this.done = true; this.mesh.visible = false; }
      this.mixer?.update(0); return;
    }
    this.mixer?.update(dt);
    if (this.cfg.bob) { this.bobT += dt * (this.moving ? 9 : 2); this.inner.position.y = this.moving ? Math.abs(Math.sin(this.bobT)) * 0.09 : 0; }
    if (this.want === 'slash' && !this.cfg.slamClip) {                 // soldier: procedural swing (lunge + overhead-to-forward arm sweep)
      this.slashT += dt; const k = Math.min(1, this.slashT / 0.5), s = Math.sin(k * Math.PI), b = this.bones;
      this.inner.rotation.z = -0.3 * s; this.inner.position.x = 0.35 * s;
      if (b['RightArm'] && b['RightForeArm']) { const phi = THREE.MathUtils.lerp(2.0, -0.5, k), f = new THREE.Vector3(1, 0, 0).applyQuaternion(this.mesh.quaternion);
        const dir = f.multiplyScalar(Math.cos(phi)).add(new THREE.Vector3(0, Math.sin(phi), 0)).normalize(); this.mesh.updateMatrixWorld(true);
        aimBone(b['RightArm'], b['RightForeArm'], dir, s); aimBone(b['RightForeArm'], b['RightHand'], dir, s); }
    } else { this.inner.rotation.z = 0; this.inner.position.x = 0; }
    this.flash -= dt; const f = this.flash > 0; for (const m of this.mats) m.emissive.setRGB(f ? this.tint.r : 1, f ? this.tint.g : 1, f ? this.tint.b : 1);
  }
  set(x: number, y: number, z: number, face: number) { this.mesh.position.set(x, y, z); this.yaw += ((face > 0 ? 0 : Math.PI) - this.yaw) * 0.25; this.mesh.rotation.y = this.yaw; }
}

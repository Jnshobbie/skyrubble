import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { aimBone } from './hero3d';
// Rigged 3D shield soldier (one GLB, cloned per enemy). Same interface as AnimSprite. Model natively faces +x.
const H = 1.75, MAP: Record<string, string> = { idle: 'Idle', walk: 'Walk', run: 'Walk', shield: 'Idle', slash: 'Idle', hurt: 'Idle' };
let shared: Promise<{ g: GLTF; s: number; y: number }> | null = null;
const loadShared = () => (shared ??= new GLTFLoader().loadAsync('models/enemy.glb').then(g => {
  const bb = new THREE.Box3().setFromObject(g.scene), s = H / (bb.max.y - bb.min.y); return { g, s, y: -bb.min.y * s };
}));
export class Enemy3D {
  mesh = new THREE.Group(); private inner = new THREE.Group(); private mixer?: THREE.AnimationMixer; private acts: Record<string, THREE.AnimationAction> = {};
  private bones: Record<string, THREE.Object3D> = {}; private mats: THREE.MeshStandardMaterial[] = [];
  private cur = ''; private want = 'idle'; private yaw = 0; private deadT = 0; private slashT = 0; private flash = 0; private tint = new THREE.Color(1, 1, 1); done = false;
  constructor(scene: THREE.Scene) {
    this.mesh.add(this.inner); scene.add(this.mesh);
    loadShared().then(({ g, s, y }) => {
      const m = clone(g.scene); m.scale.setScalar(s); m.position.y = y; this.inner.add(m);
      m.traverse(o => {
        const me = o as THREE.Mesh; if (!me.isMesh) return; me.frustumCulled = false;
        const mt = (me.material as THREE.MeshStandardMaterial).clone(); mt.metalness = 0; mt.roughness = 0.85; mt.emissive.set(0xffffff); mt.emissiveMap = mt.map; mt.emissiveIntensity = 0.45; me.material = mt; this.mats.push(mt);
      });
      for (const n of ['RightArm', 'RightForeArm', 'RightHand']) { const b = m.getObjectByName(n); if (b) this.bones[n] = b; }
      this.mixer = new THREE.AnimationMixer(m); for (const c of g.animations) this.acts[c.name] = this.mixer.clipAction(c); this.apply();
    });
  }
  play(name: string, _loop = true) {
    if (name === 'slash' && this.want !== 'slash') this.slashT = 0;
    if (name === 'hurt') { this.flash = 0.15; this.tint.set(1, 0.2, 0.2); }
    if (name === 'shield' && this.want !== 'shield') { this.flash = 0.2; this.tint.set(0.3, 0.6, 1.4); }
    if (name === 'death' && !this.deadT) this.deadT = 1e-4;
    this.want = name; this.apply();
  }
  private apply() {
    const n = MAP[this.want] ?? 'Idle'; if (n === this.cur || !this.acts[n]) return;
    const next = this.acts[n], prev = this.acts[this.cur]; next.reset().fadeIn(0.15).play(); prev?.fadeOut(0.15); this.cur = n;
    next.timeScale = this.want === 'run' ? 1.8 : 1;
  }
  update(dt: number) {
    this.mixer?.update(dt);
    if (this.want === 'slash' && !this.deadT) {                        // procedural swing: lunge + overhead-to-forward arm sweep
      this.slashT += dt; const k = Math.min(1, this.slashT / 0.5), s = Math.sin(k * Math.PI), b = this.bones;
      this.inner.rotation.z = -0.3 * s; this.inner.position.x = 0.35 * s;
      if (b['RightArm'] && b['RightForeArm']) { const phi = THREE.MathUtils.lerp(2.0, -0.5, k), f = new THREE.Vector3(1, 0, 0).applyQuaternion(this.mesh.quaternion);
        const dir = f.multiplyScalar(Math.cos(phi)).add(new THREE.Vector3(0, Math.sin(phi), 0)).normalize(); this.mesh.updateMatrixWorld(true);
        aimBone(b['RightArm'], b['RightForeArm'], dir, s); aimBone(b['RightForeArm'], b['RightHand'], dir, s); }
    } else if (!this.deadT) { this.inner.rotation.z = 0; this.inner.position.x = 0; }
    if (this.deadT) { this.deadT += dt; const k = Math.min(1, this.deadT / 0.5); this.inner.rotation.z = k * Math.PI / 2; this.inner.position.y = 0.2 * k; if (this.mixer) this.mixer.timeScale = 1 - k; if (this.deadT > 0.6) this.done = true; }
    this.flash -= dt; const f = this.flash > 0; for (const m of this.mats) m.emissive.setRGB(f ? this.tint.r : 1, f ? this.tint.g : 1, f ? this.tint.b : 1);
  }
  set(x: number, y: number, z: number, face: number) { this.mesh.position.set(x, y, z); this.yaw += ((face > 0 ? 0 : Math.PI) - this.yaw) * 0.25; this.mesh.rotation.y = this.yaw; }
}

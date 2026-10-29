import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
// Rigged dragon (dragon.glb has NO clips: its rig is a humanoid skeleton whose "arms" are the wings, so we flap them procedurally).
// Model natively faces +x, wings spread along z. WINGSPAN = world units tip to tip.
const WINGSPAN = 3.6;
let shared: Promise<{ g: GLTF; s: number; cy: number }> | null = null;
const loadShared = () => (shared ??= new GLTFLoader().loadAsync('models/dragon.glb').then(g => {
  const bb = new THREE.Box3().setFromObject(g.scene), c = bb.getCenter(new THREE.Vector3()); return { g, s: WINGSPAN / (bb.max.z - bb.min.z), cy: -c.y };
}));
const _a = new THREE.Quaternion(), _b = new THREE.Quaternion(), _x = new THREE.Vector3(1, 0, 0);
export class Dragon3D {
  mesh = new THREE.Group(); private inner = new THREE.Group(); private mats: THREE.MeshStandardMaterial[] = [];
  private wing: { bone: THREE.Object3D; rest: THREE.Quaternion; sign: number }[] = []; private yaw = 0; private t = Math.random() * 6; private flash = 0; private spin = 0; mouth = new THREE.Vector3(1.2, -0.1, 0);
  constructor(scene: THREE.Scene) {
    this.mesh.add(this.inner); scene.add(this.mesh);
    loadShared().then(({ g, s, cy }) => {
      const m = clone(g.scene); m.scale.setScalar(s); m.position.y = cy * s; this.inner.add(m);
      m.traverse(o => {
        const me = o as THREE.Mesh; if (!me.isMesh) return; me.frustumCulled = false;
        const mt = (me.material as THREE.MeshStandardMaterial).clone(); mt.metalness = 0; mt.roughness = 0.8; me.material = mt;
        if (mt.map) { mt.emissive.set(0xffffff); mt.emissiveMap = mt.map; mt.emissiveIntensity = 0.4; this.mats.push(mt); }
      });
      for (const [n, sign] of [['LeftArm', 1], ['RightArm', -1], ['LeftForeArm', 0.5], ['RightForeArm', -0.5]] as const) { const b = m.getObjectByName(n); if (b) this.wing.push({ bone: b, rest: b.quaternion.clone(), sign }); }
    });
  }
  hit() { this.flash = 0.1; }
  /** Rotate each wing bone about the body's forward axis (+x, in dragon space), independent of the bone's own local axes. */
  private flap(ang: number) {
    this.mesh.updateMatrixWorld(true);
    for (const w of this.wing) {
      const p = w.bone.parent!; p.getWorldQuaternion(_a); _b.setFromAxisAngle(_x.clone().applyQuaternion(this.mesh.getWorldQuaternion(new THREE.Quaternion())), ang * w.sign);
      w.bone.quaternion.copy(_a.clone().invert().multiply(_b).multiply(_a).multiply(w.rest));
    }
  }
  update(dt: number, fireCharge: number, dying = false) {
    this.t += dt; const rate = dying ? 4 : 9 + fireCharge * 4;
    this.flap(Math.sin(this.t * rate) * (dying ? 0.4 : 0.75) + 0.15);
    this.inner.rotation.z = dying ? (this.spin += dt * 7) : Math.sin(this.t * 1.3) * 0.06 + fireCharge * 0.25;   // gentle roll; nose up while charging a fireball
    this.flash -= dt; const f = this.flash > 0 || fireCharge > 0.6, k = f ? (this.flash > 0 ? 3 : 1.6) : 1;
    for (const m of this.mats) m.emissive.setRGB(k, f ? (this.flash > 0 ? 1 : 0.6) : 1, f ? (this.flash > 0 ? 1 : 0.3) : 1);
  }
  set(x: number, y: number, z: number, face: number) { this.mesh.position.set(x, y, z); this.yaw += ((face > 0 ? 0 : Math.PI) - this.yaw) * 0.15; this.mesh.rotation.y = this.yaw; }
  muzzle() { this.mesh.updateMatrixWorld(true); return this.mesh.localToWorld(this.mouth.clone()); }
}

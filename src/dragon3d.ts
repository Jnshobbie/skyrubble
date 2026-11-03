import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
// Little bat-dragon (Goleling from ultimate_monsters_pack.glb, extracted to models/goleling.glb: faces +x, wings along z, ships a 1s wing-flap "Idle" loop).
// variant 0 = green (the model's own colours), 1 = purple (body + wing membrane recoloured). Each carries its own fireball colour (HDR, so it blooms).
const WINGSPAN = 2.8;
const VARIANTS = [
  { fire: new THREE.Color(0.5, 3.2, 0.6), body: null as THREE.Color | null, wing: null as THREE.Color | null },
  { fire: new THREE.Color(2.4, 0.5, 3.8), body: new THREE.Color(0.2, 0.05, 0.42), wing: new THREE.Color(0.5, 0.05, 0.3) },
];
let shared: Promise<{ g: GLTF; bb: THREE.Box3 }> | null = null;
const loadShared = () => (shared ??= new GLTFLoader().loadAsync('models/goleling.glb').then(g => { g.scene.updateMatrixWorld(true); return { g, bb: new THREE.Box3().setFromObject(g.scene) }; }));
export class Dragon3D {
  mesh = new THREE.Group(); private inner = new THREE.Group(); private mixer?: THREE.AnimationMixer; private flat: { m: THREE.MeshStandardMaterial; base: THREE.Color }[] = [];
  private yaw = 0; private t = Math.random() * 6; private flash = 0; private spin = 0; mouth = new THREE.Vector3(0.9, 0, 0); fire: THREE.Color;
  constructor(scene: THREE.Scene, variant = 0) {
    const v = VARIANTS[variant % VARIANTS.length]; this.fire = v.fire.clone(); this.mesh.add(this.inner); scene.add(this.mesh);
    loadShared().then(({ g, bb }) => {
      const s = WINGSPAN / (bb.max.z - bb.min.z), m = clone(g.scene); m.scale.setScalar(s); m.position.set(-(bb.max.x + bb.min.x) / 2 * s, -(bb.max.y + bb.min.y) / 2 * s, 0); this.inner.add(m);   // centre the model on the group origin
      this.mouth.set((bb.max.x - bb.min.x) / 2 * s * 0.9, 0, 0);
      m.traverse(o => {
        const me = o as THREE.Mesh; if (!me.isMesh) return; me.frustumCulled = false;
        const mt = (me.material as THREE.MeshStandardMaterial).clone(); mt.metalness = 0; mt.roughness = 0.8; me.material = mt;
        if (v.body && mt.name.startsWith('Orc_Main')) mt.color.copy(v.body); else if (v.wing && mt.name.startsWith('Pink_Secondary')) mt.color.copy(v.wing);
        const base = mt.color.clone().multiplyScalar(0.45); mt.emissive.copy(base); this.flat.push({ m: mt, base });   // flat-colour mats: lift with their own colour
      });
      this.mixer = new THREE.AnimationMixer(m); const a = this.mixer.clipAction(g.animations[0]); a.time = Math.random(); a.play();
    });
  }
  hit() { this.flash = 0.1; }
  update(dt: number, fireCharge: number, dying = false) {
    this.t += dt; if (this.mixer) { this.mixer.timeScale = dying ? 0.5 : 1 + fireCharge * 0.9; this.mixer.update(dt); }   // wings beat faster while charging a fireball
    this.inner.rotation.z = dying ? (this.spin += dt * 7) : Math.sin(this.t * 1.3) * 0.06 + fireCharge * 0.25;   // gentle roll; nose up while charging
    this.flash -= dt; const glow = fireCharge > 0.6 ? 0.3 : 0;
    for (const o of this.flat) { if (this.flash > 0) o.m.emissive.setRGB(0.9, 0.9, 0.9); else o.m.emissive.setRGB(o.base.r + this.fire.r * glow, o.base.g + this.fire.g * glow, o.base.b + this.fire.b * glow); }
  }
  set(x: number, y: number, z: number, face: number) { this.mesh.position.set(x, y, z); this.yaw += ((face > 0 ? 0 : Math.PI) - this.yaw) * 0.15; this.mesh.rotation.y = this.yaw; }
  muzzle() { this.mesh.updateMatrixWorld(true); return this.mesh.localToWorld(this.mouth.clone()); }
}

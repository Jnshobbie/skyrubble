import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { subGeometry } from './puppet';
// Level-2 flying enemy (replaces the dragons): the blue fire phantom (models/monster_-_blue_fire_phantom.glb). The GLB is static (6 meshes, no rig), so it is animated procedurally:
// the whole ghost bobs, its tail waves (vertex shader), the two claw hands float on their own and reach forward while it charges a fireball, the eyes flare. Same interface as Dragon3D.
// Fireball colour per tier (HDR so it blooms): tier 0 light blue, 1 deeper blue, 2 icy white-blue. The trail and the impact ring use the same colour.
export const GHOST_FIRE = [new THREE.Color(0.3, 1.1, 4.0), new THREE.Color(0.15, 0.55, 4.0), new THREE.Color(0.7, 1.7, 4.0)];
const H = 2.7, GLOW = new THREE.Color(0.25, 0.6, 1.0), GLOW_I = 0.7;      // height (tiles); self-light tint + strength of the body
const HAND_BOB = 0.12, HAND_REACH = 0.55;                                // hands float +-0.12 and reach 0.55 forward while charging (model units; the model is ~5 tall)
type Shared = { g: GLTF; bb: THREE.Box3 };
let cache: Promise<Shared> | null = null, haloTex: THREE.CanvasTexture | null = null;
const shared = () => (cache ??= new GLTFLoader().loadAsync('models/monster_-_blue_fire_phantom.glb').then(g => { g.scene.updateMatrixWorld(true); return { g, bb: new THREE.Box3().setFromObject(g.scene) }; }));
const halo = () => haloTex ??= (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!, r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.4, 'rgba(255,255,255,0.3)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
export class Phantom3D {
  mesh = new THREE.Group(); private inner = new THREE.Group(); private rig = new THREE.Group(); private mixT = { value: 0 }; private t = Math.random() * 6; private yaw = 0; private spin = 0; private flash = 0;
  private hands: { m: THREE.Object3D; ph: number; side: number }[] = []; private mats: { m: THREE.MeshStandardMaterial; e: THREE.Color; i: number }[] = []; private eyes: THREE.MeshStandardMaterial[] = []; private aura: THREE.Mesh;
  mouth = new THREE.Vector3(0.95, 0.2, 0); fire: THREE.Color; hitR = 1.15;
  constructor(scene: THREE.Scene, variant = 0) {
    this.fire = GHOST_FIRE[variant % GHOST_FIRE.length].clone(); this.rig.rotation.y = Math.PI / 2; this.inner.add(this.rig); this.mesh.add(this.inner); scene.add(this.mesh);
    this.aura = new THREE.Mesh(new THREE.PlaneGeometry(H * 1.6, H * 1.6), new THREE.MeshBasicMaterial({ map: halo(), color: new THREE.Color(0.2, 0.6, 2.2), transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
    this.aura.position.z = -0.6; this.inner.add(this.aura);
    shared().then(({ g, bb }) => {
      const s = H / (bb.max.y - bb.min.y), m = clone(g.scene), c = bb.getCenter(new THREE.Vector3());   // bb is measured after the root's Z-up -> Y-up rotation: world height = y
      m.scale.setScalar(s); m.position.set(-c.x * s, -c.y * s, -c.z * s); this.rig.add(m);
      const kids: THREE.Mesh[] = []; m.traverse(o => { if ((o as THREE.Mesh).isMesh) kids.push(o as THREE.Mesh); });
      for (const me of kids) {
        me.frustumCulled = false; const mt = (me.material as THREE.MeshStandardMaterial).clone(); me.material = mt; mt.metalness = 0;
        const glowing = mt.emissiveIntensity > 2;                                                        // the bright-blue material (eyes / flames)
        if (glowing) this.eyes.push(mt); else { if (mt.map) mt.emissiveMap = mt.map; mt.emissive.copy(GLOW); mt.emissiveIntensity = GLOW_I; }
        this.mats.push({ m: mt, e: mt.emissive.clone(), i: mt.emissiveIntensity });
        if (me.name === 'Plane_0') this.sway(mt);
        if (me.name === 'Plane_4' || me.name === 'Plane_5') this.splitHands(me);
      }
    });
  }
  /** Tail wave: bends the lower part of the body sideways (model space: z = up, tail hangs down along -z). */
  private sway(mt: THREE.MeshStandardMaterial) {
    const u = this.mixT; mt.onBeforeCompile = sh => {
      sh.uniforms.uT = u; sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float dep = clamp((0.4 - position.z) / 3.2, 0.0, 1.0); dep *= dep;
        transformed.x += sin(uT * 2.3 + position.z * 1.6) * 0.32 * dep;
        transformed.y += sin(uT * 1.7 + position.z * 1.1 + 1.3) * 0.22 * dep;`);
    }; mt.customProgramCacheKey = () => 'phantom-sway';
  }
  /** The claws are one mesh for both hands: cut it in two (by x) so each hand floats on its own. */
  private splitHands(me: THREE.Mesh) {
    const g = me.geometry as THREE.BufferGeometry, pos = g.getAttribute('position'), idx = g.index, L: number[] = [], R: number[] = [], n = idx ? idx.count / 3 : pos.count / 3;
    for (let t = 0; t < n; t++) { let x = 0; for (let k = 0; k < 3; k++) x += pos.getX(idx ? idx.getX(t * 3 + k) : t * 3 + k); (x < 0 ? L : R).push(t); }
    me.visible = false;
    for (const [tris, side] of [[L, -1], [R, 1]] as [number[], number][]) { const h = new THREE.Mesh(subGeometry(g, tris), me.material); h.frustumCulled = false; h.position.copy(me.position); h.quaternion.copy(me.quaternion); h.scale.copy(me.scale); me.parent!.add(h); this.hands.push({ m: h, ph: side * 1.1 + Math.random(), side }); }
  }
  hit() { this.flash = 0.1; }
  update(dt: number, fireCharge: number, dying = false) {
    this.t += dt; this.mixT.value += dt * (dying ? 0.4 : 1); const t = this.t;
    this.inner.rotation.z = dying ? (this.spin += dt * 7) : Math.sin(t * 1.3) * 0.05 + fireCharge * 0.12;
    this.rig.position.y = dying ? 0 : Math.sin(t * 1.9) * 0.1;
    for (const h of this.hands) { h.m.userData.o ??= h.m.position.clone(); const o = h.m.userData.o as THREE.Vector3;
      h.m.position.set(o.x + h.side * fireCharge * 0.12, o.y - fireCharge * HAND_REACH, o.z + Math.sin(t * 2.1 + h.ph) * HAND_BOB + fireCharge * 0.25); }     // local axes: z = up, -y = forward
    this.flash -= dt; const glow = fireCharge > 0.6 ? 1 : 0, f = this.flash > 0;
    for (const o of this.mats) { if (f) { o.m.emissive.setRGB(0.9, 0.9, 1); o.m.emissiveIntensity = 1; } else { o.m.emissive.copy(o.e); o.m.emissiveIntensity = o.i; } }
    for (const e of this.eyes) e.emissiveIntensity = 10 * (1 + glow * 0.8 + 0.15 * Math.sin(t * 6)); (this.aura.material as THREE.MeshBasicMaterial).opacity = 0.34 + 0.07 * Math.sin(t * 2.2) + fireCharge * 0.2;
  }
  set(x: number, y: number, z: number, face: number) { this.mesh.position.set(x, y, z); this.yaw += ((face > 0 ? 0 : Math.PI) - this.yaw) * 0.15; this.mesh.rotation.y = this.yaw; }
  muzzle() { this.mesh.updateMatrixWorld(true); return this.mesh.localToWorld(this.mouth.clone()); }
}

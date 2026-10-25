import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// 3D hero (rigged GLB). Same interface as AnimSprite so Player doesn't care which one it has. Model natively faces +x.
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
export function aimBone(bone: THREE.Object3D, child: THREE.Object3D, target: THREE.Vector3, w: number) {
  bone.updateWorldMatrix(true, true);
  _v1.setFromMatrixPosition(bone.matrixWorld); _v2.setFromMatrixPosition(child.matrixWorld); _v2.sub(_v1).normalize();
  _q1.setFromUnitVectors(_v2, target); bone.getWorldQuaternion(_q2); _q1.multiply(_q2);            // desired world rotation
  bone.parent!.getWorldQuaternion(_q3); _q3.invert().multiply(_q1);                                   // -> local space
  bone.quaternion.slerp(_q3, w); bone.updateMatrixWorld(true);
}
const MAP: Record<string, string> = { idle: 'Idle', run: 'Sprint', shootStand: 'Idle', shootRun: 'Sprint', jump: 'Jump', hurt: 'Idle', slide: 'Idle' };
export class Hero3D {
  mesh = new THREE.Group(); private fall = new THREE.Group(); private mixer?: THREE.AnimationMixer; private acts: Record<string, THREE.AnimationAction> = {};
  private bones: Record<string, THREE.Object3D> = {}; private gun = new THREE.Group(); private aimW = 0; private model?: THREE.Object3D; private cur = ''; private want = 'idle'; private yaw = 0; private deadT = 0; private flash = 0; private mats: THREE.MeshStandardMaterial[] = [];
  constructor(scene: THREE.Scene, url = 'models/hero.glb') {
    this.mesh.add(this.fall); scene.add(this.mesh); this.buildGun(scene);
    new GLTFLoader().load(url, g => {
      const m = g.scene; m.scale.setScalar(0.9); this.fall.add(m); this.model = m;
      for (const n of ['RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftForeArm', 'LeftHand']) { const b = m.getObjectByName(n); if (b) this.bones[n] = b; }
      m.traverse(o => {
        const me = o as THREE.Mesh; if (!me.isMesh) return; me.frustumCulled = false;
        const mt = me.material as THREE.MeshStandardMaterial; mt.metalness = 0; mt.roughness = 0.85;
        mt.emissive.set(0xffffff); mt.emissiveMap = mt.map; mt.emissiveIntensity = 0.45; this.mats.push(mt);   // lift the very dark texture
      });
      this.mixer = new THREE.AnimationMixer(m); for (const c of g.animations) this.acts[c.name] = this.mixer.clipAction(c);
      this.apply();
    }, undefined, e => console.warn('hero3d: could not load', url, e));
  }
  play(name: string, _loop = true) { this.want = name; if (name === 'death' && !this.deadT) this.deadT = 1e-4; if (name === 'hurt') this.flash = 0.25; this.apply(); }
  private apply() {
    const n = MAP[this.want] ?? 'Idle'; if (n === this.cur || !this.acts[n]) return;
    const next = this.acts[n], prev = this.acts[this.cur]; next.reset().fadeIn(0.12).play(); next.timeScale = n === 'Sprint' ? 0.85 : 1; prev?.fadeOut(0.12); this.cur = n;
  }
  // Placeholder gun (swap for a real model later). Shown only while aiming.
  private buildGun(scene: THREE.Scene) {
    const dark = new THREE.MeshStandardMaterial({ color: 0x26262c, roughness: 0.6 }), glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.6, 3) });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.13, 0.07), dark); body.position.set(0.12, 0.02, 0);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.34, 8), dark); barrel.rotation.z = Math.PI / 2; barrel.position.set(0.48, 0.04, 0);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.06), dark); grip.position.set(0.04, -0.09, 0); grip.rotation.z = 0.2;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.075), glow); strip.position.set(0.14, 0.06, 0);
    this.gun.add(body, barrel, grip, strip); this.gun.visible = false; scene.add(this.gun);
  }
  /** World position the bullets should leave from (stable even before the arms finish raising). */
  muzzle(): THREE.Vector3 {
    const arm = this.bones['RightArm']; const f = new THREE.Vector3(1, 0, 0).applyQuaternion(this.mesh.quaternion);
    const p = arm ? arm.getWorldPosition(new THREE.Vector3()) : this.mesh.position.clone().add(new THREE.Vector3(0, 1.3, 0));
    return p.addScaledVector(f, 0.95).add(new THREE.Vector3(0, -0.06, 0));
  }
  private aim(dt: number) {
    const want = this.want.startsWith('shoot') && !this.deadT ? 1 : 0; this.aimW += (want - this.aimW) * Math.min(1, dt * 16);
    const b = this.bones; if (this.aimW < 0.01 || !b['RightArm'] || !b['LeftArm']) { this.gun.visible = false; return; }
    this.mesh.updateMatrixWorld(true);
    const f = new THREE.Vector3(1, 0, 0).applyQuaternion(this.mesh.quaternion), left = new THREE.Vector3(0, 0, -1).applyQuaternion(this.mesh.quaternion);
    const tr = f.clone().addScaledVector(left, 0.12).add(new THREE.Vector3(0, 0.06, 0)).normalize();     // right arm: forward, slightly inward
    const tl = f.clone().addScaledVector(left, -0.5).add(new THREE.Vector3(0, 0.04, 0)).normalize();     // left arm: supports the gun, crossing inward
    const w = this.aimW;
    aimBone(b['RightArm'], b['RightForeArm'], tr, w); aimBone(b['RightForeArm'], b['RightHand'], tr, w);
    aimBone(b['LeftArm'], b['LeftForeArm'], tl, w); aimBone(b['LeftForeArm'], b['LeftHand'], tl, w);
    const h = b['RightHand'].getWorldPosition(new THREE.Vector3()); this.gun.position.copy(h).addScaledVector(f, -0.05);
    this.gun.quaternion.copy(this.mesh.quaternion); this.gun.rotateZ(0.05); this.gun.visible = w > 0.4;
  }
  update(dt: number) {
    this.mixer?.update(dt); this.aim(dt);
    if (this.deadT) { this.deadT += dt; const k = Math.min(1, this.deadT / 0.5); this.fall.rotation.z = k * Math.PI / 2; this.fall.position.y = 0.2 * k; if (this.mixer) this.mixer.timeScale = 1 - k; }
    this.flash -= dt; for (const m of this.mats) m.emissive.setRGB(1, this.flash > 0 ? 0.2 : 1, this.flash > 0 ? 0.2 : 1);
  }
  set(x: number, y: number, z: number, face: number) { this.mesh.position.set(x, y, z); this.yaw += ((face > 0 ? 0 : Math.PI) - this.yaw) * 0.25; this.mesh.rotation.y = this.yaw; }
}

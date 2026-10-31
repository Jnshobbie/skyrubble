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
const _P = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
/** Two-bone IK: put `hand` at T by bending the arm toward `pole`. Axis-independent (uses aimBone). */
export function reach(up: THREE.Object3D, fore: THREE.Object3D, hand: THREE.Object3D, T: THREE.Vector3, pole: THREE.Vector3, w: number) {
  up.updateWorldMatrix(true, true);
  const S = _P(up), E = _P(fore), H = _P(hand), l1 = E.distanceTo(S), l2 = H.distanceTo(E);
  const dir = T.clone().sub(S), d = Math.min(dir.length(), (l1 + l2) * 0.999); dir.normalize();
  const a = Math.acos(THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const side = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  const Ep = S.clone().addScaledVector(dir, Math.cos(a) * l1).addScaledVector(side, Math.sin(a) * l1);
  aimBone(up, fore, Ep.sub(S).normalize(), w);
  aimBone(fore, hand, T.clone().sub(_P(fore)).normalize(), w);
}
// ---- Hero = "stylized sci-fi officer" (public/models/officer.glb, CC rig, faces +z, ~181 cm tall, gun is part of the model) ----
// officer.glb ships 5 short clips cut from the source mocap (see scripts/build-officer.md): idle loop, run loop, and 3 single-frame poses (aim, carry, air).
// Legs and upper body are driven by SEPARATE actions, so you can run while the gun arm stays raised: lower = idle|run|air, upper = idle|carry|aim.
const HERO_H = 1.7, SRC_H = 1.813;                          // world height of the hero / model height as loaded (the GLB root already scales cm -> m)
const LOWER = /(Hip|Pelvis|Thigh|Calf|Foot|Toe|KneeShare|RL_BoneRoot|_rootJoint)/i;
const MUZZLE = new THREE.Vector3(0.02, 18.93, 17.71);        // barrel tip, in the gun bone's local space (measured on the aim pose)
export class Hero3D {
  mesh = new THREE.Group(); private fall = new THREE.Group(); private mixer?: THREE.AnimationMixer; private model?: THREE.Object3D;
  private lo: Record<string, THREE.AnimationAction> = {}; private up: Record<string, THREE.AnimationAction> = {}; private curLo = ''; private curUp = '';
  private hip?: THREE.Object3D; private gunBone?: THREE.Object3D; private want = 'idle'; private yaw = 0; private deadT = 0; private flash = 0; private aimW = 0;
  private mats: { m: THREE.MeshStandardMaterial; e: THREE.Color }[] = [];
  constructor(scene: THREE.Scene, url = 'models/officer.glb') {
    this.mesh.add(this.fall); scene.add(this.mesh);
    new GLTFLoader().load(url, g => {
      const m = g.scene; m.scale.setScalar(HERO_H / SRC_H); m.rotation.y = Math.PI / 2; this.fall.add(m); this.model = m;   // +z (model front) -> +x (game forward)
      m.traverse(o => {
        if (o.name === 'CC_Base_Hip_07') this.hip = o; if (o.name.startsWith('model_001') && o.name.endsWith('_0102')) this.gunBone = o;
        const me = o as THREE.Mesh; if (!me.isMesh) return; me.frustumCulled = false;
        for (const mt of ([] as THREE.Material[]).concat(me.material)) if ((mt as THREE.MeshStandardMaterial).emissive) this.mats.push({ m: mt as THREE.MeshStandardMaterial, e: (mt as THREE.MeshStandardMaterial).emissive.clone() });
      });
      this.mixer = new THREE.AnimationMixer(m);
      const split = (c: THREE.AnimationClip, lower: boolean) => new THREE.AnimationClip(c.name + (lower ? '_lo' : '_up'), c.duration, c.tracks.filter(t => LOWER.test(t.name) === lower).map(t => t.clone()));
      for (const c of g.animations) {
        if (c.name === 'idle' || c.name === 'run' || c.name === 'air') this.lo[c.name] = this.mixer.clipAction(split(c, true));
        if (c.name === 'idle' || c.name === 'carry' || c.name === 'aim') this.up[c.name] = this.mixer.clipAction(split(c, false));
      }
      this.apply(true);
    }, undefined, e => console.warn('hero3d: could not load', url, e));
  }
  play(name: string, _loop = true) { this.want = name; if (name === 'death' && !this.deadT) this.deadT = 1e-4; if (name === 'hurt') this.flash = 0.25; this.apply(); }
  private blend(set: Record<string, THREE.AnimationAction>, cur: string, next: string, force = false) {
    if (!set[next] || (next === cur && !force)) return cur;
    const a = set[next]; a.reset().fadeIn(0.12).play(); if (set[cur] && cur !== next) set[cur].fadeOut(0.12); return next;
  }
  private apply(force = false) {
    const w = this.want, shooting = w.startsWith('shoot'), moving = w === 'run' || w === 'shootRun';
    const lo = moving ? 'run' : w === 'jump' ? 'air' : 'idle', up = shooting ? 'aim' : (moving || w === 'jump') ? 'carry' : 'idle';
    if (lo !== this.curLo || force) { this.curLo = this.blend(this.lo, this.curLo, lo, force); if (this.lo.run) this.lo.run.timeScale = 1.25; }
    if (up !== this.curUp || force) this.curUp = this.blend(this.up, this.curUp, up, force);
  }
  /** True once the gun arm is up; Player waits for this before firing. */
  get aimed(): boolean { return this.aimW > 0.85; }
  /** World position of the barrel tip (a point fixed to the gun bone, so bullets always leave the muzzle). */
  muzzle(): THREE.Vector3 {
    this.mesh.updateMatrixWorld(true);
    return this.gunBone ? this.gunBone.localToWorld(MUZZLE.clone()) : this.mesh.localToWorld(new THREE.Vector3(0.9, 1.2, 0));
  }
  private _p = new THREE.Vector3();
  update(dt: number) {
    const want = this.want.startsWith('shoot') && !this.deadT ? 1 : 0; this.aimW += (want - this.aimW) * Math.min(1, dt * 14);
    this.mixer?.update(dt);
    if (this.hip && this.model) {                       // cancel the mocap's forward travel (root motion): keep the hips over the character's origin, keep height
      this.model.position.set(0, 0, 0); this.mesh.updateMatrixWorld(true);
      this.fall.worldToLocal(this.hip.getWorldPosition(this._p)); this.model.position.set(-this._p.x, 0, -this._p.z);
    }
    if (this.deadT) { this.deadT += dt; const k = Math.min(1, this.deadT / 0.5); this.fall.rotation.z = k * Math.PI / 2; this.fall.position.y = 0.2 * k; if (this.mixer) this.mixer.timeScale = 1 - k; }
    this.flash -= dt; const f = this.flash > 0; for (const { m, e } of this.mats) m.emissive.setRGB(f ? 0.9 : e.r, f ? 0.1 : e.g, f ? 0.1 : e.b);
  }
  set(x: number, y: number, z: number, face: number) { this.mesh.position.set(x, y, z); this.yaw += ((face > 0 ? 0 : Math.PI) - this.yaw) * 0.25; this.mesh.rotation.y = this.yaw; }
}

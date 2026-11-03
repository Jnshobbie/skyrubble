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
// ---- Hero = Vann (public/models/vann.glb: Mixamo rig, faces +z, 1.7 tall) + Tracer pistol (public/models/tracers_gun.glb) in the right hand ----
// vann.glb clips: idle, run, jump, air (single-frame mid-jump pose), aim (single-frame two-hand gun pose, upper body only).
// Legs and upper body are driven by SEPARATE actions, so he can run/jump while the gun arms stay up: lower = idle|run|air, upper = idle|run|air|aim.
const LOWER = /(Hips|Leg|Foot|Toe)/;                          // sanitized Mixamo bone names: mixamorigHips, mixamorigLeftUpLeg, ...
const RUN_SPEED = 2.0;                                       // run clip is 0.6 s; speed it up so the feet don't skate at the game's run speed
const GUN_URL = 'models/tracers_gun.glb', GUN_S = 0.42 / 35.4;   // gun model is ~35 units long -> 0.42 m in the game
const GUN_P = new THREE.Vector3(-0.0842, 0.1356, 0.0051), GUN_Q = new THREE.Quaternion(0.3249, 0.5452, 0.5863, -0.5034);   // gun pose in the RightHand bone's space (fitted on the aim pose)
const MUZZLE = new THREE.Vector3(0.1, 17.5, 19.1);           // barrel tip, in the gun model's own units
export class Hero3D {
  mesh = new THREE.Group(); private fall = new THREE.Group(); private mixer?: THREE.AnimationMixer; private model?: THREE.Object3D; private gun?: THREE.Object3D;
  private lo: Record<string, THREE.AnimationAction> = {}; private up: Record<string, THREE.AnimationAction> = {}; private curLo = ''; private curUp = '';
  private want = 'idle'; private yaw = 0; private deadT = 0; private flash = 0; private aimW = 0;
  private mats: { m: THREE.MeshStandardMaterial; e: THREE.Color }[] = [];
  private prep(root: THREE.Object3D) {                    // Mixamo/Sketchfab materials are metallic -> black without an env map; make them plain lit
    root.traverse(o => {
      const me = o as THREE.Mesh; if (!me.isMesh) return; me.frustumCulled = false;
      for (const mt of ([] as THREE.Material[]).concat(me.material) as THREE.MeshStandardMaterial[]) {
        mt.metalness = 0; mt.roughness = 0.8; mt.side = THREE.DoubleSide;   // double-sided: hides the open hole in the torso side
        if (mt.emissive) this.mats.push({ m: mt, e: mt.emissive.clone() });
      }
    });
  }
  constructor(scene: THREE.Scene, url = 'models/vann.glb') {
    this.mesh.add(this.fall); scene.add(this.mesh);
    new GLTFLoader().load(url, g => {
      const m = g.scene; m.rotation.y = Math.PI / 2; this.fall.add(m); this.model = m;   // +z (model front) -> +x (game forward)
      let hand: THREE.Object3D | undefined; m.traverse(o => { if (o.name === 'mixamorigRightHand') hand = o; });
      this.prep(m);
      this.mixer = new THREE.AnimationMixer(m);
      const split = (c: THREE.AnimationClip, lower: boolean) => new THREE.AnimationClip(c.name + (lower ? '_lo' : '_up'), c.duration,
        c.tracks.filter(t => LOWER.test(t.name) === lower && (lower || t.name.endsWith('.quaternion'))).map(t => t.clone()));
      for (const c of g.animations) {
        if (['idle', 'run', 'air'].includes(c.name)) this.lo[c.name] = this.mixer.clipAction(split(c, true));
        if (['idle', 'run', 'air', 'aim'].includes(c.name)) this.up[c.name] = this.mixer.clipAction(split(c, false));
      }
      this.lo.run && (this.lo.run.timeScale = RUN_SPEED); this.up.run && (this.up.run.timeScale = RUN_SPEED);
      this.apply(true);
      if (hand) new GLTFLoader().load(GUN_URL, gg => {
        const holder = new THREE.Group(); holder.position.copy(GUN_P); holder.quaternion.copy(GUN_Q);
        this.gun = gg.scene; this.gun.scale.setScalar(GUN_S); holder.add(this.gun); hand!.add(holder); this.prep(this.gun);
      }, undefined, e => console.warn('hero3d: could not load', GUN_URL, e));
    }, undefined, e => console.warn('hero3d: could not load', url, e));
  }
  play(name: string, _loop = true) { this.want = name; if (name === 'death' && !this.deadT) this.deadT = 1e-4; if (name === 'hurt') this.flash = 0.25; this.apply(); }
  private blend(set: Record<string, THREE.AnimationAction>, cur: string, next: string, force = false) {
    if (!set[next] || (next === cur && !force)) return cur;
    const a = set[next]; a.reset().fadeIn(0.12).play(); if (set[cur] && cur !== next) set[cur].fadeOut(0.12); return next;
  }
  private apply(force = false) {
    const w = this.want, shooting = w.startsWith('shoot'), moving = w === 'run' || w === 'shootRun', air = w === 'jump' || w === 'shootAir';
    const lo = air ? 'air' : moving ? 'run' : 'idle', up = shooting ? 'aim' : air ? 'air' : moving ? 'run' : 'idle';
    if (lo !== this.curLo || force) this.curLo = this.blend(this.lo, this.curLo, lo, force);
    if (up !== this.curUp || force) this.curUp = this.blend(this.up, this.curUp, up, force);
  }
  /** True once the gun arms are up; Player waits for this before firing. */
  get aimed(): boolean { return this.aimW > 0.85; }
  /** World position of the barrel tip (a point fixed to the gun, so bullets always leave the muzzle). */
  muzzle(): THREE.Vector3 {
    this.mesh.updateMatrixWorld(true);
    return this.gun ? this.gun.localToWorld(MUZZLE.clone()) : this.mesh.localToWorld(new THREE.Vector3(0.9, 1.05, 0));
  }
  update(dt: number) {
    const want = this.want.startsWith('shoot') && !this.deadT ? 1 : 0; this.aimW += (want - this.aimW) * Math.min(1, dt * 14);
    this.mixer?.update(dt);
    if (this.deadT) { this.deadT += dt; const k = Math.min(1, this.deadT / 0.5); this.fall.rotation.z = k * Math.PI / 2; this.fall.position.y = 0.2 * k; if (this.mixer) this.mixer.timeScale = 1 - k; }
    this.flash -= dt; const f = this.flash > 0; for (const { m, e } of this.mats) m.emissive.setRGB(f ? 0.9 : e.r, f ? 0.1 : e.g, f ? 0.1 : e.b);
  }
  set(x: number, y: number, z: number, face: number) { this.mesh.position.set(x, y, z); this.yaw += ((face > 0 ? 0 : Math.PI) - this.yaw) * 0.25; this.mesh.rotation.y = this.yaw; }
}

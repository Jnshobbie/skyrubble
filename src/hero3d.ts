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
const GUN_SCALE = 0.78, GRIP = new THREE.Vector3(0, -0.07, 0.24), FORE = new THREE.Vector3(0, -0.04, -0.2); // in the gun file's own units (muzzle = -z)
const MAP: Record<string, string> = { idle: 'Idle', run: 'Sprint', shootStand: 'Idle', shootRun: 'Sprint', jump: 'Jump', hurt: 'Idle', slide: 'Idle' };
export class Hero3D {
  mesh = new THREE.Group(); private fall = new THREE.Group(); private mixer?: THREE.AnimationMixer; private acts: Record<string, THREE.AnimationAction> = {};
  private bones: Record<string, THREE.Object3D> = {}; private gun = new THREE.Group(); private gunModel?: THREE.Object3D; private aimW = 0; private model?: THREE.Object3D; private cur = ''; private want = 'idle'; private yaw = 0; private deadT = 0; private flash = 0; private mats: THREE.MeshStandardMaterial[] = [];
  constructor(scene: THREE.Scene, url = 'models/hero.glb') {
    this.mesh.add(this.fall); scene.add(this.mesh); this.loadGun(scene);
    new GLTFLoader().load(url, g => {
      const m = g.scene; m.scale.setScalar(0.9); this.fall.add(m); this.model = m;
      for (const n of ['Spine2', 'RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftForeArm', 'LeftHand']) { const b = m.getObjectByName(n); if (b) this.bones[n] = b; }
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
  private loadGun(scene: THREE.Scene) {
    scene.add(this.gun); this.gun.visible = false;
    new GLTFLoader().load('models/gun.glb', g => {
      const m = g.scene; m.scale.setScalar(GUN_SCALE); m.rotation.y = -Math.PI / 2;            // muzzle (-z in file) -> +x (forward)
      m.position.copy(GRIP.clone().applyEuler(m.rotation).multiplyScalar(GUN_SCALE)).negate(); // grip sits at the pivot (= right hand)
      m.traverse(o => { (o as THREE.Mesh).frustumCulled = false; }); this.gun.add(m); this.gunModel = m;
    }, undefined, e => console.warn('hero3d: gun.glb failed', e));
  }
  private fwd() { return new THREE.Vector3(1, 0, 0).applyQuaternion(this.mesh.quaternion); }
  /** Where the right hand holds the grip: in front of the chest. */
  private grip(): THREE.Vector3 {
    const c = this.bones['Spine2'] ? _P(this.bones['Spine2']) : this.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    const left = new THREE.Vector3(0, 0, -1).applyQuaternion(this.mesh.quaternion);
    return c.addScaledVector(this.fwd(), 0.4).addScaledVector(left, -0.1).add(new THREE.Vector3(0, 0.0, 0));
  }
  /** True once the arms are up and the gun is in place; Player waits for this before firing. */
  get aimed(): boolean { return this.aimW > 0.85; }
  /** World position of the barrel tip (read from the gun mesh itself, so bullets always leave the gun). */
  muzzle(): THREE.Vector3 { this.gun.updateMatrixWorld(true); return this.gun.localToWorld(new THREE.Vector3(0.68, 0.04, 0)); }
  private aim(dt: number) {
    const want = this.want.startsWith('shoot') && !this.deadT ? 1 : 0; this.aimW += (want - this.aimW) * Math.min(1, dt * 16);
    const b = this.bones, w = this.aimW;
    if (w < 0.01 || !b['RightArm'] || !b['LeftArm'] || !b['Spine2']) { this.gun.visible = false; return; }
    this.mesh.updateMatrixWorld(true);
    const TR = this.grip(), left = new THREE.Vector3(0, 0, -1).applyQuaternion(this.mesh.quaternion), down = new THREE.Vector3(0, -1, 0);
    this.gun.position.copy(TR); this.gun.quaternion.copy(this.mesh.quaternion); this.gun.updateMatrixWorld(true);
    const TL = this.gunModel ? this.gunModel.localToWorld(FORE.clone()) : TR.clone().addScaledVector(this.fwd(), 0.3);
    reach(b['RightArm'], b['RightForeArm'], b['RightHand'], TR, down.clone().addScaledVector(left, -0.6), w);
    reach(b['LeftArm'], b['LeftForeArm'], b['LeftHand'], TL, down.clone().addScaledVector(left, 0.6), w);
    this.gun.visible = w > 0.4 && !!this.gunModel;
  }
  update(dt: number) {
    this.mixer?.update(dt); this.aim(dt);
    if (this.deadT) { this.deadT += dt; const k = Math.min(1, this.deadT / 0.5); this.fall.rotation.z = k * Math.PI / 2; this.fall.position.y = 0.2 * k; if (this.mixer) this.mixer.timeScale = 1 - k; }
    this.flash -= dt; for (const m of this.mats) m.emissive.setRGB(1, this.flash > 0 ? 0.2 : 1, this.flash > 0 ? 0.2 : 1);
  }
  set(x: number, y: number, z: number, face: number) { this.mesh.position.set(x, y, z); this.yaw += ((face > 0 ? 0 : Math.PI) - this.yaw) * 0.25; this.mesh.rotation.y = this.yaw; }
}

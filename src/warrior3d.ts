import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { components, subGeometry, boxOf } from './puppet';
// Level-2 ground monster: "Almost a Hero" armoured warrior (models/almost_a_hero_enemy.glb). The GLB is NOT skinned: it is a set of separate rigid pieces (torso, head, two arms, two legs, sword),
// so we cut it into those pieces and drive them like a puppet: idle breathing, walk cycle, overhead sword slam (same moves as the club monster), fall-over death.
// Same interface as Enemy3D (play / update / set / mesh / done), so Soldier can use it. The model faces +z; the rig group turns it to face +x.
export type Look = { h: number; glow: THREE.Color; aura: THREE.Color };                               // height (tiles); glow = self-light tint of the textures; aura = halo colour
export const WARRIOR: Look = { h: 2.2, glow: new THREE.Color(1.0, 0.55, 1.35), aura: new THREE.Color(1.5, 0.4, 2.0) };    // purple, like his armour
export const WARRIOR_ELITE: Look = { h: 3.0, glow: new THREE.Color(1.5, 0.75, 0.4), aura: new THREE.Color(2.3, 0.8, 0.25) };   // bigger and ember-orange
const GLOW = 0.8;                                                      // how strongly the textures light themselves (0 = plain lit)
// pivots (model units, feet at y=0)
const HIP_Y = 1.25, LEG_X = 0.65, SHOULDER = new THREE.Vector3(1.45, 3.05, 0), HEAD_P = new THREE.Vector3(0, 3.5, 0), HAND = new THREE.Vector3(1.78, 0.83, -0.1), GRIP = new THREE.Vector3(3.14, 1.5, 0);
/** Sword-arm pose for the overhead slam. theta = arm swing (rotation about x: negative = forward/up), psi = blade tilt relative to the torso (positive = blade tipping forward; the torso lean adds to it), lean = torso lean, lunge = forward shift (model units). Time in game seconds. */
export const SLAM = { windup: 0.4, strike: 0.12, hold: 0.1, total: 1.0 };
const ease = (k: number) => k * k * (3 - 2 * k), lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export function slamPose(t: number) {
  const REST = { theta: 0.12, psi: 0.35, lean: 0, lunge: 0, rise: 0 }, UP = { theta: -2.6, psi: -0.9, lean: -0.2, lunge: -0.1, rise: 0.15 }, HIT = { theta: -1.5, psi: 1.5, lean: 0.38, lunge: 0.9, rise: -0.05 };
  const mix = (a: typeof REST, b: typeof REST, k: number) => ({ theta: lerp(a.theta, b.theta, k), psi: lerp(a.psi, b.psi, k), lean: lerp(a.lean, b.lean, k), lunge: lerp(a.lunge, b.lunge, k), rise: lerp(a.rise, b.rise, k) });
  const { windup, strike, hold, total } = SLAM;
  if (t < windup) return mix(REST, UP, ease(t / windup));
  if (t < windup + strike) return mix(UP, HIT, Math.min(1, ((t - windup) / strike) ** 1.6));
  if (t < windup + strike + hold) return HIT;
  return mix(HIT, REST, ease(Math.min(1, (t - windup - strike - hold) / (total - windup - strike - hold))));
}
type Shared = { parts: Record<string, THREE.BufferGeometry>; tex: { body: THREE.Material; hair: THREE.Material }; hair: THREE.BufferGeometry };
let cache: Promise<Shared> | null = null, haloTex: THREE.CanvasTexture | null = null;
/** Splits the loaded model into named pieces, each geometry already shifted so its pivot is at the origin. Exported for tests. */
export function splitWarrior(pos: ArrayLike<number>, idx: ArrayLike<number> | null, body: THREE.BufferGeometry) {
  const names = new Map<string, number[]>(), put = (n: string, t: number[]) => (names.get(n) ?? names.set(n, []).get(n)!).push(...t);
  for (const tris of components(pos, idx)) {
    const b = boxOf(subGeometry(body, tris)), c = b.getCenter(new THREE.Vector3());
    if (b.min.x >= 2.6) put('sword', tris);
    else if (b.max.y <= 1.35 && b.getSize(new THREE.Vector3()).x > 1.5) put('legs', tris);                // both boots in one piece: split below
    else if (b.min.y > 3.3 && Math.abs(c.x) < 1) put('head', tris);
    else if (Math.abs(c.x) > 1.0 && b.min.y < 1.9) put(c.x > 0 ? 'armR' : 'armL', tris);                    // sleeve, fist, fingers, glove (pauldrons start above y=1.9, so they stay on the torso)
    else put('torso', tris);
  }
  return names;
}
const shared = () => (cache ??= new GLTFLoader().loadAsync('models/almost_a_hero_enemy.glb').then(g => {
  g.scene.updateMatrixWorld(true); let bodyM: THREE.Mesh | null = null, hairM: THREE.Mesh | null = null;
  g.scene.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; if ((m.material as THREE.Material).transparent) hairM = m; else bodyM = m; });
  const bg = bodyM!.geometry.clone().applyMatrix4(bodyM!.matrixWorld), parts: Record<string, THREE.BufferGeometry> = {};
  const idx = bg.index ? bg.index.array : null, pos = bg.getAttribute('position').array, groups = splitWarrior(pos, idx, bg);
  const mk = (name: string, tris: number[], pivot: THREE.Vector3) => { parts[name] = subGeometry(bg, tris).translate(-pivot.x, -pivot.y, -pivot.z); };
  const up = new THREE.Vector3(0, HIP_Y, 0);
  mk('torso', groups.get('torso') ?? [], up); mk('head', groups.get('head') ?? [], HEAD_P);
  mk('armR', groups.get('armR') ?? [], SHOULDER); mk('armL', groups.get('armL') ?? [], new THREE.Vector3(-SHOULDER.x, SHOULDER.y, 0)); mk('sword', groups.get('sword') ?? [], GRIP);
  const legs = groups.get('legs') ?? [], lg = subGeometry(bg, legs), lp = lg.getAttribute('position'), left: number[] = [], right: number[] = [];
  legs.forEach((t, i) => { const cx = (lp.getX(i * 3) + lp.getX(i * 3 + 1) + lp.getX(i * 3 + 2)) / 3; (cx < 0 ? left : right).push(t); });
  mk('legL', left, new THREE.Vector3(-LEG_X, HIP_Y, 0)); mk('legR', right, new THREE.Vector3(LEG_X, HIP_Y, 0));
  const hg = hairM!.geometry.clone().applyMatrix4(hairM!.matrixWorld); hg.translate(-HEAD_P.x, -HEAD_P.y, -HEAD_P.z); hg.morphAttributes = hairM!.geometry.morphAttributes; hg.morphTargetsRelative = hairM!.geometry.morphTargetsRelative;
  return { parts, tex: { body: bodyM!.material as THREE.Material, hair: hairM!.material as THREE.Material }, hair: hg };
}));
const halo = () => haloTex ??= (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!, r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.4, 'rgba(255,255,255,0.3)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const DIE = 0.35, HOLD = 0.25, SHRINK = 0.25, ec = (k: number) => 1 - (1 - k) * (1 - k);
export class Warrior3D {
  mesh = new THREE.Group(); private inner = new THREE.Group(); private rig = new THREE.Group(); done = false;
  private hips = new THREE.Group(); private upper = new THREE.Group(); private head = new THREE.Group(); private legL = new THREE.Group(); private legR = new THREE.Group();
  private armL = new THREE.Group(); private armR = new THREE.Group(); private sword = new THREE.Group(); private hair?: THREE.Mesh; private aura: THREE.Mesh; private mats: THREE.MeshStandardMaterial[] = [];
  private want = 'idle'; private moving = false; private run = false; private phase = Math.random() * 6; private t = Math.random() * 6; private slashT = 0; private flash = 0; private tint = new THREE.Color(1, 1, 1);
  private yaw = 0; private deadT = 0; private s: number;
  constructor(scene: THREE.Scene, private look: Look = WARRIOR) {
    this.s = look.h / 6.43; this.rig.scale.setScalar(this.s); this.rig.rotation.y = Math.PI / 2; this.inner.add(this.rig); this.mesh.add(this.inner); scene.add(this.mesh);
    this.aura = new THREE.Mesh(new THREE.PlaneGeometry(look.h * 1.7, look.h * 1.7), new THREE.MeshBasicMaterial({ map: halo(), color: look.aura.clone(), transparent: true, opacity: 0.38, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
    this.aura.position.set(0, look.h * 0.5, -0.5); this.inner.add(this.aura);
    this.hips.position.y = 0; this.rig.add(this.hips);
    shared().then(({ parts, tex, hair }) => {
      const mat = (src: THREE.Material) => { const u = src as THREE.MeshBasicMaterial, m = new THREE.MeshStandardMaterial({ map: u.map, side: u.side, transparent: u.transparent, opacity: u.opacity, alphaTest: u.alphaTest }); m.metalness = 0; m.roughness = 0.85; if (m.map) { m.emissiveMap = m.map; m.emissive.copy(look.glow); m.emissiveIntensity = GLOW; } this.mats.push(m); return m; };
      const body = mat(tex.body), mk = (n: string) => { const me = new THREE.Mesh(parts[n], body); me.frustumCulled = false; return me; };
      this.upper.position.set(0, HIP_Y, 0); this.hips.add(this.upper, this.legL, this.legR);
      this.legL.position.set(-LEG_X, HIP_Y, 0); this.legR.position.set(LEG_X, HIP_Y, 0); this.legL.add(mk('legL')); this.legR.add(mk('legR'));
      this.upper.add(mk('torso')); this.head.position.copy(HEAD_P).sub(this.upper.position); this.head.add(mk('head')); this.upper.add(this.head);
      const hm = mat(tex.hair); hm.transparent = true; hm.depthWrite = false; this.hair = new THREE.Mesh(hair, hm); this.hair.frustumCulled = false; this.head.add(this.hair);
      this.armR.position.set(SHOULDER.x, SHOULDER.y - HIP_Y, 0); this.armL.position.set(-SHOULDER.x, SHOULDER.y - HIP_Y, 0); this.armR.add(mk('armR')); this.armL.add(mk('armL'));
      this.sword.position.copy(HAND).sub(SHOULDER); this.sword.add(mk('sword')); this.armR.add(this.sword); this.upper.add(this.armR, this.armL);
    });
  }
  play(name: string, _loop = true) {
    if (this.deadT) return;
    if (name === 'slash' && this.want !== 'slash') this.slashT = 0;
    if (name === 'hurt') { this.flash = 0.15; this.tint.set(1, 0.2, 0.2); return; }
    if (name === 'death') { this.deadT = 1e-4; this.inner.position.x = 0; this.inner.rotation.z = 0; }
    this.want = name; this.moving = name === 'walk' || name === 'run'; this.run = name === 'run';
  }
  update(dt: number) {
    if (this.deadT) {                                                  // fall over -> lie -> shrink -> done (same timing as Enemy3D)
      this.deadT += dt; const t = this.deadT; this.inner.rotation.z = ec(Math.min(1, t / DIE)) * Math.PI / 2; this.inner.position.y = 0.2 * Math.min(1, t / DIE);
      const sh = Math.max(0, Math.min(1, (t - DIE - HOLD) / SHRINK)); this.inner.scale.setScalar(Math.max(0.001, 1 - ec(sh)));
      if (t >= DIE + HOLD + SHRINK) { this.done = true; this.mesh.visible = false; } return;
    }
    this.t += dt; const t = this.t; let theta = 0.12, psi = 0.35, lean = 0, lunge = 0, rise = 0, legA = 0, armSwing = 0, bob = 0, roll = 0;
    if (this.want === 'slash') { this.slashT += dt; const p = slamPose(Math.min(this.slashT, SLAM.total)); ({ theta, psi, lean, lunge, rise } = p); }
    else if (this.moving) { const A = this.run ? 0.8 : 0.55; this.phase += dt * (this.run ? 14 : 10); const sn = Math.sin(this.phase); legA = sn * A; armSwing = -sn * A * 0.8;   // stride sized to the patrol / chase speed (no foot sliding)
      bob = 1.25 * (1 - Math.cos(A * Math.abs(sn))); lean = 0.1; roll = sn * 0.04; theta = 0.12 + armSwing * 0.5; psi = 0.35 + armSwing * 0.3; }
    else { const b = Math.sin(t * 2.2); this.upper.scale.y = 1 + b * 0.018; armSwing = b * 0.05; theta += armSwing; psi += b * 0.04; lean = b * 0.01; }
    if (this.want === 'slash' || this.moving) this.upper.scale.y = 1;
    this.hips.position.y = bob + rise; this.hips.position.x = lunge; this.upper.rotation.set(lean, 0, roll); this.legL.rotation.x = legA; this.legR.rotation.x = -legA;
    this.armR.rotation.x = theta; this.sword.rotation.x = psi - theta; this.armL.rotation.x = this.want === 'slash' ? lerp(0.1, -0.9, Math.min(1, this.slashT / 0.4)) : -armSwing * 0.8;
    this.head.rotation.x = this.moving ? Math.sin(this.phase * 2) * 0.04 : Math.sin(t * 1.1) * 0.03;
    if (this.hair) { const inf = this.hair.morphTargetInfluences; if (inf && inf.length >= 2) { inf[0] = 0.5 + 0.5 * Math.sin(t * 5.3); inf[1] = 0.5 + 0.5 * Math.sin(t * 4.1 + 2); } }
    (this.aura.material as THREE.MeshBasicMaterial).opacity = 0.34 + 0.08 * Math.sin(t * 2.6) + (this.want === 'slash' && this.slashT < SLAM.windup ? 0.15 : 0);
    this.flash -= dt; const f = this.flash > 0; for (const m of this.mats) { if (f) m.emissive.copy(this.tint); else m.emissive.copy(this.look.glow); m.emissiveIntensity = f ? 1.2 : GLOW; }
  }
  set(x: number, y: number, z: number, face: number) { this.mesh.position.set(x, y, z); this.yaw += ((face > 0 ? 0 : Math.PI) - this.yaw) * 0.25; this.mesh.rotation.y = this.yaw; }
}

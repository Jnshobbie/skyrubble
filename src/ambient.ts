import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { isTouch } from './input';
// Night-level ambience: a glow around the hero, drifting glowing leaves (pink + blue), slow mist bands, and a few glowing butterflies that live along the level
// (they flutter around their own spot, shy away when you get close, and are NOT following you).
const GLOW_COLOR = 0x9fd8ee, GLOW_LIGHT = 14, GLOW_HALO = 0.22;                  // light on the world, and the soft halo drawn over it
const LEAVES = isTouch ? 36 : 64, BUTTERFLIES = isTouch ? 3 : 5;
const BUTTERFLY_SIZE = 0.7, BUTTERFLY_YAW = 0, BUTTERFLY_TILT = 1.0;              // size (biggest side, world units); yaw offset if it flies backwards; tilt shows the wings to the camera
const MIST = 0x7f9cff, MIST_AMOUNT = 0;                                         // colour of the drifting mist bands, and how strong they are (0 = none, 1 = the old full fog; try 0.3 for a hint)
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
type Fly = { g: THREE.Group; mx: THREE.AnimationMixer; hx: number; hy: number; a: number; b: number; ph: number; rx: number; ry: number; x: number; y: number; z: number; yaw: number };
type Leaf = { x: number; y: number; z: number; v: number; ph: number; sp: number; rot: number };
type Band = { mesh: THREE.Mesh; t: THREE.Texture; sp: number; pf: number };

export class Ambient {
  light = new THREE.PointLight(GLOW_COLOR, GLOW_LIGHT, 18, 1.6); halo: THREE.Mesh; leaves: THREE.InstancedMesh; ld: Leaf[]; flies: Fly[] = []; bands: Band[] = []; t = 0;
  private M = new THREE.Matrix4(); private P = new THREE.Vector3(); private Q = new THREE.Quaternion(); private E = new THREE.Euler(); private S = new THREE.Vector3(1, 1, 1);
  constructor(scene: THREE.Scene) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!, gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: tex, color: GLOW_COLOR, transparent: true, opacity: GLOW_HALO, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.halo.renderOrder = 10; scene.add(this.light, this.halo);
    // leaves
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false });
    this.leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.26, 0.17), mat, LEAVES); this.leaves.frustumCulled = false;
    const pink = new THREE.Color(2.2, 0.55, 1.5), blue = new THREE.Color(0.35, 1.1, 2.4);
    this.ld = Array.from({ length: LEAVES }, (_, i) => { this.leaves.setColorAt(i, i % 2 ? pink : blue); return { x: rnd(-28, 28), y: rnd(-2, 16), z: rnd(-5, 3), v: rnd(0.5, 1.1), ph: rnd(0, 6.28), sp: rnd(1, 3), rot: rnd(0, 6.28) }; });
    scene.add(this.leaves);
    // mist bands: soft blobs on a seamless canvas, 3 big planes at different depths that drift slowly (brouillard)
    const mc = document.createElement('canvas'); mc.width = 256; mc.height = 64; const mg = mc.getContext('2d')!;
    for (let i = 0; i < 16; i++) { const x = rnd(0, 256), y = rnd(22, 42), r = rnd(22, 46); for (const ox of [-256, 0, 256]) { const gg = mg.createRadialGradient(x + ox, y, 0, x + ox, y, r); gg.addColorStop(0, 'rgba(255,255,255,0.55)'); gg.addColorStop(1, 'rgba(255,255,255,0)'); mg.fillStyle = gg; mg.fillRect(0, 0, 256, 64); } }
    const mt = new THREE.CanvasTexture(mc); mt.wrapS = mt.wrapT = THREE.RepeatWrapping; mt.colorSpace = THREE.SRGBColorSpace; mt.repeat.set(2.2, 1);
    for (const [z, y, op, sp, pf] of [[-2.6, 3.2, 0.32, 0.012, 1], [-9, 5.5, 0.27, 0.007, 0.7], [-17, 8, 0.22, 0.004, 0.4]]) {
      const t = mt.clone(); t.needsUpdate = true;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(64, 9), new THREE.MeshBasicMaterial({ map: t, color: MIST, transparent: true, opacity: op * MIST_AMOUNT, depthWrite: false, fog: false }));
      mesh.visible = MIST_AMOUNT > 0; mesh.position.set(0, y, z); mesh.renderOrder = -8; scene.add(mesh); this.bands.push({ mesh, t, sp, pf });
    }
    // butterflies
    new GLTFLoader().load('models/glowing_butterfly_animation.glb', gltf => {
      const box = new THREE.Box3().setFromObject(gltf.scene), sz = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3()), k = BUTTERFLY_SIZE / Math.max(sz.x, sz.y, sz.z);
      for (let i = 0; i < BUTTERFLIES; i++) {
        const m = clone(gltf.scene), inner = new THREE.Group(), g = new THREE.Group(); m.position.copy(ctr).multiplyScalar(-1); inner.scale.setScalar(k); inner.add(m); g.add(inner);
        m.traverse(o => { const me = o as THREE.Mesh; if (me.isMesh) { me.frustumCulled = false; (me.material as THREE.MeshStandardMaterial).emissiveIntensity = 2.2; } });
        const mx = new THREE.AnimationMixer(m); if (gltf.animations[0]) { const a = mx.clipAction(gltf.animations[0]); a.timeScale = rnd(0.8, 1.3); a.time = rnd(0, 1); a.play(); }
        const hx = rnd(6, 50); scene.add(g);
        this.flies.push({ g, mx, hx, hy: rnd(2.5, 8.5), a: rnd(0.3, 0.7), b: rnd(0.4, 0.9), ph: rnd(0, 6.28), rx: rnd(2, 5), ry: rnd(0.8, 1.8), x: hx, y: 5, z: rnd(-0.8, 1.2), yaw: Math.PI / 2 });
      }
    });
  }
  update(dt: number, px: number, py: number, cx: number, cy: number) {
    const t = (this.t += dt);
    this.light.position.set(px, py + 1.3, 1.8); this.light.intensity = GLOW_LIGHT * (0.94 + 0.04 * Math.sin(t * 7.3) + 0.02 * Math.sin(t * 13.1));
    this.halo.position.set(px, py + 1.2, 1.6);
    for (const b of this.bands) { b.mesh.position.x = cx; b.t.offset.x = (cx / 29) * b.pf + t * b.sp; }
    this.ld.forEach((l, i) => {
      l.y -= l.v * dt; l.x += Math.sin(t * l.sp + l.ph) * 0.6 * dt + 0.25 * dt;
      if (l.y < cy - 9) l.y = cy + rnd(7, 10);
      l.x = cx - 30 + (((l.x - (cx - 30)) % 60) + 60) % 60;                                  // leaves live in a 60-wide window around the camera
      this.leaves.setMatrixAt(i, this.M.compose(this.P.set(l.x, l.y, l.z), this.Q.setFromEuler(this.E.set(t * l.sp * 0.8 + l.rot, t * l.sp * 0.5, t * l.sp)), this.S));
    });
    this.leaves.instanceMatrix.needsUpdate = true;
    for (const f of this.flies) {
      if (f.hx < cx - 38) { f.hx = cx + rnd(25, 48); f.hy = rnd(2.5, 8.5); } else if (f.hx > cx + 62) { f.hx = cx - rnd(20, 40); f.hy = rnd(2.5, 8.5); }   // a butterfly that fell far behind re-appears ahead
      let tx = f.hx + Math.sin(t * f.a + f.ph) * f.rx, ty = f.hy + Math.sin(t * f.b + f.ph * 1.7) * f.ry;
      const sx = f.x - px, sy = f.y - (py + 1), sd = Math.hypot(sx, sy);
      if (sd < 2.8) { tx = f.x + (sx / (sd || 1)) * 3; ty = f.y + (sy / (sd || 1)) * 3 + 1; }   // shy: flutters away when you get close
      const vx = tx - f.x, sp = Math.min(1, (sd < 2.8 ? 4 : 1.6) * dt); f.x += vx * sp; f.y += (ty - f.y) * sp;
      f.yaw += ((vx >= 0 ? Math.PI / 2 : -Math.PI / 2) + BUTTERFLY_YAW - f.yaw) * Math.min(1, 5 * dt);
      f.g.visible = Math.abs(f.x - cx) < 24; f.g.position.set(f.x, f.y, f.z); f.g.rotation.set(BUTTERFLY_TILT, f.yaw, 0); if (f.g.visible) f.mx.update(dt);
    }
  }
}

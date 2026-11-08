import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { isTouch } from './input';
// Night-level ambience: a glow around the hero, drifting glowing leaves (pink + blue) and glowing butterflies that follow the player.
const GLOW_COLOR = 0x9fd8ff, GLOW_LIGHT = 14, GLOW_HALO = 0.22;                 // light on the world, and the soft halo drawn over it
const LEAVES = isTouch ? 36 : 64, BUTTERFLIES = isTouch ? 4 : 7;
const BUTTERFLY_SIZE = 0.8, BUTTERFLY_YAW = 0;                                   // biggest side in world units; yaw offset (radians) if the model flies sideways
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
type Fly = { g: THREE.Group; mx: THREE.AnimationMixer; a: number; b: number; ph: number; rx: number; ry: number; x: number; y: number; z: number };
type Leaf = { x: number; y: number; z: number; v: number; ph: number; sp: number; rot: number };

export class Ambient {
  light = new THREE.PointLight(GLOW_COLOR, GLOW_LIGHT, 18, 1.6); halo: THREE.Mesh; leaves: THREE.InstancedMesh; ld: Leaf[]; flies: Fly[] = []; t = 0;
  private M = new THREE.Matrix4(); private P = new THREE.Vector3(); private Q = new THREE.Quaternion(); private E = new THREE.Euler(); private S = new THREE.Vector3(1, 1, 1);
  constructor(scene: THREE.Scene) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!, gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: tex, color: GLOW_COLOR, transparent: true, opacity: GLOW_HALO, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.halo.renderOrder = 10; scene.add(this.light, this.halo);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false });
    this.leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.26, 0.17), mat, LEAVES); this.leaves.frustumCulled = false;
    const pink = new THREE.Color(2.2, 0.55, 1.5), blue = new THREE.Color(0.35, 1.1, 2.4);
    this.ld = Array.from({ length: LEAVES }, (_, i) => { this.leaves.setColorAt(i, i % 2 ? pink : blue); return { x: rnd(-28, 28), y: rnd(-2, 16), z: rnd(-5, 3), v: rnd(0.5, 1.1), ph: rnd(0, 6.28), sp: rnd(1, 3), rot: rnd(0, 6.28) }; });
    scene.add(this.leaves);
    new GLTFLoader().load('models/glowing_butterfly_animation.glb', gltf => {
      const box = new THREE.Box3().setFromObject(gltf.scene), sz = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3()), k = BUTTERFLY_SIZE / Math.max(sz.x, sz.y, sz.z);
      for (let i = 0; i < BUTTERFLIES; i++) {
        const m = clone(gltf.scene), inner = new THREE.Group(), g = new THREE.Group(); m.position.copy(ctr).multiplyScalar(-1); inner.scale.setScalar(k); inner.add(m); g.add(inner);
        m.traverse(o => { const me = o as THREE.Mesh; if (me.isMesh) { me.frustumCulled = false; (me.material as THREE.MeshStandardMaterial).emissiveIntensity = 2.2; } });
        const mx = new THREE.AnimationMixer(m); if (gltf.animations[0]) { const a = mx.clipAction(gltf.animations[0]); a.timeScale = rnd(0.8, 1.3); a.time = rnd(0, 1); a.play(); }
        scene.add(g); this.flies.push({ g, mx, a: rnd(0.3, 0.7), b: rnd(0.4, 0.9), ph: rnd(0, 6.28), rx: rnd(1.5, 4.5), ry: rnd(0.6, 1.8), x: 0, y: 0, z: rnd(-0.8, 1.2) });
      }
    });
  }
  update(dt: number, px: number, py: number, cx: number, cy: number) {
    const t = (this.t += dt);
    this.light.position.set(px, py + 1.3, 1.8); this.light.intensity = GLOW_LIGHT * (0.94 + 0.04 * Math.sin(t * 7.3) + 0.02 * Math.sin(t * 13.1));
    this.halo.position.set(px, py + 1.2, 1.6);
    this.ld.forEach((l, i) => {
      l.y -= l.v * dt; l.x += Math.sin(t * l.sp + l.ph) * 0.6 * dt + 0.25 * dt;
      if (l.y < cy - 9) l.y = cy + rnd(7, 10);
      l.x = cx - 30 + (((l.x - (cx - 30)) % 60) + 60) % 60;                                  // leaves live in a 60-wide window around the camera
      this.leaves.setMatrixAt(i, this.M.compose(this.P.set(l.x, l.y, l.z), this.Q.setFromEuler(this.E.set(t * l.sp * 0.8 + l.rot, t * l.sp * 0.5, t * l.sp)), this.S));
    });
    this.leaves.instanceMatrix.needsUpdate = true;
    for (const f of this.flies) {
      const tx = px + Math.sin(t * f.a + f.ph) * f.rx, ty = py + 1.6 + Math.sin(t * f.b + f.ph * 1.7) * f.ry;
      if (f.x === 0 && f.y === 0) { f.x = tx; f.y = ty; }
      const vx = tx - f.x; f.x += vx * Math.min(1, 2 * dt); f.y += (ty - f.y) * Math.min(1, 2 * dt);
      f.g.position.set(f.x, f.y, f.z); f.g.rotation.y += ((vx >= 0 ? 0 : Math.PI) + BUTTERFLY_YAW - f.g.rotation.y) * Math.min(1, 6 * dt); f.mx.update(dt);
    }
  }
}

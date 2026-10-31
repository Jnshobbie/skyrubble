import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// Dev tool: http://localhost:5173/viewer.html?model=models/zeromus.glb  -- browse a model's clips, scrub, mark named segments (idle/attack/death...), isolate one character of a pack.
const q = new URLSearchParams(location.search), url = q.get('model') ?? 'models/officer.glb';
const ui = document.getElementById('ui')!, canvas = document.getElementById('c') as HTMLCanvasElement;
const R = new THREE.WebGLRenderer({ canvas, antialias: true }); R.setPixelRatio(devicePixelRatio);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2a3142); scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.2)); const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(3, 6, 4); scene.add(sun);
scene.add(new THREE.GridHelper(20, 20, 0x667, 0x445));
const cam = new THREE.PerspectiveCamera(45, 1, 0.01, 2000), ctl = new OrbitControls(cam, canvas);
const resize = () => { R.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }; addEventListener('resize', resize); resize();
const el = (h: string) => { const d = document.createElement('div'); d.innerHTML = h; ui.appendChild(d); return d; };
let mixer: THREE.AnimationMixer, action: THREE.AnimationAction | undefined, clips: THREE.AnimationClip[] = [], playing = true, groups: THREE.Object3D[] = [], gi = 0, root: THREE.Object3D;
const segs: Record<string, unknown> = {};
function frame(o: THREE.Object3D) { const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3()).length() || 1; ctl.target.copy(c); cam.position.copy(c).add(new THREE.Vector3(0.6, 0.35, 1).normalize().multiplyScalar(s * 1.1)); cam.near = s / 500; cam.far = s * 50; cam.updateProjectionMatrix(); }
const hasSkin = (o: THREE.Object3D) => { let f = false; o.traverse(c => { if ((c as THREE.SkinnedMesh).isSkinnedMesh) f = true; }); return f; };
function findGroups(o: THREE.Object3D): THREE.Object3D[] { let cur: THREE.Object3D = o; for (let d = 0; d < 6; d++) { const k = cur.children.filter(hasSkin); if (k.length >= 2) return k; if (k.length === 0) return []; cur = k[0]; } return []; }
function isolate(i: number) { gi = (i + groups.length) % groups.length; groups.forEach((g, k) => g.visible = k === gi); (document.getElementById('gname') as HTMLElement).textContent = `${gi + 1}/${groups.length}: ${groups[gi].name}`; frame(groups[gi]); }
function pick(name: string) { action?.stop(); const c = clips.find(x => x.name === name)!; action = mixer.clipAction(c); action.play(); const s = document.getElementById('t') as HTMLInputElement; s.max = String(c.duration); (document.getElementById('dur') as HTMLElement).textContent = c.duration.toFixed(2) + 's'; }
new GLTFLoader().load(url, g => {
  root = g.scene; scene.add(root); clips = g.animations; mixer = new THREE.AnimationMixer(root); groups = findGroups(root);
  el(`<b>${url}</b>`);
  if (groups.length) { el(`<h4>Characters in this pack</h4><button id="pv">&lt; prev</button> <button id="nx">next &gt;</button> <span id="gname"></span>`); (document.getElementById('pv') as HTMLElement).onclick = () => isolate(gi - 1); (document.getElementById('nx') as HTMLElement).onclick = () => isolate(gi + 1); isolate(0); } else frame(root);
  root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.frustumCulled = false; });
  if (!clips.length) { el('<i>no animations in this file</i>'); return; }
  el(`<h4>Clip</h4><select id="cl">${clips.map(c => `<option>${c.name}</option>`).join('')}</select> <span id="dur"></span><br><button id="pp">pause</button> time <input id="t" type="range" min="0" max="1" step="0.01" style="width:170px"> <span id="tv">0</span>s<br>speed <input id="sp" type="number" value="1" step="0.25">`);
  const cl = document.getElementById('cl') as HTMLSelectElement; cl.onchange = () => pick(cl.value); pick(cl.value);
  const t = document.getElementById('t') as HTMLInputElement, pp = document.getElementById('pp') as HTMLButtonElement;
  pp.onclick = () => { playing = !playing; pp.textContent = playing ? 'pause' : 'play'; }; t.oninput = () => { playing = false; pp.textContent = 'play'; action!.time = +t.value; };
  el(`<h4>Mark a segment</h4>name <input id="nm" value="idle" style="width:90px"> start <input id="s0" type="number" step="0.05" value="0"> end <input id="s1" type="number" step="0.05" value="1"><br><button id="b0">start = now</button> <button id="b1">end = now</button> <button id="loop">preview loop</button> <button id="add">add to JSON</button>`);
  const cur = () => action!.time, gv = (id: string) => document.getElementById(id) as HTMLInputElement;
  gv('b0').onclick = () => gv('s0').value = cur().toFixed(2); gv('b1').onclick = () => gv('s1').value = cur().toFixed(2);
  let loop: [number, number] | null = null; gv('loop').onclick = () => { loop = [+gv('s0').value, +gv('s1').value]; playing = true; pp.textContent = 'pause'; action!.time = loop[0]; };
  gv('add').onclick = () => { segs[gv('nm').value] = { clip: cl.value, t0: +gv('s0').value, t1: +gv('s1').value }; (document.getElementById('json') as HTMLTextAreaElement).value = JSON.stringify(segs, null, 1); };
  el(`<h4>Segments (copy this back to Claude)</h4><textarea id="json" readonly></textarea>`);
  (window as any).__loop = () => loop;
});
const clock = new THREE.Clock();
R.setAnimationLoop(() => {
  const dt = clock.getDelta(); const sp = +((document.getElementById('sp') as HTMLInputElement | null)?.value ?? 1);
  if (mixer && action) { mixer.timeScale = playing ? sp : 0; mixer.update(dt); const L = (window as any).__loop?.(); if (L && action.time > L[1]) action.time = L[0];
    const t = document.getElementById('t') as HTMLInputElement | null; if (t && playing) { t.value = String(action.time); (document.getElementById('tv') as HTMLElement).textContent = action.time.toFixed(2); } }
  ctl.update(); R.render(scene, cam);
});

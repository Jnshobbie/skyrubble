import * as THREE from 'three';
import { makeComposer } from './grade';
import { poll, isTouch } from './input';
import { Level, PAL } from './level';
import { Player, Bullets } from './player';
import { Soldier, Dragon, Hazards, Saw, CLUB_OPT, CLUB_ELITE } from './foes';
import { Boss3D } from './boss3d';
import { fx } from './fx';
import { buildMap } from './map';
import { menu, stats, save } from './menu';

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(PAL.sky); scene.fog = new THREE.Fog(PAL.sky, 14, 75);
const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 120); cam.position.set(2, 5, 17);
const sun = new THREE.DirectionalLight(0xffe2b0, 2.6); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 16, bottom: -16, near: 1, far: 60 }); scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0x9fd9ff, 0x5a7a3a, 1.1));
const comp = makeComposer(renderer, scene, cam, isTouch);
fx.init(scene);
function resize() { renderer.setSize(innerWidth, innerHeight); comp.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const MAP = buildMap();
const lvl = new Level(scene, MAP.rects, MAP.len + 10);
const player = new Player(scene), bul = new Bullets(scene), hz = new Hazards(scene);
// Resume from the last checkpoint after a reload / R (kept in sessionStorage). Debug: ?cp=2 starts at checkpoint 2.
const qs = new URLSearchParams(location.search); let cpIdx = Number(qs.get('cp') ?? sessionStorage.getItem('sky_cp') ?? 0);
if (qs.has('cp')) sessionStorage.setItem('sky_cp', String(cpIdx));
let respawn = { x: cpIdx > 0 ? MAP.checkpoints[cpIdx - 1] : 2, y: cpIdx > 0 ? 3 : 4 }; player.x = respawn.x; player.y = respawn.y; let camX = player.x, camY = 5;
// Enemies are created lazily when the player gets within 55 tiles, updated + drawn only within 40 (the world is ~4x bigger now; keeps phones fast).
type Ent<T extends { alive: boolean }> = { x: number; make: () => T; o?: T };
const foes: Ent<Soldier>[] = MAP.foes.filter(f => f.x > respawn.x - 20).map(f => ({ x: f.x, make: () => new Soldier(scene, f.x, f.y, Math.max(0.8, f.r), f.elite ? CLUB_ELITE : CLUB_OPT) }));
const dragons: Ent<Dragon>[] = MAP.dragons.filter(d => d.x > respawn.x - 20).map(d => ({ x: d.x, make: () => new Dragon(scene, d.x, d.y, d.v) }));
const saws = MAP.saws.filter(w => w.x > respawn.x - 20).map(w => new Saw(scene, w.x, w.y, w.rx));
const stream = <T extends { alive: boolean }>(list: Ent<T>[], vis: (o: T, on: boolean) => void, step: (o: T) => void) => {
  for (const e of list) { const d = Math.abs(e.x - player.x); if (!e.o && d < 55) e.o = e.make(); if (e.o?.alive) { const on = d < 40; vis(e.o, on); if (on) step(e.o); } }
};
const boss = new Boss3D(scene, MAP.bossX, 2, MAP.arenaX);
// checkpoint flags. FLAG_SCALE: 1 = pole 3 tiles tall; 0.6 = 60% size
const FLAG_SCALE = 0.6;
const flags = MAP.checkpoints.map((x, i) => { const g = new THREE.Group(), pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3, 6), new THREE.MeshStandardMaterial({ color: 0x4a3a30 })),
  cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.75), new THREE.MeshBasicMaterial({ color: i < cpIdx ? 0x40ff70 : 0xff3a4a, side: THREE.DoubleSide })); pole.position.y = 1.5; cloth.position.set(0.6, 2.55, 0); g.add(pole, cloth); g.position.set(x, 2, -0.5); g.scale.setScalar(FLAG_SCALE); scene.add(g); return { x, cloth, on: i < cpIdx }; });
const toast = document.body.appendChild(document.createElement('div')); toast.style.cssText = 'position:fixed;top:64px;left:50%;transform:translateX(-50%);color:#fff;font:900 30px system-ui;text-shadow:0 3px 0 #0008;opacity:0;transition:opacity .4s;pointer-events:none';
let toastT = 0; const say = (t: string) => { toast.textContent = t; toast.style.opacity = '1'; toastT = 2.2; };
let safe = { x: respawn.x, y: respawn.y };
let score = 0, over = false;
const $ = (id: string) => document.getElementById(id)!;
const msg = (t: string) => { $('msg').style.display = 'flex'; $('msg').innerHTML = '<div>' + t + '</div>'; };
// ---- menu / pause flow: the game starts on the title menu (world frozen behind it); `sky_auto` = skip the title after Retry / Restart
let paused = true, started = false, saveT = 0, overT = 0;
const play = () => { menu.close(); paused = false; if (!started) { started = true; stats.games++; save(); } };
const reloadAuto = () => { sessionStorage.setItem('sky_auto', '1'); save(); location.reload(); };
menu.on.play = play; menu.on.resume = () => { menu.close(); paused = false; };
menu.on.restart = reloadAuto; menu.on.newGame = () => { sessionStorage.removeItem('sky_cp'); reloadAuto(); };
menu.on.quit = () => { if (!started && !over) { window.close(); say('You can close this tab'); } else { sessionStorage.removeItem('sky_auto'); save(); location.reload(); } };
menu.on.pause = () => { if (started && !over && !paused) { paused = true; menu.open('pause'); } };
addEventListener('keydown', e => { if (e.code === 'Escape' || e.code === 'KeyP') { if (menu.isOpen && started && !over) menu.on.resume(); else menu.on.pause(); } });
addEventListener('blur', () => menu.on.pause());
addEventListener('pagehide', save);
if (sessionStorage.getItem('sky_auto')) { sessionStorage.removeItem('sky_auto'); play(); } else menu.open('title', { cp: cpIdx });
const clock = new THREE.Clock();
(function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 1 / 30);
  if (!over && !paused) {
    stats.time += dt; if ((saveT += dt) > 5) { saveT = 0; save(); }
    poll(); player.update(dt, lvl, bul); bul.update(dt, lvl);
    stream(foes, (o, on) => { o.spr.mesh.visible = on; }, o => { { const g = o.update(dt, player, bul, lvl, scene); score += g; if (g > 0) { stats.kills++; stats.score += g; } } });
    stream(dragons, (o, on) => { if (o.d3) o.d3.mesh.visible = on; }, o => { { const g = o.update(dt, player, bul, lvl, hz, scene); score += g; if (g > 0) { stats.kills++; stats.score += g; } } });
    for (const w of saws) if (Math.abs(w.x - player.x) < 40) w.update(dt, player);
    for (const [i, f] of flags.entries()) if (!f.on && player.x > f.x) { f.on = true; cpIdx = i + 1; stats.cp = Math.max(stats.cp, cpIdx); respawn = { x: f.x, y: 3 }; sessionStorage.setItem('sky_cp', String(cpIdx)); (f.cloth.material as THREE.MeshBasicMaterial).color.set(0x40ff70);
      fx.burst(f.x + 0.6, 4.5, new THREE.Color(0.5, 3, 0.8), 30, 6, 3, 8, 0.9); say(`CHECKPOINT ${cpIdx} / ${flags.length}`); }
    toastT -= dt; if (toastT < 0) toast.style.opacity = '0';
    if (player.ground && lvl.solid(Math.floor(player.x - 0.8), Math.floor(player.y - 0.5)) && lvl.solid(Math.floor(player.x + 0.8), Math.floor(player.y - 0.5)) && player.inv <= 0) safe = { x: player.x, y: player.y + 0.3 };   // last firm footing
    if (!boss.active && player.x > MAP.arenaX + 8) { boss.active = true; boss.next(player); $('boss').style.display = 'block'; }
    score += boss.update(dt, player, bul, lvl, hz); hz.update(dt, player, lvl); lvl.update(dt);
    if (player.y < -8) { player.hp--; player.x = safe.x - Math.sign(player.vx || 1) * 1.2; player.y = safe.y; player.vy = 0; player.inv = 1.2; }     // fell: back to the last firm ground (not the start)
    if (player.hp <= 0) { over = true; stats.deaths++; stats.best = Math.max(stats.best, score); stats.bestDate = new Date().toLocaleDateString(); save(); overT = 1.3; }
    if (boss.dead) { over = true; stats.wins++; stats.best = Math.max(stats.best, score); stats.bestDate = new Date().toLocaleDateString(); save(); overT = 1.8; sessionStorage.removeItem('sky_cp'); }
  }
  if (over && player.hp <= 0) player.animOnly(dt, lvl);
  if (over && overT > 0 && (overT -= dt) <= 0) menu.open(player.hp <= 0 ? 'over' : 'win', { score });
  ($('hp').firstChild as HTMLElement).style.width = Math.max(0, player.hp / 5 * 100) + '%';
  ($('boss').firstChild as HTMLElement).style.width = (boss.shieldHp > 0 ? boss.shieldHp / 14 * 50 + 50 : boss.hp / 30 * 50) + '%';
  $('score').textContent = String(score);
  if (paused && !started) { camX += (player.x + 6 + Math.sin(performance.now() / 4000) * 3 - camX) * Math.min(1, 1.5 * dt); }   // title: slow drift
  else camX += (player.x + player.face * 2.5 - camX) * Math.min(1, 4 * dt);
  camY += (Math.max(4.5, player.y + 2.5) - camY) * Math.min(1, 3 * dt);
  fx.focusX = player.x; const sh = fx.update(dt);                  // particles + camera shake (offset is added after smoothing so it never feeds back)
  cam.position.set(camX + sh.x, camY + sh.y, 17); cam.lookAt(camX + sh.x, camY - 0.5 + sh.y, 0);
  sun.position.set(player.x + 12, 24, 14); sun.target.position.set(player.x, 4, 0);
  comp.render(dt);
})();

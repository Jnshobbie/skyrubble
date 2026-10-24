import * as THREE from 'three';
import { makeComposer } from './grade';
import { poll, isTouch } from './input';
import { Level, PAL } from './level';
import { Player, Bullets } from './player';
import { Drone, Dragon, Boss, Hazards } from './foes';

const LEVEL = Number(new URLSearchParams(location.search).get('level') ?? 1); // ?level=2 → dragons
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(PAL.sky); scene.fog = new THREE.Fog(PAL.sky, 22, 60);
const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 120); cam.position.set(2, 5, 17);
const sun = new THREE.DirectionalLight(0xffe2b0, 2.6); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 16, bottom: -16, near: 1, far: 60 }); scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0x9fd9ff, 0x5a7a3a, 1.1));
const comp = makeComposer(renderer, scene, cam, isTouch);
function resize() { renderer.setSize(innerWidth, innerHeight); comp.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const lvl = new Level(scene, [[0, 0, 20, 2], [24, 0, 14, 2], [42, 0, 12, 2], [58, 0, 40, 2], [8, 5, 4, 1], [16, 8, 4, 1], [27, 5, 5, 1], [34, 8, 4, 1], [44, 5, 5, 1], [50, 8, 3, 1], [31, 2, 2, 4], [62, 2, 1, 3]]);
const player = new Player(scene), bul = new Bullets(scene), hz = new Hazards(scene);
const drones = [[12, 4], [18, 6.5], [29, 4], [36, 6], [46, 4], [52, 6.5]].map(([x, y]) => new Drone(scene, x, y));
const dragons = LEVEL >= 2 ? [[22, 9], [40, 10], [56, 9]].map(([x, y]) => new Dragon(scene, x, y)) : [];
const boss = new Boss(scene, 88, 2);
let score = 0, over = false;
const $ = (id: string) => document.getElementById(id)!;
const msg = (t: string) => { $('msg').style.display = 'flex'; $('msg').innerHTML = t; };
const clock = new THREE.Clock();
(function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 1 / 30);
  if (!over) {
    poll(); player.update(dt, lvl, bul); bul.update(dt, lvl);
    for (const d of drones) if (d.alive) score += d.update(dt, player, bul, lvl, scene);
    for (const d of dragons) if (d.alive) score += d.update(dt, player, bul, lvl, hz, scene);
    if (!boss.active && player.x > 78) { boss.active = true; boss.next(player); $('boss').style.display = 'block'; }
    score += boss.update(dt, player, bul, lvl, hz); hz.update(dt, player, lvl); lvl.update(dt);
    if (player.y < -8) { player.hp--; player.x = Math.max(2, Math.floor(player.x / 20) * 20 - 14); player.y = 5; player.vy = 0; }
    if (player.hp <= 0) { over = true; msg('GAME OVER<br><small>press R / reload</small>'); }
    if (boss.dead) { over = true; msg('SKYRUBBLE CLEARED!<br>' + score); }
  }
  ($('hp').firstChild as HTMLElement).style.width = Math.max(0, player.hp / 5 * 100) + '%';
  ($('boss').firstChild as HTMLElement).style.width = (boss.shieldHp > 0 ? boss.shieldHp / 14 * 50 + 50 : boss.hp / 30 * 50) + '%';
  $('score').textContent = String(score);
  cam.position.x += (player.x + player.face * 2.5 - cam.position.x) * Math.min(1, 4 * dt);
  cam.position.y += (Math.max(4.5, player.y + 2.5) - cam.position.y) * Math.min(1, 3 * dt);
  cam.lookAt(cam.position.x, cam.position.y - 0.5, 0);
  sun.position.set(player.x + 12, 24, 14); sun.target.position.set(player.x, 4, 0);
  comp.render(dt);
})();

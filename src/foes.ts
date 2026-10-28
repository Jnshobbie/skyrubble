import * as THREE from 'three';
import { Level } from './level';
import { Player, Bullets } from './player';
import { AnimSprite } from './anim';
import { Enemy3D } from './enemy3d';
const USE3D_ENEMY = new URLSearchParams(location.search).get('enemy') === '3d'; // open /?hero=3d&enemy=3d
import { ENEMY, BOSS } from './sprites';
const mk = (g: THREE.BufferGeometry, c: number, e = 0) => { const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, emissive: e })); m.castShadow = true; return m; };

// Enemy fire / shockwaves
export class Hazards {
  list: { m: THREE.Mesh; vx: number; vy: number; r: number; life: number }[] = [];
  constructor(public scene: THREE.Scene) {}
  spawn(x: number, y: number, vx: number, vy: number, r: number, life = 3, flat = false) {
    const m = new THREE.Mesh(flat ? new THREE.BoxGeometry(0.5, 0.6, 1.6) : new THREE.IcosahedronGeometry(r, 1),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.2, 0.2), toneMapped: false }));
    m.position.set(x, y, 0); this.scene.add(m); this.list.push({ m, vx, vy, r, life });
  }
  update(dt: number, p: Player, lvl: Level) {
    for (const h of this.list) {
      h.life -= dt; h.m.position.x += h.vx * dt; h.m.position.y += h.vy * dt; h.m.rotation.z += dt * 9;
      if (Math.abs(h.m.position.x - p.x) < h.r + 0.35 && Math.abs(h.m.position.y - (p.y + 0.65)) < h.r + 0.65) { p.hurt(Math.sign(p.x - h.m.position.x) || 1); if (h.r > 0.3) h.life = 0; }
      if (lvl.solid(Math.floor(h.m.position.x), Math.floor(h.m.position.y)) && h.r < 0.5 && h.vy !== 0) { lvl.burst(h.m.position.x, h.m.position.y, 3); h.life = 0; }
      if (h.life <= 0) this.scene.remove(h.m);
    }
    this.list = this.list.filter(h => h.life > 0);
  }
}

// One enemy type, cloned everywhere: hovering drone
export class Drone {
  m = new THREE.Group(); hp = 3; t = Math.random() * 6; alive = true;
  constructor(scene: THREE.Scene, public bx: number, public by: number, public range = 3) {
    const ring = mk(new THREE.TorusGeometry(0.7, 0.07, 6, 16), 0xffd23a, 0x553300); ring.rotation.x = Math.PI / 2;
    this.m.add(mk(new THREE.IcosahedronGeometry(0.5, 1), 0x7a2cff, 0x2a0a66), ring);
    scene.add(this.m);
  }
  update(dt: number, p: Player, bul: Bullets, lvl: Level, scene: THREE.Scene) {
    this.t += dt; const x = this.bx + Math.sin(this.t * 0.9) * this.range, y = this.by + Math.sin(this.t * 2.2) * 0.35;
    this.m.position.set(x, y, 0); this.m.rotation.y += dt * 3;
    if (bul.hit(x, y, 0.8) && --this.hp <= 0) { this.alive = false; lvl.burst(x, y, 10); scene.remove(this.m); return 100; }
    if (Math.hypot(p.x - x, p.y + 0.65 - y) < 0.95) p.hurt(Math.sign(p.x - x) || 1);
    return 0;
  }
}

// Level 2: flying dragon that throws fireballs
export class Dragon {
  m = new THREE.Group(); hp = 5; t = Math.random() * 6; cd = 1.5; alive = true; wings: THREE.Mesh[] = [];
  constructor(scene: THREE.Scene, public bx: number, public by: number) {
    this.m.add(mk(new THREE.SphereGeometry(0.7, 10, 8), 0xd6342a, 0x3a0500)); (this.m.children[0] as THREE.Mesh).scale.set(1.5, 0.8, 0.8);
    const head = mk(new THREE.ConeGeometry(0.3, 0.7, 6), 0xff7a2a); head.rotation.z = Math.PI / 2; head.position.x = 1.1; this.m.add(head);
    for (const s of [-1, 1]) { const w = mk(new THREE.BoxGeometry(1.4, 0.06, 0.8), 0x7a1a6a); w.position.set(-0.1, 0.4, s * 0.9); this.wings.push(w); this.m.add(w); }
    scene.add(this.m);
  }
  update(dt: number, p: Player, bul: Bullets, lvl: Level, hz: Hazards, scene: THREE.Scene) {
    this.t += dt; const x = this.bx + Math.sin(this.t * 0.6) * 5, y = this.by + Math.sin(this.t * 1.3) * 1.2;
    this.m.position.set(x, y, 0); this.m.scale.x = p.x > x ? 1 : -1;
    this.wings.forEach((w, i) => w.rotation.x = Math.sin(this.t * 10) * 0.6 * (i ? 1 : -1));
    this.cd -= dt;
    if (this.cd <= 0) { const dx = p.x - x, dy = p.y + 0.7 - y, d = Math.hypot(dx, dy) || 1; hz.spawn(x, y, dx / d * 9, dy / d * 9, 0.35); this.cd = 2.2; }
    if (bul.hit(x, y, 1.1) && --this.hp <= 0) { this.alive = false; lvl.burst(x, y, 14); scene.remove(this.m); return 300; }
    return 0;
  }
}

// Shield soldier: patrols, chases, slashes. Shield blocks shots from the front; shoot him from behind (or jump over).
export class Soldier {
  spr: AnimSprite | Enemy3D; hp = 4; dir = 1; alive = true; x: number; st: 'move' | 'slash' | 'dying' = 'move'; t = 0; guard = 0; hitDone = false;
  constructor(scene: THREE.Scene, public x0: number, public y: number, public range = 3) { this.x = x0; this.spr = USE3D_ENEMY ? new Enemy3D(scene) : new AnimSprite(ENEMY, 'enemy', scene); }
  update(dt: number, p: Player, bul: Bullets, lvl: Level, scene: THREE.Scene) {
    const dx = p.x - this.x, near = Math.abs(dx) < 7 && Math.abs(p.y - this.y) < 2.2; this.t += dt; this.guard -= dt;
    if (this.st === 'dying') { this.spr.play('death', false); this.spr.update(dt); if (this.spr.done && this.t > 2.2) { scene.remove(this.spr.mesh); this.alive = false; } this.spr.set(this.x, this.y, 0.2, this.dir); return 0; }
    if (bul.hit(this.x, this.y + 0.8, 0.75)) {
      if (Math.sign(dx) === this.dir && this.st !== 'slash') this.guard = 0.25;               // blocked by shield
      else if (--this.hp <= 0) { this.st = 'dying'; this.t = 0; lvl.burst(this.x, this.y + 0.8, 10); return 200; }
    }
    if (this.st === 'slash') {
      this.spr.play('slash', false); if (this.t > 0.15 && this.t < 0.4 && !this.hitDone && Math.abs(dx) < 2.6 && Math.abs(p.y - this.y) < 1.8) { p.hurt(Math.sign(dx) || 1); this.hitDone = true; }
      if (this.t > 0.55) { this.st = 'move'; this.t = 0; }
    } else {
      if (near) this.dir = Math.sign(dx) || this.dir;
      if (near && Math.abs(dx) < 2.6) { this.st = 'slash'; this.t = 0; this.hitDone = false; }
      else {
        const sp = near ? 3.2 : 1.5, nx = this.x + this.dir * sp * dt;
        const floor = lvl.solid(Math.floor(nx + this.dir * 0.5), Math.floor(this.y - 0.2)), wall = lvl.solid(Math.floor(nx + this.dir * 0.6), Math.floor(this.y + 0.5));
        if (floor && !wall) this.x = nx; else if (!near) this.dir = -this.dir;
        if (!near && Math.abs(this.x - this.x0) > this.range) this.dir = Math.sign(this.x0 - this.x);
      }
      this.spr.play(this.guard > 0 ? 'shield' : near ? 'run' : 'walk');
    }
    this.spr.update(dt); this.spr.set(this.x, this.y, 0.2, this.dir); return 0;
  }
}

// Boss: state machine (mirrors the reference's Animator graph). Each state plays one clip of the gorilla sprite.
type S = 'idle' | 'intimidate' | 'stomp' | 'club' | 'block' | 'getAxe' | 'defeat';
const DUR: Record<S, number> = { idle: 1.0, intimidate: 1.4, stomp: 1.1, club: 1.1, block: 1.6, getAxe: 1.6, defeat: 2.2 };
const CLIP: Record<S, string> = { idle: 'idle', intimidate: 'intimidate', stomp: 'stomp', club: 'swing', block: 'block', getAxe: 'shieldBreak', defeat: 'death' };
const CHAIN: Record<number, S[]> = { 1: ['intimidate', 'stomp', 'club', 'block'], 2: ['intimidate', 'stomp', 'club', 'stomp', 'club'] };
export class Boss {
  spr: AnimSprite; shieldHp = 14; hp = 30; phase = 1; st: S = 'idle'; t = 0; i = 0; active = false; dead = false; face = -1; fired = false; flash = 0;
  constructor(public scene: THREE.Scene, public x: number, public y: number) { this.spr = new AnimSprite(BOSS, 'boss', scene); this.spr.mesh.visible = false; this.spr.set(x, y, 0.2, -1); }
  enter(s: S, p: Player) {
    this.st = s; this.t = 0; this.fired = false; this.face = p.x < this.x ? -1 : 1;
    const n = BOSS.clips[CLIP[s]].length, sp = this.phase === 2 ? 1.4 : 1;
    this.spr.play(CLIP[s], s === 'idle' || s === 'block', n / (DUR[s] / sp));
  }
  next(p: Player) { this.enter(this.hp <= 0 ? 'defeat' : CHAIN[this.phase][this.i++ % CHAIN[this.phase].length], p); }
  damage(n: number, p: Player, lvl: Level) {
    if (this.st === 'block' || this.dead || !this.active || this.st === 'defeat') return;
    this.flash = 0.07;
    if (this.shieldHp > 0) { this.shieldHp -= n; lvl.burst(this.x + 1.8 * this.face, this.y + 2.2, 4); if (this.shieldHp <= 0) { this.phase = 2; this.i = 0; lvl.burst(this.x, this.y + 2.4, 24); this.enter('getAxe', p); } }
    else this.hp -= n;
  }
  update(dt: number, p: Player, bul: Bullets, lvl: Level, hz: Hazards) {
    if (!this.active || this.dead) return 0;
    this.spr.mesh.visible = true; const sp = this.phase === 2 ? 1.4 : 1; this.t += dt * sp; this.flash -= dt;
    if (this.st !== 'defeat' && bul.hit(this.x, this.y + 2.3, 2.0)) this.damage(1, p, lvl);
    const k = this.t / DUR[this.st];
    const tele = (this.st === 'stomp' || this.st === 'club') && k < 0.5 ? (Math.sin(this.t * 30) * 0.5 + 0.5) * 0.6 : 0;
    this.spr.mat.color.setRGB(this.flash > 0 ? 3 : 1 + tele * 2.5, this.flash > 0 ? 3 : 1, this.flash > 0 ? 3 : 1);
    if (this.st === 'stomp' && k > 0.5 && !this.fired) { this.fired = true; lvl.burst(this.x, this.y, 12); hz.spawn(this.x - 2, this.y + 0.4, -9, 0, 0.3, 2.5, true); hz.spawn(this.x + 2, this.y + 0.4, 9, 0, 0.3, 2.5, true); }
    if (this.st === 'club' && k > 0.45 && k < 0.75 && Math.abs(p.x - (this.x + this.face * 2.6)) < 2.4 && Math.abs(p.y - this.y) < 2.8) p.hurt(this.face);
    if (this.st !== 'defeat' && Math.abs(p.x - this.x) < 1.8 && p.y < this.y + 4 && p.y + 1.3 > this.y) p.hurt(Math.sign(p.x - this.x) || 1);
    this.spr.update(dt); this.spr.set(this.x, this.y, 0.2, this.face);
    if (this.t >= DUR[this.st]) {
      if (this.st === 'defeat') { this.dead = true; lvl.burst(this.x, this.y + 2.2, 60); return 5000; }
      this.next(p);
    }
    return 0;
  }
}

// Spinning saw blade that patrols a short rail (x and/or y range). Not shootable.
export class Saw {
  m: THREE.Mesh; t = Math.random() * 6;
  constructor(scene: THREE.Scene, public x: number, public y: number, public rx = 0, public ry = 0, public speed = 1.3, public r = 0.9) {
    const map = new THREE.TextureLoader().load('art/saw.png'); map.colorSpace = THREE.SRGBColorSpace;
    this.m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.2, r * 2.2), new THREE.MeshBasicMaterial({ map, alphaTest: 0.5, color: 0xdddddd }));
    scene.add(this.m);
  }
  update(dt: number, p: Player) {
    this.t += dt * this.speed;
    const x = this.x + Math.sin(this.t) * this.rx, y = this.y + Math.sin(this.t) * this.ry;
    this.m.position.set(x, y, 0.3); this.m.rotation.z -= dt * 9;
    if (Math.hypot(p.x - x, p.y + 0.65 - y) < this.r + 0.3) p.hurt(Math.sign(p.x - x) || 1);
  }
}

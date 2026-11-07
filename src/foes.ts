import * as THREE from 'three';
import { Level } from './level';
import { Player, Bullets } from './player';
import { AnimSprite } from './anim';
import { Enemy3D, SOLDIER, CLUB, CLUB_BIG, type Cfg } from './enemy3d';
import { fx } from './fx';
import { Dragon3D } from './dragon3d';
const USE3D_ENEMY = new URLSearchParams(location.search).get('enemy') !== '2d'; // 3D is the default; /?enemy=2d falls back to sprites/primitives
import { ENEMY } from './sprites';
const mk = (g: THREE.BufferGeometry, c: number, e = 0) => { const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, emissive: e })); m.castShadow = true; return m; };

// Enemy fire / shockwaves. A fireball (colour given) is smaller than the old one, leaves a spark trail, and on hitting ground/a platform/the player
// it bursts into sparks + a shockwave ring; ground/platform hits also shake the camera.
export class Hazards {
  list: { m: THREE.Mesh; vx: number; vy: number; r: number; life: number; col?: THREE.Color }[] = [];
  constructor(public scene: THREE.Scene) {}
  spawn(x: number, y: number, vx: number, vy: number, r: number, life = 3, flat = false, col?: THREE.Color) {
    const m = new THREE.Mesh(flat ? new THREE.BoxGeometry(0.5, 0.6, 1.6) : new THREE.IcosahedronGeometry(r, 1),
      new THREE.MeshBasicMaterial({ color: col ? col.clone() : new THREE.Color(4, 1.2, 0.2), toneMapped: false }));
    m.position.set(x, y, 0); this.scene.add(m); this.list.push({ m, vx, vy, r, life, col });
  }
  update(dt: number, p: Player, lvl: Level) {
    for (const h of this.list) {
      h.life -= dt; const px = h.m.position.x, py = h.m.position.y; h.m.position.x += h.vx * dt; h.m.position.y += h.vy * dt; h.m.rotation.z += dt * 9;
      const fire = !!h.col; if (fire && h.life > 0) fx.trail(h.m.position.x, h.m.position.y, h.col!.clone().multiplyScalar(0.35));
      if (Math.abs(h.m.position.x - p.x) < h.r + 0.35 && Math.abs(h.m.position.y - (p.y + 0.65)) < h.r + 0.65) { p.hurt(Math.sign(p.x - h.m.position.x) || 1); if (h.r > 0.3 || fire) { h.life = 0; if (fire) fx.impact(h.m.position.x, h.m.position.y, h.col!); } }
      if (h.life > 0 && lvl.solid(Math.floor(h.m.position.x), Math.floor(h.m.position.y)) && (fire || (h.r < 0.5 && h.vy !== 0))) {
        lvl.burst(h.m.position.x, h.m.position.y, 3); h.life = 0;
        if (fire) { fx.impact(px, py, h.col!); fx.shake(0.4, px); }      // previous position = just outside the block, so sparks sit on its surface
      }
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

// Level 2: flying dragon that throws fireballs (3D model by default; the old primitive dragon remains for ?enemy=2d)
export class Dragon {
  m = new THREE.Group(); hp = 5; t = Math.random() * 6; cd = 1.5; alive = true; wings: THREE.Mesh[] = []; d3?: Dragon3D; dying = 0; vy = 0; x = 0; y = 0; cy: number; tier: number;
  // tier = dragon type: 0 green (1 shot), 1 purple (2-shot spread, faster), 2 orange (3-shot spread, fastest, tougher)
  constructor(public scene: THREE.Scene, public bx: number, public by: number, variant = 0) {
    this.x = bx; this.y = by; this.cy = by; this.tier = variant; this.hp = [5, 6, 8][variant] ?? 5;
    if (USE3D_ENEMY) { this.d3 = new Dragon3D(scene, variant); return; }
    this.m.add(mk(new THREE.SphereGeometry(0.7, 10, 8), 0xd6342a, 0x3a0500)); (this.m.children[0] as THREE.Mesh).scale.set(1.5, 0.8, 0.8);
    const head = mk(new THREE.ConeGeometry(0.3, 0.7, 6), 0xff7a2a); head.rotation.z = Math.PI / 2; head.position.x = 1.1; this.m.add(head);
    for (const s of [-1, 1]) { const w = mk(new THREE.BoxGeometry(1.4, 0.06, 0.8), 0x7a1a6a); w.position.set(-0.1, 0.4, s * 0.9); this.wings.push(w); this.m.add(w); }
    scene.add(this.m);
  }
  private remove() { this.alive = false; this.scene.remove(this.d3 ? this.d3.mesh : this.m); }
  /** Keep the dragon's body out of terrain: if its box overlaps a block stack, move to whichever side (over or under) is closer. */
  private avoid(lvl: Level, x: number, y: number) {
    for (let it = 0; it < 3; it++) {
      let hit = false;
      for (let ix = Math.floor(x - 1.1); ix <= Math.floor(x + 1.1) && !hit; ix++) for (let iy = Math.floor(y - 0.8); iy <= Math.floor(y + 0.8); iy++) if (lvl.solid(ix, iy)) {
        let top = iy, bot = iy; while (lvl.solid(ix, top + 1)) top++; while (lvl.solid(ix, bot - 1)) bot--;
        const up = top + 1 + 0.9, dn = bot - 0.9; y = dn > 2.5 && y - dn < up - y ? dn : up; hit = true; break;
      }
      if (!hit) break;
    }
    return y;
  }
  update(dt: number, p: Player, bul: Bullets, lvl: Level, hz: Hazards, scene: THREE.Scene) {
    if (this.dying > 0) {                                              // shot down: tumble and fall, then vanish (0.7s)
      this.dying += dt; this.vy -= 30 * dt; this.y += this.vy * dt; this.x += Math.sign(p.x - this.x) * -2 * dt;
      this.d3?.update(dt, 0, true); this.d3?.set(this.x, this.y, 0.2, p.x > this.x ? 1 : -1);
      if (this.dying > 0.7 || this.y < -8) { lvl.burst(this.x, this.y, 8); this.remove(); } return 0;
    }
    this.t += dt; const x = this.bx + Math.sin(this.t * 0.6) * 5, want = this.avoid(lvl, x, this.by + Math.sin(this.t * 1.3) * 1.2);
    this.cy += Math.max(-10 * dt, Math.min(10 * dt, want - this.cy));                // glide over / under terrain instead of snapping
    const y = this.cy, face = p.x > x ? 1 : -1; this.x = x; this.y = y;
    if (this.d3) { this.d3.update(dt, this.cd < 0.5 ? 1 - this.cd / 0.5 : 0); this.d3.set(x, y, 0.2, face); }
    else { this.m.position.set(x, y, 0); this.m.scale.x = face; this.wings.forEach((w, i) => w.rotation.x = Math.sin(this.t * 10) * 0.6 * (i ? 1 : -1)); }
    this.cd -= dt;
    if (this.cd <= 0) { const o = this.d3 ? this.d3.muzzle() : new THREE.Vector3(x, y, 0), dx = p.x - o.x, dy = p.y + 0.7 - o.y, d = Math.hypot(dx, dy) || 1; const sp = [9, 10, 11][this.tier] ?? 9, n = this.tier + 1, a0 = Math.atan2(dy, dx);
      for (let k = 0; k < n; k++) { const a = a0 + (k - (n - 1) / 2) * 0.22; hz.spawn(o.x, o.y, Math.cos(a) * sp, Math.sin(a) * sp, 0.2, 3, false, this.d3?.fire); }
      this.cd = [2.3, 2.0, 1.8][this.tier] ?? 2.2; }
    if (bul.hit(x, y, this.d3 ? 1.0 : 1.3)) { this.d3?.hit(); if (--this.hp <= 0) { lvl.burst(x, y, 14); if (this.d3) { this.dying = 1e-3; this.vy = 4; } else this.remove(); return 300; } }
    return 0;
  }
}

// Ground enemy: patrols, chases, attacks. Has gravity: if the platform under him is shot away he falls (and re-anchors his patrol where he lands).
// `jump` = optional leaping slam (club monster): used when the player is outside slam reach; he lunges forward during the airborne part of the clip and lands with a shake + dust.
// All the jump timings are in seconds of game time (clip time / clip speed-up), measured from the start of the attack.
export type JumpOpt = { min: number; max: number; reach: number; hit: [number, number]; dur: number; lunge: [number, number]; cd: number };
export type FoeOpt = { cfg?: Cfg; hp?: number; speed?: number; reach?: number; hit?: [number, number]; dur?: number; shield?: boolean; score?: number; hitY?: number; hitR?: number; jump?: JumpOpt; cool?: number };
export class Soldier {
  spr: AnimSprite | Enemy3D; hp: number; dir = 1; alive = true; x: number; vy = 0; ground = true; turnCd = 0; st: 'move' | 'slash' | 'dying' = 'move'; t = 0; guard = 0; hitDone = false;
  atk: 'slam' | 'jump' = 'slam'; cool = 0; jumpCd = 1; lungeDist = 0; lungeDone = 0; impactDone = false;
  o: Required<Omit<FoeOpt, 'cfg' | 'jump'>> & { jump?: JumpOpt };
  constructor(scene: THREE.Scene, public x0: number, public y: number, public range = 3, o: FoeOpt = {}) {
    this.x = x0; this.o = { hp: 4, speed: 1.5, reach: 2.6, hit: [0.15, 0.4], dur: 0.55, shield: true, score: 200, hitY: 0.8, hitR: 0.75, cool: 0.5, ...o }; this.hp = this.o.hp;
    this.spr = USE3D_ENEMY ? new Enemy3D(scene, o.cfg ?? SOLDIER) : new AnimSprite(ENEMY, 'enemy', scene);
    if (!USE3D_ENEMY) this.o.jump = undefined;
  }
  private feet(lvl: Level) { const iy = Math.floor(this.y); return lvl.solid(Math.floor(this.x - 0.25), iy) || lvl.solid(Math.floor(this.x + 0.25), iy); }
  private startAttack(kind: 'slam' | 'jump', dx: number) {
    this.st = 'slash'; this.t = 0; this.hitDone = false; this.impactDone = false; this.atk = kind; this.lungeDone = 0;
    if (kind === 'jump') { this.lungeDist = Math.max(1.5, Math.min(5, Math.abs(dx) - 1.4)); this.o.jump && (this.jumpCd = this.o.jump.cd); }
  }
  update(dt: number, p: Player, bul: Bullets, lvl: Level, scene: THREE.Scene) {
    // gravity + landing (runs in every state, so a dying or slashing enemy also drops when his platform is destroyed)
    this.vy = Math.max(this.vy - 42 * dt, -28); this.y += this.vy * dt;
    if (this.vy <= 0 && this.feet(lvl)) { if (!this.ground && this.vy < -4) this.x0 = this.x; this.y = Math.floor(this.y) + 1; this.vy = 0; this.ground = true; } else this.ground = false;
    if (this.y < -8) { scene.remove(this.spr.mesh); this.alive = false; return 0; }
    const dx = p.x - this.x, near = Math.abs(dx) < 7 && Math.abs(p.y - this.y) < 2.2; this.t += dt; this.guard -= dt; this.turnCd -= dt; this.cool -= dt; this.jumpCd -= dt;
    if (this.st === 'dying') { this.spr.play('death', false); this.spr.update(dt); if (this.spr.done && this.t > (this.spr instanceof Enemy3D ? 0 : 2.2)) { scene.remove(this.spr.mesh); this.alive = false; } this.spr.set(this.x, this.y, 0.2, this.dir); return 0; }
    if (bul.hit(this.x, this.y + this.o.hitY, this.o.hitR)) {
      if (this.o.shield && Math.sign(dx) === this.dir && this.st !== 'slash') this.guard = 0.25;               // blocked by shield
      else { this.spr.play('hurt'); if (--this.hp <= 0) { this.st = 'dying'; this.t = 0; lvl.burst(this.x, this.y + this.o.hitY, 10); return this.o.score; } }
    }
    let moving = false;
    if (this.st === 'slash') {
      const jmp = this.atk === 'jump' && this.o.jump, [h0, h1] = jmp ? jmp.hit : this.o.hit, reach = jmp ? jmp.reach : this.o.reach, dur = jmp ? jmp.dur : this.o.dur;
      this.spr.play(jmp ? 'jump' : 'slash', false);
      if (jmp) {                                                                    // leap: ease forward between lunge[0] and lunge[1], never off an edge or into a wall
        const u = Math.max(0, Math.min(1, (this.t - jmp.lunge[0]) / (jmp.lunge[1] - jmp.lunge[0]))), k = u * u * (3 - 2 * u), nx = this.x + this.dir * this.lungeDist * (k - this.lungeDone);
        if (lvl.solid(Math.floor(nx + this.dir * 0.5), Math.floor(this.y - 0.2)) && !lvl.solid(Math.floor(nx + this.dir * 0.6), Math.floor(this.y + 0.5))) { this.x = nx; this.lungeDone = k; }
      }
      if (!this.impactDone && this.t > h0 && this.ground) {                         // the moment the club / fists hit the floor
        this.impactDone = true; fx.dust(this.x + this.dir * (jmp ? 0.6 : 1.5), this.y, this.dir); fx.shake(jmp ? 0.3 : 0.14, this.x);
        lvl.burst(this.x + this.dir * (jmp ? 0.6 : 1.5), this.y + 0.2, 4);
      }
      if (this.t > h0 && this.t < h1 && !this.hitDone && Math.abs(dx) < reach && Math.abs(p.y - this.y) < 1.8) { p.hurt(Math.sign(dx) || 1); this.hitDone = true; }
      if (this.t > dur) { this.st = 'move'; this.t = 0; this.cool = this.o.cool; this.spr.play('idle'); }
    } else {
      if (near && Math.abs(dx) > 0.3) this.dir = Math.sign(dx);                    // dead-zone: no facing flicker when the player is right above/below
      const ad = Math.abs(dx), j = this.o.jump;
      if (near && this.ground && this.cool <= 0 && ad < this.o.reach) this.startAttack('slam', dx);
      else if (j && near && this.ground && this.cool <= 0 && this.jumpCd <= 0 && ad > j.min && ad < j.max) this.startAttack('jump', dx);
      else if (this.ground) {
        const sp = near ? this.o.speed * 2.1 : this.o.speed, nx = this.x + this.dir * sp * dt;
        const floor = lvl.solid(Math.floor(nx + this.dir * 0.5), Math.floor(this.y - 0.2)), wall = lvl.solid(Math.floor(nx + this.dir * 0.6), Math.floor(this.y + 0.5));
        if (floor && !wall) { this.x = nx; moving = true; }
        else if (!near && this.turnCd <= 0) { this.dir = -this.dir; this.turnCd = 0.6; }                        // turn at edge/wall once, then wait (was flipping every frame)
        if (!near && this.turnCd <= 0 && Math.abs(this.x - this.x0) > this.range) this.dir = Math.sign(this.x0 - this.x) || this.dir;
      }
      if (this.st === 'move') this.spr.play(this.guard > 0 ? 'shield' : !this.ground ? 'idle' : moving ? (near ? 'run' : 'walk') : 'idle');
    }
    this.spr.update(dt); this.spr.set(this.x, this.y, 0.2, this.dir); return 0;
  }
}

// Club monster (pack Orc_Skull): slam up close, leaping slam from range. Elite = bigger, tougher, longer reach. Hit windows are game seconds from attack start.
// Slam clip impact ~1.0-1.25s of 2.27s at x1.4 -> 0.7-0.9s.  JumpSlam: crouch 0.3s, airborne ~0.6-1.5s, lands ~1.6s, hands hit floor ~1.55-1.95s, at x1.6 -> lunge 0.2-1.0s, hit 0.97-1.22s.
export const CLUB_OPT: FoeOpt = { cfg: CLUB, hp: 4, speed: 1.5, reach: 2.6, hit: [0.68, 0.92], dur: 1.65, shield: false, score: 200, hitY: 1.1, hitR: 1.0, cool: 0.6,
  jump: { min: 3.4, max: 7, reach: 2.4, hit: [0.97, 1.22], dur: 2.3, lunge: [0.2, 1.0], cd: 3.5 } };
export const CLUB_ELITE: FoeOpt = { ...CLUB_OPT, cfg: CLUB_BIG, hp: 8, speed: 1.3, reach: 3.2, score: 400, hitY: 1.4, hitR: 1.3, jump: { ...CLUB_OPT.jump!, reach: 3.0, min: 4, max: 8 } };

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

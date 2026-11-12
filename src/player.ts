import { audio } from './audio';
import * as THREE from 'three';
import { Level } from './level';
import { inp } from './input';
import { AnimSprite } from './anim';
import { Hero3D } from './hero3d';
import { HERO } from './sprites';
const USE3D = new URLSearchParams(location.search).get('hero') !== '2d'; // 3D is the default; /?hero=2d falls back to the sprite hero
const ASSIST_RANGE = 26, ASSIST_LEVEL = 0.35, ASSIST_TILT = 0.3;     // aim assist: max distance (tiles); 'level' = within ~20 deg of straight ahead; up/down keys pick targets tilted more than ~17 deg above/below
const G = -42, JUMP = 18, JUMP2 = 16, RUN = 7.5, W = 0.7, H = 1.3;
export class Bullets {
  list: { m: THREE.Mesh; vx: number; vy: number; life: number }[] = [];
  constructor(scene: THREE.Scene) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3, 0.6), toneMapped: false });
    for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.1), mat); m.visible = false; scene.add(m); this.list.push({ m, vx: 0, vy: 0, life: 0 }); }
  }
  spawn(x: number, y: number, dir: number, ang = 0) {            // ang = aim angle in radians, + = up (relative to facing)
    const b = this.list.find(b => b.life <= 0); if (!b) return;
    b.life = 1.1; b.vx = dir * 24 * Math.cos(ang); b.vy = 24 * Math.sin(ang); b.m.visible = true; b.m.position.set(x, y, 0); b.m.rotation.z = Math.atan2(b.vy, b.vx);
  }
  update(dt: number, lvl: Level) {
    for (const b of this.list) {
      if (b.life <= 0) continue; b.life -= dt; b.m.position.x += b.vx * dt; b.m.position.y += b.vy * dt;
      if (lvl.destroy(Math.floor(b.m.position.x), Math.floor(b.m.position.y)) || lvl.solid(Math.floor(b.m.position.x), Math.floor(b.m.position.y))) b.life = 0;
      if (b.life <= 0) b.m.visible = false;
    }
  }
  hit(x: number, y: number, r: number) {
    for (const b of this.list) if (b.life > 0 && Math.hypot(b.m.position.x - x, b.m.position.y - y) < r) { b.life = 0; b.m.visible = false; return true; }
    return false;
  }
}
export class Player {
  spr: AnimSprite | Hero3D; x = 2; y = 4; vx = 0; vy = 0; ground = false; coyote = 0; buf = 0; air = 1; face = 1; aim = 0; assist = false; targets: { x: number; y: number }[] = []; hp = 5; inv = 0; cd = 0;
  constructor(scene: THREE.Scene) { this.spr = USE3D ? new Hero3D(scene) : new AnimSprite(HERO, 'hero', scene); }
  animOnly(dt: number, lvl: Level) {            // game over: keep falling to the floor, always visible, no flicker
    this.vx = 0; this.vy = Math.max(this.vy + G * dt, -28); this.y += this.vy * dt; this.collide(lvl, false);
    this.spr.mesh.visible = true; this.spr.play('death', false); this.spr.update(dt); this.spr.set(this.x, this.y, 0.2, this.face);
  }
  hurt(dir: number) { if (this.inv > 0) return; this.hp--; this.inv = 1.2; this.vy = 9; this.vx = dir * 8; }
  update(dt: number, lvl: Level, bul: Bullets) {
    this.inv = Math.max(0, this.inv - dt); this.cd -= dt;
    const target = inp.x * RUN; this.vx += (target - this.vx) * Math.min(1, (this.ground ? 16 : 9) * dt);
    if (inp.x) this.face = inp.x;
    this.coyote = this.ground ? 0.1 : this.coyote - dt; this.buf = inp.jumpDown ? 0.12 : this.buf - dt;
    if (this.ground) this.air = 1;                                                       // one extra jump, refilled on landing
    if (this.buf > 0 && this.coyote > 0) { this.vy = JUMP; this.buf = 0; this.coyote = 0; }
    else if (this.buf > 0 && this.air > 0 && !this.ground) { this.vy = JUMP2; this.buf = 0; this.air = 0; }   // double jump
    if (!inp.jump && this.vy > 0) this.vy -= this.vy * Math.min(1, 12 * dt); // variable jump height
    this.vy = Math.max(this.vy + G * dt, -28);
    this.x += this.vx * dt; this.collide(lvl, true);
    this.y += this.vy * dt; this.ground = false; this.collide(lvl, false);
    // aim: up = 45 deg when moving / 90 straight up; down = 45 deg on the ground or while moving, 90 straight down when airborne and standing still
    const ay = (inp.up ? 1 : 0) - (inp.down ? 1 : 0), moving = inp.x !== 0;
    this.aim = ay === 0 ? 0 : ay > 0 ? (moving ? Math.PI / 4 : Math.PI / 2) : (moving || this.ground ? -Math.PI / 4 : -Math.PI / 2);
    if (this.assist && (inp.fire || ay !== 0)) { const a = this.assistAim(ay); if (a !== null) this.aim = a; }   // aim assist: the direction you hold picks the target, the assist fine-tunes the angle
    if (this.spr instanceof Hero3D) this.spr.aim = this.aim;
    if (inp.fire && this.cd <= 0 && (!(this.spr instanceof Hero3D) || this.spr.aimed)) { const mz = this.spr instanceof Hero3D ? this.spr.muzzle() : null; bul.spawn(mz ? mz.x : this.x + this.face * 1.0, mz ? mz.y : this.y + 0.95, this.face, this.aim); this.cd = 0.16; audio.shoot(); }
    const run = Math.abs(this.vx) > 0.8;
    const clip = this.inv > 0.95 ? 'hurt' : !this.ground ? (inp.fire ? 'shootAir' : 'jump') : inp.fire ? (run ? 'shootRun' : 'shootStand') : run ? 'run' : 'idle';
    this.spr.play(clip); this.spr.update(dt); this.spr.set(this.x, this.y, 0.2, this.face);
    this.spr.mesh.visible = this.inv <= 0 || this.inv > 0.95 || Math.floor(this.inv * 14) % 2 === 0;
  }
  /** Aim assist. The direction the player holds picks WHICH target: up = targets above, down = targets below, nothing = targets roughly level.
   *  Returns the exact angle (relative to facing, + = up) to the nearest target in that direction, or null to keep the manual aim. */
  assistAim(ay: number): number | null {
    const ox = this.x + this.face * 0.6, oy = this.y + 0.95; let best: number | null = null, bd = 1e9;
    for (const t of this.targets) {
      const dx = (t.x - ox) * this.face, dy = t.y - oy, d = Math.hypot(dx, dy); if (d > ASSIST_RANGE || d >= bd || dx < (ay === 0 ? 0.5 : -1.5)) continue;
      const a = Math.atan2(dy, Math.max(dx, 0));                        // a target right above/below you counts as straight up/down
      if (ay > 0 ? a > ASSIST_TILT : ay < 0 ? a < -ASSIST_TILT : Math.abs(a) <= ASSIST_LEVEL) { bd = d; best = a; }
    }
    return best;
  }
  collide(lvl: Level, horiz: boolean) {
    for (let ix = Math.floor(this.x - W / 2); ix <= Math.floor(this.x + W / 2); ix++)
      for (let iy = Math.floor(this.y); iy <= Math.floor(this.y + H); iy++) {
        if (!lvl.solid(ix, iy)) continue;
        if (horiz) { this.x = this.x < ix + 0.5 ? ix - W / 2 : ix + 1 + W / 2; this.vx = 0; }
        else if (this.vy <= 0) { this.y = iy + 1; this.vy = 0; this.ground = true; }
        else { this.y = iy - H; this.vy = 0; }
      }
  }
}

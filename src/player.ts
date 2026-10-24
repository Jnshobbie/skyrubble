import * as THREE from 'three';
import { Level } from './level';
import { inp } from './input';
const G = -42, JUMP = 15, RUN = 7.5, W = 0.7, H = 1.3;
export class Bullets {
  list: { m: THREE.Mesh; vx: number; life: number }[] = [];
  constructor(scene: THREE.Scene) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3, 0.6), toneMapped: false });
    for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.1), mat); m.visible = false; scene.add(m); this.list.push({ m, vx: 0, life: 0 }); }
  }
  spawn(x: number, y: number, dir: number) {
    const b = this.list.find(b => b.life <= 0); if (!b) return;
    b.life = 1.1; b.vx = dir * 24; b.m.visible = true; b.m.position.set(x, y, 0);
  }
  update(dt: number, lvl: Level) {
    for (const b of this.list) {
      if (b.life <= 0) continue; b.life -= dt; b.m.position.x += b.vx * dt;
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
  mesh = new THREE.Group(); x = 2; y = 4; vx = 0; vy = 0; ground = false; coyote = 0; buf = 0; face = 1; hp = 5; inv = 0; cd = 0;
  constructor(scene: THREE.Scene) {
    // Placeholder body: swap for a GLB (Mixamo Idle/Run/Jump) like Jake in HollowSky.
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.6, 4, 8), new THREE.MeshStandardMaterial({ color: 0x3a7bff, roughness: 0.5 }));
    body.castShadow = true; body.position.y = H / 2; this.mesh.add(body);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.14), new THREE.MeshStandardMaterial({ color: 0x222 })); gun.position.set(0.4, 0.8, 0); this.mesh.add(gun);
    scene.add(this.mesh);
  }
  hurt(dir: number) { if (this.inv > 0) return; this.hp--; this.inv = 1.2; this.vy = 9; this.vx = dir * 8; }
  update(dt: number, lvl: Level, bul: Bullets) {
    this.inv = Math.max(0, this.inv - dt); this.cd -= dt;
    const target = inp.x * RUN; this.vx += (target - this.vx) * Math.min(1, (this.ground ? 16 : 9) * dt);
    if (inp.x) this.face = inp.x;
    this.coyote = this.ground ? 0.1 : this.coyote - dt; this.buf = inp.jumpDown ? 0.12 : this.buf - dt;
    if (this.buf > 0 && this.coyote > 0) { this.vy = JUMP; this.buf = 0; this.coyote = 0; }
    if (!inp.jump && this.vy > 0) this.vy -= this.vy * Math.min(1, 12 * dt); // variable jump height
    this.vy = Math.max(this.vy + G * dt, -28);
    this.x += this.vx * dt; this.collide(lvl, true);
    this.y += this.vy * dt; this.ground = false; this.collide(lvl, false);
    if (inp.fire && this.cd <= 0) { bul.spawn(this.x + this.face * 0.6, this.y + 0.8, this.face); this.cd = 0.16; }
    this.mesh.position.set(this.x, this.y, 0); this.mesh.scale.x = this.face;
    this.mesh.visible = this.inv <= 0 || Math.floor(this.inv * 14) % 2 === 0;
    const sq = this.ground ? 1 : 1 + Math.min(0.18, Math.abs(this.vy) * 0.012); this.mesh.scale.y = sq; // squash & stretch
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

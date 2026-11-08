import * as THREE from 'three';
import { load, type Part } from './glb';
import type { Player } from './player';
// Level-2 obstacle (it replaces the saws): the purple monster plant. It glows, sways and hurts on touch.
let cache: Promise<Part[]> | null = null;
const model = () => (cache ??= load('models/monster_plant.glb', { h: 1.9 }, 2.6));
export class PlantTrap {
  g = new THREE.Group(); t = Math.random() * 6;
  constructor(scene: THREE.Scene, public x: number, public y: number) {          // y = the platform surface it grows from
    this.g.position.set(x, y - 0.05, 0.1); scene.add(this.g);
    model().then(parts => { for (const p of parts) this.g.add(new THREE.Mesh(p.geo, p.mat)); });
  }
  update(dt: number, p: Player) {
    this.t += dt; this.g.rotation.z = Math.sin(this.t * 1.6) * 0.06; this.g.scale.set(1, 1 + Math.sin(this.t * 2.4) * 0.04, 1);
    const dx = (p.x - this.x) / 0.8, dy = (p.y + 0.65 - (this.y + 0.9)) / 1.0;      // hit zone = an ellipse around the plant
    if (dx * dx + dy * dy < 1) p.hurt(Math.sign(p.x - this.x) || 1);
  }
}

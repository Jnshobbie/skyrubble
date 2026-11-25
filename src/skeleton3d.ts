import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { audio } from './audio';
import { fx } from './fx';
import type { Player, Bullets } from './player';
import type { Level } from './level';
import type { Hazards } from './foes';

/** What main.ts needs from any final boss (Boss3D = zeromus in level 1, SkeletonBoss = levels 2 and 3). */
export interface BossLike {
    active: boolean; dead: boolean; st: string; hp: number; shieldHp: number;
    next(p: Player): void; aimPoint(): { x: number; y: number };
    update(dt: number, p: Player, bul: Bullets, lvl: Level, hz: Hazards): number;
}

// Final boss of levels 2 and 3: Skeleton Elite (Mixamo rig, 1.8 units tall at scale 1, faces +z) with its big axe in the right hand.
// Moves: walks toward you, then chains three attacks: SLASH (overhead chop + a shockwave along the floor), SWEEP (wide low swing: jump over it),
// JUMP (leaps onto you; shockwaves both ways). Red glowing eyes (the texture's own eye colour; see EYE). Armour (14 hits) breaks -> phase 2: faster, double shockwaves, armour falls off. Then 30 hits to kill it.
// Clip timings below were measured from the animations (the axe hits the floor at 0.9s of Downward, the sweep peaks at 0.9-1.0s of Horizontal).
const F = {
    model: 'models/skeleton_elite_for_mixamo.fbx', axe: 'models/skeleton_axe.glb',
    idle: 'models/skeleton_Idle.fbx', walk: 'models/skeleton_walk.fbx',
    slash: 'models/Standing Melee Attack Downward (1).fbx', sweep: 'models/Standing Melee Attack Horizontal.fbx',
    jump: 'models/skeleton_jump.fbx',      // OPTIONAL: a Mixamo "Mutant Jump Attack" for this rig; without the file the jump slam reuses the Downward clip
};
type Key = 'idle' | 'walk' | 'slash' | 'sweep' | 'jump';
const SMALL: Record<Key, boolean> = { idle: true, walk: true, slash: false, sweep: false, jump: false };   // idle + walk were exported for a smaller character: hips height is scaled to this rig
const HIP_K = 1.01 / 0.58;
const SCALE = 2.5;            // tiles per model unit: the boss is 4.5 tiles tall, the axe 6.8 long
const SHIELD = 14, HP = 30;
const FLOOR_PAD = 0;          // feet height above the arena floor
const BASE_GLOW = 0.28;       // emissive lift so the dark night level doesn't swallow it
const EYE = { pos: [0.042, 1.593, 0.222] as const, core: new THREE.Color(4, 0.35, 0.25), halo: new THREE.Color(2.6, 0.12, 0.08), r: 0.03 };   // eye sockets in rig coordinates (x is mirrored); the texture's eyes are red, so the glow is red. HDR so the bloom picks it up
const WAVE = new THREE.Color(1.3, 2.4, 3.2);     // HDR so the floor shockwave blooms
const WALK_V = 2.6;           // tiles/s at the walk clip's x0.5 speed (no foot sliding)
const HIT = { slash: [0.82, 1.1], sweep: [0.85, 1.15] } as const;     // clip seconds when the axe can hurt
const LEAP: [number, number] = [0.1, 0.9], LEAP_H = 3.4;             // jump: leaves the floor at 0.1s, lands at 0.9s (axe down), peak height in tiles

type S = 'idle' | 'walk' | 'slash' | 'sweep' | 'jump' | 'enrage' | 'defeat';
const ST: Record<S, { clip: Key; loop: boolean; ts: number; dur: number }> = {
    idle: { clip: 'idle', loop: true, ts: 1, dur: 0.55 },         // breather after an attack: this is when you can hit it freely
    walk: { clip: 'walk', loop: true, ts: 0.5, dur: 99 },
    slash: { clip: 'slash', loop: false, ts: 1, dur: 1.8 },
    sweep: { clip: 'sweep', loop: false, ts: 1, dur: 1.9 },
    jump: { clip: 'jump', loop: false, ts: 1, dur: 1.7 },
    enrage: { clip: 'idle', loop: true, ts: 1, dur: 1.6 },
    defeat: { clip: 'idle', loop: false, ts: 0, dur: 3.2 },
};
const CHAIN: Record<number, ('slash' | 'sweep' | 'jump')[]> = {
    1: ['slash', 'sweep', 'jump', 'sweep'],
    2: ['sweep', 'jump', 'slash', 'sweep', 'jump'],
};

type Loaded = { obj: THREE.Group; axe: THREE.Group; clips: Partial<Record<Key, THREE.AnimationClip>> };
const shared: { p?: Promise<Loaded> } = {};
const enc = (u: string) => encodeURI(u);
// clip fixes: scale the hips for the smaller exporter character, and keep the walk in place (the game moves the boss, not the clip)
const fix = (k: Key, c: THREE.AnimationClip) => new THREE.AnimationClip(k, c.duration, c.tracks.map(t => {
    if (!/Hips\.position$/.test(t.name)) return t;
    const v = Float32Array.from(t.values);
    for (let i = 0; i < v.length; i += 3) {
        if (SMALL[k]) { v[i] *= HIP_K; v[i + 1] *= HIP_K; v[i + 2] *= HIP_K; }
        if (k === 'walk') { v[i] = v[0]; v[i + 2] = v[2]; }
    }
    return new THREE.VectorKeyframeTrack(t.name, Array.from(t.times), Array.from(v));
}));
const load = () => shared.p ??= (async () => {
    const fbx = new FBXLoader(), keys: Key[] = ['idle', 'walk', 'slash', 'sweep', 'jump'];
    const [obj, gltf, ...cl] = await Promise.all([fbx.loadAsync(enc(F.model)), new GLTFLoader().loadAsync(enc(F.axe)),
        ...keys.map(k => fbx.loadAsync(enc(F[k])).then(o => o.animations[0] ? fix(k, o.animations[0]) : null).catch(() => null))]);   // a missing optional file just returns null
    const clips: Partial<Record<Key, THREE.AnimationClip>> = {}; keys.forEach((k, i) => { const c = cl[i]; if (c) clips[k] = c; });
    if (!clips.jump && clips.slash) clips.jump = clips.slash;
    obj.updateMatrixWorld(true);
    const hand = obj.getObjectByName('mixamorigRightHand');
    const axe = gltf.scene; if (hand) { axe.matrixAutoUpdate = false; axe.matrix.copy(hand.matrixWorld).invert(); hand.add(axe); }   // the axe was cut out in rig coordinates: inverse of the hand = its place inside the hand
    return { obj, axe, clips };
})();

export class SkeletonBoss implements BossLike {
    mesh = new THREE.Group(); private yawG = new THREE.Group();
    shieldHp = SHIELD; hp = HP; phase = 1; st: S = 'walk'; t = 0; i = 0; active = false; dead = false; face = -1; flash = 0;
    private mixer?: THREE.AnimationMixer; private acts = new Map<Key, THREE.AnimationAction>(); private cur?: THREE.AnimationAction;
    private mats: THREE.MeshPhongMaterial[] = []; private armor?: THREE.Object3D; private eyeCore: THREE.MeshBasicMaterial[] = []; private eyeHalo: THREE.MeshBasicMaterial[] = [];
    private yaw = -Math.PI / 2; private roll = 0; private oy = 0; private time = 0; private fired = false; private hit = false; private jx0 = 0; private jx1 = 0; private roared = false;
    private minX: number; private maxX: number; private hz?: Hazards;
    constructor(public scene: THREE.Scene, public x: number, public y: number, arenaX = x - 40) {
        this.minX = arenaX + 6; this.maxX = arenaX + 46;
        this.mesh.visible = false; this.mesh.add(this.yawG); scene.add(this.mesh);
        load().then(({ obj, axe, clips }) => {
            const m = new THREE.Group(); m.scale.setScalar(SCALE); m.add(obj); this.yawG.add(m);
            const lift = (mt: THREE.Material) => {
                const p = mt as THREE.MeshPhongMaterial; p.transparent = false; p.depthWrite = true; p.specular?.setRGB(0.05, 0.05, 0.05); p.shininess = 8;
                if (p.map) { p.emissiveMap = p.map; p.emissive.setRGB(BASE_GLOW, BASE_GLOW, BASE_GLOW); this.mats.push(p); }
            };
            obj.traverse(o => {
                const me = o as THREE.Mesh; if (!me.isMesh) return; me.frustumCulled = false; if (me.name === 'armor') this.armor = me;
                (Array.isArray(me.material) ? me.material : [me.material]).forEach(lift);
            });
            axe.traverse(o => { const me = o as THREE.Mesh; if (!me.isMesh) return; me.frustumCulled = false; const mt = (me.material as THREE.MeshStandardMaterial).clone(); mt.metalness *= 0.3; if (mt.map) { mt.emissiveMap = mt.map; mt.emissive.setRGB(BASE_GLOW, BASE_GLOW, BASE_GLOW); } me.material = mt; });
            const head = obj.getObjectByName('mixamorigHead');       // glowing eyes ride on the head bone: a bright core + a soft additive halo
            if (head) {
                const inv = head.matrixWorld.clone().invert();
                for (const sx of [-1, 1]) {
                    const core = new THREE.MeshBasicMaterial({ color: EYE.core.clone(), toneMapped: false }), halo = new THREE.MeshBasicMaterial({ color: EYE.halo.clone(), toneMapped: false, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
                    const eye = new THREE.Group(); eye.matrixAutoUpdate = false; eye.matrix.copy(inv).multiply(new THREE.Matrix4().makeTranslation(sx * EYE.pos[0], EYE.pos[1], EYE.pos[2]));
                    const a = new THREE.Mesh(new THREE.SphereGeometry(EYE.r, 10, 8), core), b = new THREE.Mesh(new THREE.SphereGeometry(EYE.r * 3, 10, 8), halo);
                    a.frustumCulled = b.frustumCulled = false; eye.add(a, b); head.add(eye); this.eyeCore.push(core); this.eyeHalo.push(halo);
                }
            }
            this.mixer = new THREE.AnimationMixer(obj);
            (Object.keys(clips) as Key[]).forEach(k => this.acts.set(k, this.mixer!.clipAction(clips[k]!)));
            this.play(this.st);
        }).catch(e => console.warn('skeleton3d: could not load', e));
    }
    private get sp() { return this.phase === 2 ? 1.25 : 1; }
    private feet() { return this.y + FLOOR_PAD + this.oy; }
    aimPoint() { return { x: this.x, y: this.y + 2.4 }; }
    private play(s: S) {
        const c = ST[s], a = this.acts.get(c.clip); if (!a) return;
        a.setLoop(c.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = true; a.timeScale = c.ts * this.sp;
        if (a !== this.cur) { a.reset().fadeIn(0.2).play(); this.cur?.fadeOut(0.2); this.cur = a; } else a.reset().play();
        if (s === 'defeat') a.timeScale = 0;
    }
    private enter(s: S, p: Player) {
        this.st = s; this.t = 0; this.fired = false; this.hit = false; this.play(s);
        if (s === 'jump') { this.jx0 = this.x; this.jx1 = THREE.MathUtils.clamp(p.x - this.face * 2.2, this.minX, this.maxX); }
        if (s === 'enrage') { audio.sfx('boom', 0.8); fx.shake(0.8); this.shieldHp = 0; this.phase = 2; this.i = 0; if (this.armor) this.armor.visible = false; }
        if (s === 'defeat') audio.sfx('boom');
        if (s === 'walk' && !this.roared) { this.roared = true; fx.shake(0.5); }       // first step of the fight (no roar sound: that is zeromus's, this boss gets its own sound later)
    }
    /** state machine step: called when a state ends (and once when the fight starts) */
    next(p: Player) {
        if (this.hp <= 0 && this.st !== 'defeat') return this.enter('defeat', p);
        if (this.st === 'slash' || this.st === 'sweep' || this.st === 'jump') return this.enter('idle', p);   // after an attack: a short breather...
        this.enter('walk', p);                                                                                // ...then walk toward the player again
    }
    damage(n: number, p: Player, lvl: Level) {
        if (this.dead || !this.active || this.st === 'defeat' || this.st === 'enrage') return;
        this.flash = 0.07;
        if (this.shieldHp > 0) { this.shieldHp -= n; lvl.burst(this.x + 1.5 * this.face, this.y + 2.4, 4); if (this.shieldHp <= 0) { this.shieldHp = 0; lvl.burst(this.x, this.y + 2.4, 24); fx.burst(this.x, this.y + 2.6, new THREE.Color(2, 2.4, 3), 40, 8, 4, 12, 0.8); this.enter('enrage', p); } }
        else this.hp -= n;
    }
    private shock(x: number, dir: number, v: number) { this.hz?.spawn(x, this.y + 0.65, dir * v, 0, 0.55, 1.7, false, WAVE); }
    private land(x: number, lvl: Level, shake = 0.9) { fx.shake(shake, x); audio.sfx('slam', 1, x); lvl.burst(x, this.y + 0.3, 16); fx.dust(x - 1.5, this.y, -1); fx.dust(x + 1.5, this.y, 1); }
    update(dt: number, p: Player, bul: Bullets, lvl: Level, hz: Hazards) {
        if (!this.active || this.dead) return 0;
        this.hz = hz; this.mesh.visible = true; const sp = this.sp, cfg = ST[this.st]; this.time += dt; this.t += dt * sp; this.flash -= dt;
        const clipT = this.t * cfg.ts, k = this.t / cfg.dur, dir = this.face;
        const idleish = this.st === 'idle' || this.st === 'walk' || this.st === 'enrage';
        if (idleish) this.face = p.x < this.x ? -1 : 1;
        if (this.st !== 'defeat' && this.st !== 'enrage' && (bul.hit(this.x, this.y + 1.4, 1.7) || bul.hit(this.x, this.y + 3.3, 1.5))) this.damage(1, p, lvl);

        // ---- movement
        let oyT = 0;
        if (this.st === 'walk') {
            this.x = THREE.MathUtils.clamp(this.x + this.face * WALK_V * sp * dt, this.minX, this.maxX);
            const d = (p.x - this.x) * this.face, want = CHAIN[this.phase][this.i % CHAIN[this.phase].length];
            if (this.t > 0.6) {                                                                  // choose the next attack once it is close enough (jump = from further away)
                const far = want === 'jump', ok = far ? d > 3 && d < 22 : d > -1 && d < 4.4;
                if (ok || this.t > 5) { this.i++; this.enter(want, p); }
            }
        } else if (this.st === 'jump') {
            const u = THREE.MathUtils.clamp((clipT - LEAP[0]) / (LEAP[1] - LEAP[0]), 0, 1), e = u * u * (3 - 2 * u);
            this.x = this.jx0 + (this.jx1 - this.jx0) * e; this.oy = 4 * LEAP_H * u * (1 - u); oyT = this.oy;
        }
        if (this.st !== 'jump') this.oy += (oyT - this.oy) * Math.min(1, 12 * dt);

        // ---- attacks
        const d = (p.x - this.x) * dir, pf = p.y - this.y;      // d = how far in front of the boss the player is, pf = player height above the floor
        if (this.st === 'slash') {
            if (!this.hit && clipT > HIT.slash[0] && clipT < HIT.slash[1] && d > 0.6 && d < 4.8 && pf < 2.4) { this.hit = true; p.hurt(dir); }
            if (!this.fired && clipT >= 0.9) { const gx = this.x + dir * 3.2; this.fired = true; this.land(gx, lvl, 0.8); this.shock(gx, dir, 9); if (this.phase === 2) { this.shock(gx, dir, 6); this.shock(gx, -dir, 7); } }
        }
        if (this.st === 'sweep') {
            if (!this.hit && clipT > HIT.sweep[0] && clipT < HIT.sweep[1] && d > 0.2 && d < 5 && pf < 1.1) { this.hit = true; p.hurt(dir); }       // low swing: jump over it
            if (!this.fired && clipT >= 0.95) { this.fired = true; fx.shake(0.45, this.x); audio.sfx('slam', 0.7, this.x); fx.burst(this.x + dir * 3.4, this.y + 1.8, WAVE, 24, 7, 2, 10, 0.5); }
        }
        if (this.st === 'jump' && !this.fired && clipT >= LEAP[1]) {
            this.fired = true; this.oy = 0; this.land(this.x, lvl, 1.1); this.shock(this.x + dir, dir, 8.5); this.shock(this.x - dir, -dir, 8.5); if (this.phase === 2) { this.shock(this.x + dir, dir, 12); this.shock(this.x - dir, -dir, 12); }
            if (Math.abs(p.x - this.x) < 3.4 && pf < 1.5) p.hurt(Math.sign(p.x - this.x) || dir);
        }
        if (this.st !== 'defeat' && Math.abs(p.x - this.x) < 1.15 && pf < 3.4) p.hurt(Math.sign(p.x - this.x) || 1);   // standing in it hurts too

        // ---- death: stops, tips over backwards, falls apart
        if (this.st === 'defeat') {
            this.roll = this.face * Math.min(1.4, k * 1.7);
            if (Math.random() < dt * 16) fx.burst(this.x + (Math.random() - 0.5) * 3, this.y + 1 + Math.random() * 3, new THREE.Color(2.2, 2.6, 3), 14, 6, 3, 10, 0.6);
            if (Math.random() < dt * 4) fx.shake(0.35);
        } else this.roll = 0;

        // ---- visuals
        this.yaw += ((this.face > 0 ? Math.PI / 2 : -Math.PI / 2) - this.yaw) * Math.min(1, 10 * dt); this.yawG.rotation.y = this.yaw; this.mesh.rotation.z = this.roll;
        this.mesh.position.set(this.x, this.feet(), 0.2);
        const wind = (this.st === 'slash' && clipT < 0.85) || (this.st === 'sweep' && clipT < 0.8) || (this.st === 'jump' && clipT < LEAP[1]);   // telegraph: pulses red before the hit
        const tele = wind ? (Math.sin(this.t * 28) * 0.5 + 0.5) * 0.55 : 0, glow = this.flash > 0 ? 1.4 : BASE_GLOW + tele;
        for (const m of this.mats) m.emissive.setRGB(glow, this.flash > 0 ? glow : glow * (1 - tele), this.flash > 0 ? glow : glow * (1 - tele * 1.2));
        const pulse = (1 + 0.22 * Math.sin(this.time * 5)) * (this.phase === 2 ? 1.5 : 1) * (this.st === 'defeat' ? Math.max(0, 1 - k * 1.5) : 1) * (this.flash > 0 ? 1.6 : 1);   // eyes flicker, burn brighter in phase 2, go out when it dies
        for (const m of this.eyeCore) m.color.copy(EYE.core).multiplyScalar(pulse);
        for (const m of this.eyeHalo) { m.color.copy(EYE.halo).multiplyScalar(pulse); m.opacity = Math.min(0.7, 0.4 * pulse); }
        this.mixer?.update(dt);

        if (this.t >= cfg.dur) {
            if (this.st === 'defeat') { this.dead = true; this.mesh.visible = false; lvl.burst(this.x, this.y + 2, 60); fx.burst(this.x, this.y + 2, new THREE.Color(2.4, 2.8, 3.4), 80, 12, 4, 8, 1.2); fx.shake(1); return 5000; }
            if (this.st === 'walk') return 0;          // walking has no end: it hands over to an attack above
            this.next(p);
        }
        return 0;
    }
}

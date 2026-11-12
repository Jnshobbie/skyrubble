import { audio } from './audio';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Player, Bullets } from './player';
import type { Level } from './level';
import type { Hazards } from './foes';
import { fx } from './fx';
import { SoundWaves } from './soundwave';

// Final boss: Zeromus (zeromus.glb cut down to models/zeromus_boss.glb with tools/split_zeromus.mjs: 44 MB -> 10 MB, 4 clips).
// The model faces +z (so yaw +90deg = facing right). Clips: Idle (3.8s seamless hover loop), Roar (4s, wings up), Blast (3.8s, spiral rings visible 0.5-3.0s),
// Beam (11.7s, rings visible 0.1-10.8s). Everything else (swoop, death) is driven from code.
// Same public interface as the old gorilla Boss, so main.ts only changes its import + constructor.
type S = 'idle' | 'roar' | 'blast' | 'beam' | 'swoop' | 'enrage' | 'defeat';
type Clip = 'Idle' | 'Roar' | 'Blast' | 'Beam';

const URL = 'models/zeromus_boss.glb';
const SPAN = 8.5;          // wingspan in tiles (the model is 0.87 wide)
const HOVER = 0.9;         // feet height above the arena floor while hovering
const CORE_FRAC = 0.36;    // body centre as a fraction of the model height: hit circle + projectile origin
const HIT_R = 2.6;         // bullet hit circle around the core
const BODY_R = 2.0;        // touch damage radius around the core
const SHIELD = 14, HP = 30;
const RING = new THREE.Color(0.9, 3.2, 0.9);   // HDR so it blooms
const BASE_GLOW = 0.3;     // emissive lift: the sun + hemisphere light alone leave the red body dark

// clip = which clip plays; ts = clip speed; dur = how long the state lasts in game seconds (before the x1.25 phase-2 speed-up)
const ST: Record<S, { clip: Clip; loop: boolean; ts: number; dur: number }> = {
    idle: { clip: 'Idle', loop: true, ts: 1, dur: 1.0 },
    roar: { clip: 'Roar', loop: false, ts: 2.2, dur: 1.8 },
    blast: { clip: 'Blast', loop: false, ts: 1.6, dur: 2.4 },     // rings form at 0.5s of the clip; we launch at LAUNCH
    beam: { clip: 'Beam', loop: false, ts: 2.0, dur: 5.8 },       // ring stream while the clip time is inside BEAM_ON
    swoop: { clip: 'Roar', loop: false, ts: 1.4, dur: 2.8 },
    enrage: { clip: 'Roar', loop: false, ts: 1.6, dur: 2.0 },
    defeat: { clip: 'Roar', loop: false, ts: 0, dur: 2.8 },
};
const LAUNCH = 1.1;                      // blast: clip time (s) when the rings are fully out and the shot leaves
const BEAM_ON: [number, number] = [1.0, 10.5];
const PULSE_AT = [0.3, 0.52, 0.74];     // when (fraction of the roar) each ring leaves
const CHAIN: Record<number, S[]> = {
    1: ['roar', 'blast', 'swoop', 'blast', 'roar', 'swoop'],
    2: ['blast', 'swoop', 'beam', 'roar', 'swoop'],
};

const shared: { p?: Promise<{ g: GLTF; bb: THREE.Box3 }> } = {};
const load = () => shared.p ??= new GLTFLoader().loadAsync(URL).then(g => { g.scene.updateMatrixWorld(true); return { g, bb: new THREE.Box3().setFromObject(g.scene) }; });

export class Boss3D {
    mesh = new THREE.Group(); private yawG = new THREE.Group();            // mesh: position + roll (falling over), yawG: facing
    shieldHp = SHIELD; hp = HP; phase = 1; st: S = 'idle'; t = 0; i = 0; active = false; dead = false; face = -1; fired = false; flash = 0;
    private mixer?: THREE.AnimationMixer; private acts = new Map<string, THREE.AnimationAction>(); private cur?: THREE.AnimationAction;
    private mats: { m: THREE.MeshStandardMaterial }[] = [];
    private coreH = 3; private yaw = -Math.PI / 2; private roll = 0; private oy = 0; private time = 0; private shotT = 0;
    private minX: number; private maxX: number; private waves: SoundWaves; private pulses = 0;
    constructor(public scene: THREE.Scene, public x: number, public y: number, arenaX = x - 40) {
        this.minX = arenaX + 14; this.maxX = arenaX + 46; this.waves = new SoundWaves(scene);
        this.mesh.visible = false; this.mesh.add(this.yawG); scene.add(this.mesh);
        load().then(({ g, bb }) => {
            const s = SPAN / (bb.max.x - bb.min.x), m = clone(g.scene); m.scale.setScalar(s); m.position.set(-(bb.max.x + bb.min.x) / 2 * s, -bb.min.y * s, 0);   // feet at y 0, centred on x
            this.coreH = (bb.max.y - bb.min.y) * s * CORE_FRAC; this.yawG.add(m);
            m.traverse(o => {
                const me = o as THREE.Mesh; if (!me.isMesh) return; me.frustumCulled = false;
                const mt = (me.material as THREE.MeshStandardMaterial).clone(); mt.metalness *= 0.25; if (mt instanceof THREE.MeshPhysicalMaterial) mt.clearcoat = 0;
                if (!mt.emissiveMap && mt.map) { mt.emissiveMap = mt.map; mt.emissive.setRGB(BASE_GLOW, BASE_GLOW, BASE_GLOW); this.mats.push({ m: mt }); }   // lift the texture with itself (not a flat wash)
                me.material = mt;
            });
            this.mixer = new THREE.AnimationMixer(m);
            for (const c of g.animations) this.acts.set(c.name, this.mixer.clipAction(c));
            this.play(this.st);
        }).catch(e => console.warn('boss3d: could not load', URL, e));
    }
    private get sp() { return this.phase === 2 ? 1.25 : 1; }
    private coreY() { return this.y + HOVER + this.oy + this.coreH; }
    aimPoint() { return { x: this.x, y: this.coreY() }; }       // where aim assist points
    private play(s: S) {
        const c = ST[s], a = this.acts.get(c.clip); if (!a) return;
        a.setLoop(c.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = true; a.timeScale = c.ts * this.sp;
        if (a !== this.cur) { a.reset().fadeIn(0.2).play(); this.cur?.fadeOut(0.2); this.cur = a; } else a.reset().play();
        if (s === 'defeat') { a.time = 1.5; a.timeScale = 0; }                  // freeze in the wings-up pose while it falls apart from code
    }
    enter(s: S, p: Player) { if (s === 'roar' || s === 'enrage' || s === 'swoop') audio.sfx('roar'); else if (s === 'blast' || s === 'beam') audio.sfx('boom', 0.8); else if (s === 'defeat') { audio.sfx('roar'); audio.sfx('boom'); } this.st = s; this.t = 0; this.fired = false; this.shotT = 0; this.pulses = 0; this.face = p.x < this.x ? -1 : 1; this.play(s); }
    next(p: Player) {
        if (this.hp <= 0) return this.enter('defeat', p);
        const ch = CHAIN[this.phase];
        this.enter(this.st === 'idle' || this.st === 'enrage' ? ch[this.i++ % ch.length] : 'idle', p);   // attack, short breather, attack...
    }
    damage(n: number, p: Player, lvl: Level) {
        if (this.dead || !this.active || this.st === 'defeat' || this.st === 'enrage') return;
        this.flash = 0.07;
        if (this.shieldHp > 0) { this.shieldHp -= n; lvl.burst(this.x + 2 * this.face, this.coreY(), 4); if (this.shieldHp <= 0) { this.phase = 2; this.i = 0; lvl.burst(this.x, this.coreY(), 24); fx.shake(0.8); this.enter('enrage', p); } }
        else this.hp -= n;
    }
    private shoot(hz: Hazards, p: Player, ang: number, speed = 11) {
        const ox = this.x + this.face * 3, oy = this.coreY() + 0.3, a = Math.atan2(p.y + 0.9 - oy, p.x - ox) + ang;
        hz.spawn(ox, oy, Math.cos(a) * speed, Math.sin(a) * speed, 0.55, 2.6, false, RING);
    }
    update(dt: number, p: Player, bul: Bullets, lvl: Level, hz: Hazards) {
        if (!this.active || this.dead) { this.waves.clear(); return 0; }
        this.mesh.visible = true; const sp = this.sp, cfg = ST[this.st]; this.time += dt; this.t += dt * sp; this.flash -= dt;
        const k = this.t / cfg.dur, clipT = this.t * cfg.ts;
        if (this.st !== 'defeat') this.face = p.x < this.x ? -1 : 1;
        if (this.st !== 'defeat' && this.st !== 'enrage' && bul.hit(this.x, this.coreY(), HIT_R)) this.damage(1, p, lvl);

        // ---- movement: keep ~9 tiles from the player (clamped to the arena); swoop and death override
        const drift = (tx: number, v: number) => { this.x += THREE.MathUtils.clamp(THREE.MathUtils.clamp(tx, this.minX, this.maxX) - this.x, -v * dt, v * dt); };
        let oyT = 0;
        switch (this.st) {
            case 'idle': case 'roar': case 'blast': case 'beam': case 'enrage': drift(p.x + 9, 3.5 * sp); break;
            case 'swoop':
                if (this.t < 0.7) { oyT = 3.5; drift(p.x, 14); }                       // rise and slide over the player
                else if (this.t < 1.15) { oyT = 3.5; drift(p.x, 1); }                  // hang there (telegraph: 0.45s to run clear)
                else if (this.t < 1.4) oyT = -HOVER;                                   // dive
                else if (this.t < 2.1) oyT = -HOVER;                                   // on the floor: vulnerable
                break;
            case 'defeat': oyT = -HOVER; break;
        }
        const dive = this.st === 'swoop' && this.t >= 1.15 && this.t < 1.4;
        this.oy += (oyT - this.oy) * Math.min(1, (dive ? 30 : this.st === 'defeat' ? 4 : 6) * dt);

        // ---- attacks
        if (this.st === 'roar' || this.st === 'enrage') {                          // roar: rumble the whole time + rings of sound
            if (k > 0.2 && k < 0.92) fx.shake(2.6 * dt);
            if (this.pulses < PULSE_AT.length && k > PULSE_AT[this.pulses]) {
                const ox = this.x + this.face * 2.5, oy = this.coreY() + 0.6, ang = Math.atan2(p.y + 0.65 - oy, p.x - ox), high = this.pulses % 2 === 0;
                this.waves.spawn(ox, oy, ang + (high ? 0.5 * this.face : 0), high ? 0.38 : 0.3); this.pulses++;
                fx.shake(0.25); lvl.burst(this.x, this.y, 8);
            }
        }
        this.waves.update(dt, p, sp); 
        if (this.st === 'blast' && clipT >= LAUNCH && !this.fired) {              // one aimed ring (phase 2: a 3-way fan)
            this.fired = true; fx.shake(0.25, this.x);
            if (this.phase === 2) { this.shoot(hz, p, -0.22); this.shoot(hz, p, 0); this.shoot(hz, p, 0.22); } else this.shoot(hz, p, 0);
        }
        if (this.st === 'beam' && clipT >= BEAM_ON[0] && clipT <= BEAM_ON[1]) {  // a stream of rings that sweeps up and down
            this.shotT -= dt * sp; if (this.shotT <= 0) { this.shotT += 0.3; this.shoot(hz, p, Math.sin(this.t * 2.4) * 0.42, 12); }
        }
        if (this.st === 'swoop' && this.t >= 1.4 && !this.fired) {               // landing shockwaves
            this.fired = true; fx.shake(0.9, this.x); lvl.burst(this.x, this.y, 18); fx.dust(this.x - 2, this.y, -1); fx.dust(this.x + 2, this.y, 1);
        }
        if (this.st !== 'defeat' && Math.hypot(p.x - this.x, p.y + 0.65 - this.coreY()) < (dive ? BODY_R + 1 : BODY_R)) p.hurt(Math.sign(p.x - this.x) || 1);

        // ---- death: wings-up pose, tips over, explodes
        if (this.st === 'defeat') {
            this.roll = -this.face * Math.min(1.15, k * 1.6) * 0.9;
            if (Math.random() < dt * 16) fx.burst(this.x + (Math.random() - 0.5) * 6, this.coreY() + (Math.random() - 0.5) * 4, new THREE.Color(3, 1.2, 0.4), 14, 6, 3, 10, 0.6);
            if (Math.random() < dt * 4) fx.shake(0.35);
        } else this.roll = Math.sin(this.time * 1.2) * 0.03;

        // ---- visuals
        this.yaw += ((this.face > 0 ? Math.PI / 2 : -Math.PI / 2) - this.yaw) * Math.min(1, 8 * dt); this.yawG.rotation.y = this.yaw; this.mesh.rotation.z = this.roll;
        this.mesh.position.set(this.x + (this.st === 'defeat' ? (Math.random() - 0.5) * 0.3 : 0), this.y + HOVER + this.oy + Math.sin(this.time * 1.7) * 0.35 * (this.st === 'defeat' ? 0 : 1), 0.2);
        const tele = (this.st === 'blast' || this.st === 'roar' || (this.st === 'swoop' && this.t < 1.15)) && k < 0.5 ? (Math.sin(this.t * 30) * 0.5 + 0.5) * 0.7 : 0;
        const glow = this.flash > 0 ? 1.4 : BASE_GLOW + tele; for (const o of this.mats) o.m.emissive.setRGB(glow, this.flash > 0 ? glow : glow * (1 - tele * 0.5), this.flash > 0 ? glow : glow * (1 - tele * 0.8));
        this.mixer?.update(dt);

        if (this.t >= cfg.dur) {
            if (this.st === 'defeat') { this.dead = true; this.mesh.visible = false; lvl.burst(this.x, this.coreY(), 60); fx.burst(this.x, this.coreY(), new THREE.Color(3, 1.6, 0.6), 80, 12, 4, 8, 1.2); fx.shake(1); return 5000; }
            this.next(p);
        }
        return 0;
    }
}
// Audio: the Firewood theme (streamed <audio>, loops) + sound effects (Web Audio buffers cut from public/sound/sound-effets/*.mp3).
// Usage: audio.sfx('shoot') anywhere; audio.sfx('boom', 0.6, worldX) for positional volume; audio.update(dt, menuOpen, playerX, running) once per frame.
import { settings } from './menu';

type Name = 'shoot' | 'tail' | 'boom' | 'roar';
type Clip = { file: string; start: number; dur: number; gap: number; vol: number; rate: number };
const DIR = 'sound/sound-effets/';
const CLIPS: Record<Name, Clip> = {                              // start/dur = the part of the file that is used (seconds); gap = min seconds between plays; vol = base volume
  shoot:  { file: 'rifle-shots.mp3',        start: 2.78, dur: 0.16, gap: 0.05, vol: 0.55, rate: 1 },
  boom:   { file: 'fireball-explosion.mp3', start: 6.2,  dur: 1.6,  gap: 0.08, vol: 0.8,  rate: 1 },
  tail:   { file: 'rifle-shots.mp3',        start: 6.6,  dur: 0.55, gap: 0.2,  vol: 0.5,  rate: 1 },      // echo when a machine-gun burst ends
  roar:   { file: 'monster-screaming.mp3',  start: 3.0,  dur: 3.4,  gap: 0.5,  vol: 0.9,  rate: 0.85 },   // the final boss only (roar attack / sound wave)
};
const AUTO = { loopStart: 5.735, loopEnd: 6.47, vol: 0.5, hold: 0.24 };   // machine gun: a seamless 10-shot loop of rifle-shots.mp3 while the fire button is held (hold = seconds without a shot before it ends)
// level ambience (loops while playing, silent in menus): level 1 = nature, level 2 = foggy night; a level without an entry (level 3 for now) reuses level 2's.
// start/end = the part of the file that loops (the nature file begins with 2 s of silence); gain evens out the two files (nature is recorded quieter)
type Amb = { file: string; start: number; end: number; gain: number };
const AMBIENT: Record<number, Amb> = {
  1: { file: 'nature-sound-bg.mp3',     start: 2.0, end: 83.8, gain: 1.6 },
  2: { file: 'foggy-night-sound-bg.mp3', start: 0,   end: 89.8, gain: 1 },
};
const AMB_VOL = 0.3, AMB_FADE = 3;                               // AMB_VOL = ambience volume in the game (0.3 = 30%); AMB_FADE = seconds of crossfade at each loop point so there is no click
const RUN = { file: 'running-on-grass.mp3', loopStart: 1, loopEnd: 16, vol: 0.45 };
const MENU_VOL = 1, GAME_VOL = 0.22;                              // music volume in the menu / during the game (before the Settings slider)
const MUSIC = (document.createElement('audio').canPlayType('audio/ogg; codecs="vorbis"') ? 'sound/Firewood Music Pack/OGG Files/Loops/1 Call to Adventure FULL LOOP TomMusic.ogg' : 'sound/music/call-to-adventure.mp3');
type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null, master: GainNode | null = null, musicGain: GainNode | null = null;
const bufs = new Map<string, AudioBuffer>(), last = new Map<Name, number>();
const music = new Audio(encodeURI(MUSIC)); music.loop = true; music.preload = 'auto';
let autoSrc: AudioBufferSourceNode | null = null, autoGain: GainNode | null = null, lastShot = -9, streak = 0;
let ambCfg: Amb | null = null, ambGain: GainNode | null = null, ambNext = 0;
let mv = 0, listenX = 0, runSrc: AudioBufferSourceNode | null = null, runGain: GainNode | null = null, started = false;

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext; if (!AC) return null;
  ctx = new AC(); master = ctx.createGain(); master.connect(ctx.destination);
  musicGain = ctx.createGain(); musicGain.gain.value = 0; ctx.createMediaElementSource(music).connect(musicGain); musicGain.connect(master);   // via Web Audio so the volume also works on iPhones
  for (const f of [...new Set([...Object.values(CLIPS).map(c => c.file), RUN.file, ...Object.values(AMBIENT).map(c => c.file)])])
    fetch(encodeURI(DIR + f)).then(r => r.arrayBuffer()).then(b => ctx!.decodeAudioData(b)).then(d => bufs.set(f, d)).catch(() => { /* a missing sound must never break the game */ });
  return ctx;
}
// browsers only allow sound after a tap / key press: the first one starts the theme (also in the title menu)
function unlock() {
  const c = ensure(); if (!c) return;
  void c.resume().then(() => music.play()).then(() => {
    started = true; for (const e of ['pointerdown', 'keydown', 'touchend']) removeEventListener(e, unlock, true);
  }).catch(() => { /* still blocked: try again on the next tap */ });
}
for (const e of ['pointerdown', 'keydown', 'touchend']) addEventListener(e, unlock, true);
document.addEventListener('visibilitychange', () => { if (!started) return; if (document.hidden) { music.pause(); void ctx?.suspend(); } else void ctx?.resume().then(() => music.play()); });

export const audio = {
  /** pick the ambience loop of this level (call once at start) */
  ambient(level: number) { ambCfg = AMBIENT[level] ?? AMBIENT[2]; },
  /** x = world position of the sound (quieter + more muffled the further from the hero); range = distance in tiles where it becomes silent */
  sfx(name: Name, vol = 1, x?: number, range = 28) {
    const c = CLIPS[name], b = bufs.get(c.file); if (!ctx || !master || !b || ctx.state !== 'running') return;
    const now = ctx.currentTime; if (now - (last.get(name) ?? -9) < c.gap) return; last.set(name, now);
    let v = c.vol * vol * (settings.sfx ?? 1); const dist = x === undefined ? 0 : Math.abs(x - listenX); v *= Math.max(0, 1 - dist / range);
    if (v < 0.02) return;
    const rate = c.rate * (1 + (Math.random() - 0.5) * 0.12), real = c.dur / rate, s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = b; s.playbackRate.value = rate; g.gain.setValueAtTime(v, now); g.gain.setValueAtTime(v, now + real * 0.7); g.gain.linearRampToValueAtTime(0.0001, now + real);   // fade the cut end
    if (dist > 20) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = Math.max(500, 8000 - (dist - 20) * 70); s.connect(f); f.connect(g); } else s.connect(g);   // far away = muffled
    g.connect(master); s.start(now, c.start, c.dur);
  },
  /** one call per bullet: a single shot sounds like one rifle shot; holding the button (3+ shots in a row) switches to a machine-gun loop, released = short echo tail */
  shoot() {
    const b = bufs.get('rifle-shots.mp3'); if (!ctx || !master || !b || ctx.state !== 'running') return;
    const now = ctx.currentTime; streak = now - lastShot < 0.27 ? streak + 1 : 0; lastShot = now;
    if (streak < 2) { this.sfx('shoot'); return; }
    if (autoSrc) return;
    autoSrc = ctx.createBufferSource(); autoGain = ctx.createGain(); autoSrc.buffer = b; autoSrc.loop = true; autoSrc.loopStart = AUTO.loopStart; autoSrc.loopEnd = AUTO.loopEnd;
    autoGain.gain.setValueAtTime(0, now); autoGain.gain.linearRampToValueAtTime(AUTO.vol * (settings.sfx ?? 1), now + 0.03);
    autoSrc.connect(autoGain); autoGain.connect(master); autoSrc.start(now, AUTO.loopStart);
  },
  /** once per frame: music volume (menu = normal, game = quiet), footsteps, listener position */
  update(dt: number, menuOpen: boolean, playerX: number, running: boolean) {
    listenX = playerX; if (!ctx || !master || !musicGain || ctx.state !== 'running') return;
    if (autoSrc && autoGain && ctx.currentTime - lastShot > AUTO.hold) {                    // button released: fade the loop out, play the echo
      const t = ctx.currentTime; autoGain.gain.cancelScheduledValues(t); autoGain.gain.setValueAtTime(autoGain.gain.value, t); autoGain.gain.linearRampToValueAtTime(0, t + 0.05); autoSrc.stop(t + 0.06); autoSrc = null; autoGain = null; this.sfx('tail');
    }
    mv += ((menuOpen ? MENU_VOL : GAME_VOL) * (settings.music ?? 1) - mv) * Math.min(1, 1.5 * dt); musicGain.gain.value = mv;
    const ab = ambCfg && bufs.get(ambCfg.file);
    if (ambCfg && ab) {                                                                      // ambience: overlapping copies crossfade into each other = seamless loop
      if (!ambGain) { ambGain = ctx.createGain(); ambGain.gain.value = 0; ambGain.connect(master); ambNext = ctx.currentTime; }
      while (ctx.currentTime + 0.3 >= ambNext) {
        const len = Math.min(ambCfg.end, ab.duration) - ambCfg.start, t = ambNext, s = ctx.createBufferSource(), g = ctx.createGain();
        s.buffer = ab; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + AMB_FADE); g.gain.setValueAtTime(1, t + len - AMB_FADE); g.gain.linearRampToValueAtTime(0, t + len);
        s.connect(g); g.connect(ambGain); s.start(t, ambCfg.start, len); ambNext = t + len - AMB_FADE;
      }
      ambGain.gain.value += ((menuOpen ? 0 : AMB_VOL * ambCfg.gain * (settings.sfx ?? 1)) - ambGain.gain.value) * Math.min(1, 1.5 * dt);   // quiet in menus (the theme plays alone), follows the Sound Effects slider
    }
    const rb = bufs.get(RUN.file), want = running && !menuOpen ? RUN.vol * (settings.sfx ?? 1) : 0;
    if (!runSrc && want > 0 && rb) { runSrc = ctx.createBufferSource(); runGain = ctx.createGain(); runGain.gain.value = 0; runSrc.buffer = rb; runSrc.loop = true; runSrc.loopStart = RUN.loopStart; runSrc.loopEnd = RUN.loopEnd; runSrc.connect(runGain); runGain.connect(master); runSrc.start(0, RUN.loopStart); }
    if (runSrc && runGain) { runGain.gain.value += (want - runGain.gain.value) * Math.min(1, 14 * dt); if (want === 0 && runGain.gain.value < 0.01) { runSrc.stop(); runSrc.disconnect(); runSrc = null; runGain = null; } }
  },
};

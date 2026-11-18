import { fx } from './fx';
// Cinematic scenes: black letterbox bars, a scripted camera (shots that glide between poses), captions, slow-mo and a skip button.
// The world keeps running during a scene (so the boss can roar / fall apart); main.ts locks input + hp while `cine.on`.
// Scenes themselves live in scenes.ts. Usage: cine.play(shots, { start, hp }) - tick(rawDt) every frame - view(gamePose) when placing the camera.
export interface Pose { x: number; y: number; z: number; lx: number; ly: number }     // camera position + the point it looks at
export type PoseIn = Partial<Pose> | (() => Partial<Pose>);                           // missing z = 17 (game camera), lx/ly = look straight ahead; a function is re-read every frame (follows a moving boss)
export interface Shot { dur: number; to: PoseIn; from?: PoseIn; ease?: 'lin' | 'in' | 'out' | 'inout'; text?: string; who?: string; slow?: number; shake?: number }
const BAR = 12;            // letterbox bar height, % of the screen
const BLEND = 0.7;         // seconds to glide back to the normal game camera when a scene ends
const TYPE = 45;           // caption typewriter speed, characters per second
const full = (p: Partial<Pose>): Pose => { const x = p.x ?? 0, y = p.y ?? 0; return { x, y, z: p.z ?? 17, lx: p.lx ?? x, ly: p.ly ?? y - 0.5 }; };
const EASE = { lin: (t: number) => t, in: (t: number) => t * t, out: (t: number) => 1 - (1 - t) * (1 - t), inout: (t: number) => t * t * (3 - 2 * t) };
const mix = (a: Pose, b: Pose, k: number): Pose => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, lx: a.lx + (b.lx - a.lx) * k, ly: a.ly + (b.ly - a.ly) * k });
const CSS = `
.cb{position:fixed;left:0;right:0;height:0;background:#000;z-index:30;transition:height .6s ease;pointer-events:none}.cb.t{top:0}.cb.b{bottom:0}
body.cine .cb{height:${BAR}vh}
body.cine #hp,body.cine #boss,body.cine #score,body.cine #touch,body.cine #pausebtn,body.cine #msg{display:none!important}
#cinecap{position:fixed;left:0;right:0;bottom:0;height:${BAR}vh;z-index:31;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;pointer-events:none;color:#fff;text-align:center;padding:0 5vw;opacity:0;transition:opacity .3s}
#cinecap b{font:800 clamp(11px,1.7vw,17px) system-ui;letter-spacing:.25em;color:#ffd36a}#cinecap span{font:600 clamp(14px,2.5vw,26px)/1.25 system-ui;text-shadow:0 2px 0 #000a}
#cineskip{position:fixed;right:calc(16px + env(safe-area-inset-right));top:calc(${BAR / 2}vh - 16px);z-index:32;display:none;padding:6px 14px;border:2px solid #fff6;border-radius:6px;background:#0008;color:#fff;font:700 14px system-ui;cursor:pointer}
body.cine #cineskip{display:block}
#cinefade{position:fixed;inset:0;background:#000;z-index:29;opacity:0;pointer-events:none;transition:opacity 1.1s ease}`;

class Cine {
  on = false;                  // a scene is playing: input locked, hp locked, HUD hidden
  scale = 1;                   // world time scale (slow-mo): main.ts multiplies dt by it
  lockHp = 0;                  // hero can't drop below this while a scene plays
  private tgt = 1; private shots: Shot[] = []; private i = 0; private t = 0; private blend = 0;
  private cur: Pose = full({}); private from: Pose = full({}); private done: (() => void) | null = null; private shown = -1;
  private el?: { cap: HTMLElement; who: HTMLElement; txt: HTMLElement; fade: HTMLElement };
  /** Remember a scene was already seen this run (sessionStorage), so retries after dying don't replay it. */
  seen(k: string) { return !!sessionStorage.getItem('sky_cine_' + k); }
  mark(k: string) { sessionStorage.setItem('sky_cine_' + k, '1'); }
  forget() { for (const k of Object.keys(sessionStorage)) if (k.startsWith('sky_cine_')) sessionStorage.removeItem(k); }
  private build() {
    if (this.el) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const mk = (tag: string, cls = '', id = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (id) e.id = id; document.body.appendChild(e); return e; };
    mk('div', 'cb t'); mk('div', 'cb b');
    const cap = mk('div', '', 'cinecap'), who = document.createElement('b'), txt = document.createElement('span'); cap.append(who, txt);
    const fade = mk('div', '', 'cinefade'), skip = mk('div', '', 'cineskip'); skip.textContent = 'SKIP \u25B8';
    skip.addEventListener('touchstart', e => { e.stopPropagation(); e.preventDefault(); this.skip(); }, { passive: false });   // stopPropagation: input.ts swallows touches that reach window
    skip.addEventListener('click', () => this.skip());
    addEventListener('keydown', e => { if (this.on && (e.code === 'Enter' || e.code === 'NumpadEnter')) this.skip(); });
    this.el = { cap, who, txt, fade };
  }
  /** Start a scene. `start` = the normal game camera right now (so the first shot can glide from it), `hp` = hero hp to protect. Resolves when the scene ends. */
  play(shots: Shot[], o: { start: Pose; hp: number; fade?: boolean }): Promise<void> {
    if (this.on || !shots.length) return Promise.resolve();
    this.build(); this.shots = shots; this.i = 0; this.on = true; this.blend = 0; this.lockHp = o.hp; this.cur = { ...o.start };
    document.body.classList.add('cine');
    if (o.fade) { const f = this.el!.fade; f.style.transition = 'none'; f.style.opacity = '1'; void f.offsetWidth; f.style.transition = ''; f.style.opacity = '0'; }
    this.begin(); return new Promise(r => (this.done = r));
  }
  private begin() {
    const s = this.shots[this.i]; this.t = 0; this.shown = -1; this.tgt = s.slow ?? 1;
    this.from = s.from ? full(typeof s.from === 'function' ? s.from() : s.from) : { ...this.cur };
    if (s.shake) fx.shake(s.shake);
    const e = this.el!; e.who.textContent = s.who ?? ''; e.txt.textContent = ''; e.cap.style.opacity = s.text || s.who ? '1' : '0';
  }
  private caption(s: Shot) {
    const n = Math.min((s.text ?? '').length, Math.floor(this.t * TYPE)); if (n !== this.shown) { this.shown = n; this.el!.txt.textContent = (s.text ?? '').slice(0, n); }
    if (this.t > s.dur - 0.35) this.el!.cap.style.opacity = '0';                       // fade out before the cut
  }
  /** Call every frame with the REAL (unscaled) dt, while the game isn't paused. */
  tick(raw: number) {
    this.scale += (this.tgt - this.scale) * Math.min(1, 7 * raw);                      // slow-mo eases in and out
    if (!this.on) { if (this.blend > 0) this.blend = Math.max(0, this.blend - raw); if (this.blend === 0 && Math.abs(this.scale - 1) < 0.01) this.scale = 1; return; }
    const s = this.shots[this.i]; this.t += raw;
    this.cur = mix(this.from, full(typeof s.to === 'function' ? s.to() : s.to), EASE[s.ease ?? 'inout'](Math.min(1, this.t / s.dur)));
    this.caption(s);
    if (this.t >= s.dur) { if (++this.i >= this.shots.length) this.finish(); else this.begin(); }
  }
  /** Camera for this frame: the scene's pose, a glide back to `game` after it ends, or null (normal gameplay camera). */
  view(game: Pose): Pose | null {
    if (this.on) return this.cur;
    return this.blend > 0 ? mix(this.cur, game, EASE.inout(1 - this.blend / BLEND)) : null;
  }
  private finish() {
    if (!this.on) return; this.on = false; this.tgt = 1; this.blend = BLEND; document.body.classList.remove('cine'); this.el!.cap.style.opacity = '0';
    const d = this.done; this.done = null; d?.();
  }
  skip() { this.finish(); }
  stop() { this.finish(); }                                                             // menu opened / game over: end at once
}
export const cine = new Cine();

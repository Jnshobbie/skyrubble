import { fx, SHAKE_SCALE } from './fx';
// Title / pause / game-over / win menu (HTML overlay over the live, blurred game), plus persistent Record stats and Settings (localStorage).
// The game (main.ts) only calls menu.open(kind, ...) and fills menu.on.* callbacks.
export type Stats = { games: number; time: number; score: number; kills: number; deaths: number; best: number; bestDate: string; cp: number; wins: number };
const S0: Stats = { games: 0, time: 0, score: 0, kills: 0, deaths: 0, best: 0, bestDate: '-', cp: 0, wins: 0 };
const rd = <T,>(k: string, d: T): T => { try { return { ...d, ...JSON.parse(localStorage.getItem(k) || '{}') }; } catch { return d; } };
export const stats: Stats = rd('sky_stats', S0), settings = rd('sky_set', { shake: SHAKE_SCALE, aimAssist: true });
export const save = () => { try { localStorage.setItem('sky_stats', JSON.stringify(stats)); localStorage.setItem('sky_set', JSON.stringify(settings)); } catch { /* private mode */ } };
fx.scale = settings.shake;
const fmt = (s: number) => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s % 60).padStart(2, '0'); };

const css = document.createElement('style'); css.textContent = `
#menu{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:10;background:radial-gradient(ellipse at center,#0a1220aa 0%,#0a1220dd 100%);backdrop-filter:blur(3px);font-family:'Arial Black','Impact',system-ui,sans-serif;text-transform:uppercase;user-select:none}
body.menu #hp,body.menu #score,body.menu #boss,body.menu #touch,body.menu #pausebtn{display:none!important}
.m-panel{width:min(88vw,380px);max-height:94vh;overflow:auto;padding:18px 22px 22px;background:#1b2433;border:4px solid #06090f;border-radius:6px;box-shadow:inset 0 0 0 3px #3a4a66,0 10px 0 #0006}
.m-title{margin:-6px -6px 16px;padding:10px 6px 8px;text-align:center;background:#0c1018;border:3px solid #000;color:#fff;font:900 clamp(30px,8.5vw,46px)/1 'Arial Black','Impact',system-ui;letter-spacing:2px;-webkit-text-stroke:2px #000;paint-order:stroke fill;text-shadow:0 4px 0 #e0457b}
.m-sub{text-align:center;color:#ffe27a;font:900 20px system-ui;margin:-6px 0 14px;letter-spacing:2px}
.m-btn{display:block;width:100%;margin:12px 0;padding:11px 8px 9px;font:900 clamp(20px,5.5vw,26px)/1 'Arial Black','Impact',system-ui;letter-spacing:3px;color:#0d1624;border:4px solid #000;border-radius:4px;cursor:pointer;text-transform:uppercase;text-shadow:0 2px 0 #fff6;box-shadow:inset 0 5px 0 #fff5,inset 0 -6px 0 #0003,0 5px 0 #000a}
.m-btn:hover,.m-btn:focus{outline:none;filter:brightness(1.15);transform:translateY(2px);box-shadow:inset 0 5px 0 #fff5,inset 0 -6px 0 #0003,0 3px 0 #000a}
.m-btn:active{transform:translateY(5px);box-shadow:inset 0 5px 0 #fff5,inset 0 -6px 0 #0003}
.g{background:#4de8b5}.b{background:#3aa0ee}.y{background:#f7d533}.r{background:#f2603c}
.m-row{display:flex;justify-content:space-between;gap:14px;color:#fff;font:900 16px system-ui;letter-spacing:1px;padding:5px 2px;border-bottom:2px solid #ffffff14}
.m-row b{color:#ffe27a}
.m-set{color:#fff;font:900 16px system-ui;letter-spacing:1px;margin:12px 0 4px;display:flex;justify-content:space-between}
.m-panel input[type=range]{width:100%;accent-color:#4de8b5;height:28px}
.m-hint{position:absolute;bottom:14px;left:0;right:0;text-align:center;color:#fff;font:700 13px system-ui;letter-spacing:1px;text-shadow:0 2px 0 #000a}
@media (max-height:640px){.m-title{font-size:clamp(24px,6vw,34px);padding:6px 4px 5px;margin-bottom:10px}.m-btn{margin:8px 0;padding:7px 6px 5px;font-size:20px}.m-panel{padding:12px 18px 16px}.m-sub{margin:-4px 0 8px;font-size:17px}.m-hint{display:none}}
#pausebtn{position:fixed;top:40px;right:12px;width:44px;height:44px;border-radius:50%;border:3px solid #fff9;background:#0005;color:#fff;font:900 18px system-ui;z-index:5;cursor:pointer}`;
document.head.appendChild(css);
const root = document.body.appendChild(document.createElement('div')); root.id = 'menu';
const pauseBtn = document.body.appendChild(document.createElement('button')); pauseBtn.id = 'pausebtn'; pauseBtn.textContent = '❚❚'; pauseBtn.title = 'Pause (Esc)';
type Kind = 'title' | 'pause' | 'over' | 'win';
export const menu = {
  isOpen: false,
  on: { play: () => {}, resume: () => {}, restart: () => {}, newGame: () => {}, quit: () => {}, pause: () => {} },
  open(kind: Kind, info: { score?: number; cp?: number } = {}) { this.isOpen = true; document.body.classList.add('menu'); root.style.display = 'flex'; this.screen(kind, info); },
  close() { this.isOpen = false; document.body.classList.remove('menu'); root.style.display = 'none'; },
  screen(kind: Kind, info: { score?: number; cp?: number } = {}) {
    const P = document.createElement('div'); P.className = 'm-panel';
    const title = (t: string, sub = '') => { const d = document.createElement('div'); d.className = 'm-title'; d.textContent = t; P.appendChild(d); if (sub) { const s = document.createElement('div'); s.className = 'm-sub'; s.textContent = sub; P.appendChild(s); } };
    const btn = (label: string, cls: string, fn: () => void) => { const b = document.createElement('button'); b.className = 'm-btn ' + cls; b.textContent = label; b.onclick = fn; P.appendChild(b); return b; };
    const back = () => this.screen(kind, info);
    if (kind === 'title') {
      title('SKYRUBBLE'); const cp = info.cp ?? 0;
      btn(cp > 0 ? `CONTINUE (CHECKPOINT ${cp})` : 'PLAY', 'g', () => this.on.play());
      if (cp > 0) btn('NEW GAME', 'y', () => this.on.newGame());
    } else if (kind === 'pause') { title('PAUSED'); btn('RESUME', 'g', () => this.on.resume()); btn('RESTART', 'y', () => this.on.restart()); }
    else if (kind === 'over') { title('GAME OVER', 'SCORE ' + (info.score ?? 0)); btn('RETRY', 'g', () => this.on.restart()); }
    else { title('CLEARED!', 'SCORE ' + (info.score ?? 0)); btn('PLAY AGAIN', 'g', () => this.on.newGame()); }
    btn('RECORD', 'b', () => this.record(back)); btn('SETTINGS', kind === 'title' || kind === 'pause' ? 'y' : 'b', () => this.settings(back));
    btn(kind === 'title' ? 'QUIT' : 'MAIN MENU', 'r', () => this.on.quit());
    root.replaceChildren(P);
    if (kind === 'title') { const h = document.createElement('div'); h.className = 'm-hint'; h.textContent = 'A/D MOVE · W/SPACE JUMP · J OR CLICK SHOOT · E AIM UP · S AIM DOWN · ESC PAUSE'; root.appendChild(h); }
    (P.querySelector('button') as HTMLElement)?.focus();
  },
  record(back: () => void) {
    const P = document.createElement('div'); P.className = 'm-panel'; const t = document.createElement('div'); t.className = 'm-title'; t.textContent = 'RECORD'; P.appendChild(t);
    const rows: [string, string][] = [['BEST SCORE', String(stats.best)], ['BEST SCORE DATE', stats.bestDate], ['TOTAL GAMES', String(stats.games)], ['TOTAL TIME', fmt(stats.time)], ['TOTAL SCORE', String(stats.score)], ['TOTAL KILLS', String(stats.kills)], ['DEATHS', String(stats.deaths)], ['VICTORIES', String(stats.wins)], ['FURTHEST CHECKPOINT', stats.cp + ' / 3']];
    for (const [a, b] of rows) { const r = document.createElement('div'); r.className = 'm-row'; r.innerHTML = `<span>${a}</span><b>${b}</b>`; P.appendChild(r); }
    const b = document.createElement('button'); b.className = 'm-btn g'; b.textContent = 'BACK'; b.onclick = back; P.appendChild(b); root.replaceChildren(P); b.focus();
  },
  settings(back: () => void) {
    const P = document.createElement('div'); P.className = 'm-panel'; const t = document.createElement('div'); t.className = 'm-title'; t.textContent = 'SETTINGS'; P.appendChild(t);
    const lab = document.createElement('div'); lab.className = 'm-set'; const val = document.createElement('b'); val.style.color = '#ffe27a'; lab.append('CAMERA SHAKE', val); P.appendChild(lab);
    const sl = document.createElement('input'); sl.type = 'range'; sl.min = '0'; sl.max = '3'; sl.step = '0.1'; sl.value = String(settings.shake);
    const show = () => (val.textContent = Math.round(settings.shake / SHAKE_SCALE * 100) + '%'); show();
    sl.oninput = () => { settings.shake = Number(sl.value); fx.scale = settings.shake; show(); save(); }; P.appendChild(sl);
    const aa = document.createElement('button'); aa.className = 'm-btn b'; const showAA = () => (aa.textContent = 'AIM ASSIST: ' + (settings.aimAssist ? 'ON' : 'OFF')); showAA();
    aa.onclick = () => { settings.aimAssist = !settings.aimAssist; showAA(); save(); }; P.appendChild(aa);
    const reset = document.createElement('button'); reset.className = 'm-btn r'; reset.textContent = 'RESET PROGRESS'; reset.onclick = () => { if (confirm('Erase checkpoint progress and all records?')) { sessionStorage.removeItem('sky_cp'); Object.assign(stats, S0); save(); location.reload(); } }; P.appendChild(reset);
    const b = document.createElement('button'); b.className = 'm-btn g'; b.textContent = 'BACK'; b.onclick = back; P.appendChild(b); root.replaceChildren(P); b.focus();
  },
};
pauseBtn.onclick = () => menu.on.pause();
// keyboard: up/down moves between buttons (Enter = click is native on a focused button)
addEventListener('keydown', e => { if (!menu.isOpen || (e.code !== 'ArrowDown' && e.code !== 'ArrowUp')) return; const bs = Array.from(root.querySelectorAll('button')) as HTMLElement[], i = bs.indexOf(document.activeElement as HTMLElement); bs[(i + (e.code === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length]?.focus(); e.preventDefault(); });

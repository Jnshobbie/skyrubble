// Unified input: keyboard (PC) + on-screen buttons (mobile). Replace the touch part with HollowSky's scheme if it differs.
export const inp = { x: 0, jump: false, jumpDown: false, fire: false };
export const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const keys = new Set<string>();
const touch = { l: false, r: false, j: false, f: false };
addEventListener('keydown', e => { keys.add(e.code); if (e.code === 'KeyR') location.reload(); });
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('mousedown', () => keys.add('Mouse'));
addEventListener('mouseup', () => keys.delete('Mouse'));
function bind(id: string, k: keyof typeof touch) {
  const el = document.getElementById(id)!;
  const set = (v: boolean) => (e: Event) => { e.preventDefault(); touch[k] = v; };
  el.addEventListener('touchstart', set(true), { passive: false });
  el.addEventListener('touchend', set(false), { passive: false });
  el.addEventListener('touchcancel', set(false));
}
if (isTouch) { document.getElementById('touch')!.style.display = 'block'; bind('bl', 'l'); bind('br', 'r'); bind('bj', 'j'); bind('bf', 'f'); }
let prevJump = false;
export function poll() {
  const l = keys.has('KeyA') || keys.has('ArrowLeft') || touch.l;
  const r = keys.has('KeyD') || keys.has('ArrowRight') || touch.r;
  inp.x = (r ? 1 : 0) - (l ? 1 : 0);
  inp.jump = keys.has('Space') || keys.has('KeyW') || keys.has('ArrowUp') || touch.j;
  inp.jumpDown = inp.jump && !prevJump; prevJump = inp.jump;
  inp.fire = keys.has('KeyJ') || keys.has('KeyK') || keys.has('Mouse') || touch.f;
}

// Unified input: keyboard (PC) + on-screen buttons (mobile). Replace the touch part with HollowSky's scheme if it differs.
export const inp = { x: 0, jump: false, jumpDown: false, fire: false, up: false, down: false };   // up/down = aim up / aim down (E or I / S or ArrowDown / touch ▲ ▼)
export const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const keys = new Set<string>();
const touch = { x: 0, j: false, f: false, u: false, d: false };   // x = analogue -1..1
addEventListener('keydown', e => { keys.add(e.code); if (e.code === 'KeyR') location.reload(); });
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('mousedown', e => { if (!(e.target as HTMLElement).closest('#menu,#pausebtn')) keys.add('Mouse'); });
addEventListener('mouseup', () => keys.delete('Mouse'));
// ---- mobile: floating invisible analogue (left) + tap anywhere else to jump + visible fire circle (right; drag up/down inside it to aim)
const STICK_R = 60, DEAD = 0.18;                                    // STICK_R = px of finger travel for full speed; DEAD = dead zone (0..1)
const hold = (k: 'j' | 'f', ms: number) => { touch[k] = true; setTimeout(() => { if (k === 'j' || !pressed.f) touch[k] = false; }, ms); };   // min hold so a quick tap is never missed by a frame
const pressed = { f: false };
if (isTouch) {
  document.getElementById('touch')!.style.display = 'block';
  const ring = document.getElementById('ring')!, dot = document.getElementById('dot')!, fireEl = document.getElementById('fire')!;
  let stickId = -1, sx = 0, sy = 0, fireId = -1, fy = 0;
  const ui = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest('#menu,#pausebtn');
  const onStart = (e: TouchEvent) => {
    if (ui(e.target)) return; e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      const r = fireEl.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (Math.hypot(t.clientX - cx, t.clientY - cy) < r.width * 0.75 && fireId < 0) { fireId = t.identifier; fy = t.clientY; pressed.f = true; hold('f', 90); fireEl.classList.add('on'); }
      else if (t.clientX < innerWidth * 0.42 && stickId < 0) { stickId = t.identifier; sx = t.clientX; sy = t.clientY; ring.style.cssText = `display:block;left:${sx}px;top:${sy}px`; dot.style.transform = 'translate(-50%,-50%)'; }
      else hold('j', 130);   // tap = jump; second tap in the air = double jump
    }
  };
  const onMove = (e: TouchEvent) => {
    if (ui(e.target)) return; e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === stickId) {
        const dx = Math.max(-STICK_R, Math.min(STICK_R, t.clientX - sx)), n = dx / STICK_R;
        touch.x = Math.abs(n) < DEAD ? 0 : n; dot.style.transform = `translate(calc(-50% + ${dx}px),-50%)`;
      } else if (t.identifier === fireId) { const dy = t.clientY - fy; touch.u = dy < -28; touch.d = dy > 28; }
    }
  };
  const onEnd = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === stickId) { stickId = -1; touch.x = 0; ring.style.display = 'none'; }
      if (t.identifier === fireId) { fireId = -1; pressed.f = false; touch.f = false; touch.u = touch.d = false; fireEl.classList.remove('on'); }
    }
  };
  addEventListener('touchstart', onStart, { passive: false }); addEventListener('touchmove', onMove, { passive: false });
  addEventListener('touchend', onEnd); addEventListener('touchcancel', onEnd);
}
let prevJump = false;
export function poll() {
  const l = keys.has('KeyA') || keys.has('ArrowLeft');
  const r = keys.has('KeyD') || keys.has('ArrowRight');
  inp.x = (r ? 1 : 0) - (l ? 1 : 0) || touch.x;
  inp.jump = keys.has('Space') || keys.has('KeyW') || keys.has('ArrowUp') || touch.j;
  inp.jumpDown = inp.jump && !prevJump; prevJump = inp.jump;
  inp.up = keys.has('KeyE') || keys.has('KeyI') || touch.u; inp.down = keys.has('KeyS') || keys.has('ArrowDown') || touch.d;
  inp.fire = keys.has('KeyJ') || keys.has('KeyK') || keys.has('Mouse') || touch.f;
}

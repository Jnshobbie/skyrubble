// Procedural-but-deterministic world: intro (free room, no enemies) + 4 zones separated by 3 checkpoints + boss arena.
// Zone shapes differ: 0 meadow, 1 stairs, 2 towers & pits, 3 floating islands. Dragon type = zone - 1 (green, purple, orange).
// Passability by construction: gaps <= 4 tiles, single step-ups <= 3 tiles (player: jump ~3.9 tiles, double jump more).
export type MapData = { rects: number[][]; foes: { x: number; y: number; r: number; elite: boolean }[]; dragons: { x: number; y: number; v: number }[];
  saws: { x: number; y: number; rx: number }[]; checkpoints: number[]; bossX: number; arenaX: number; len: number; zones: number[] };
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
export function buildMap(): MapData {
  seed = 11;
  const rects: number[][] = [], foes: MapData['foes'] = [], dragons: MapData['dragons'] = [], saws: MapData['saws'] = [], checkpoints: number[] = [];
  const tops: { x: number; w: number; y: number; zone: number; floating: boolean }[] = [];
  let zone = 0;
  const ground = (x: number, w: number) => { rects.push([x, 0, w, 2]); tops.push({ x, w, y: 2, zone, floating: false }); };
  const plat = (x: number, y: number, w: number) => { rects.push([x, y, w, 1]); tops.push({ x, w, y: y + 1, zone, floating: true }); };
  const block = (x: number, w: number, h: number) => { rects.push([x, 2, w, h]); tops.push({ x, w, y: 2 + h, zone, floating: true }); };
  const ZONE_LEN = 90, INTRO = 50;

  // ---------- intro: 0..50, nothing hostile. Room to run, jump, double-jump ----------
  ground(0, 22); plat(8, 5, 4); plat(14, 7, 3);
  plat(23, 4, 3);                                               // stepping stone over the first gap (22..26)
  ground(26, 24); block(31, 2, 1); block(36, 2, 2); plat(40, 6, 5);

  // ---------- zones ----------
  let x = INTRO;
  const flat = (w: number, withPlat = true) => { ground(x, w); if (withPlat) { const n = w > 12 ? 2 : 1; for (let i = 0; i < n; i++) plat(x + 2 + i * Math.floor(w / 2), ri(5, 7), ri(3, 5)); } x += w; };
  const gap = (w: number, bridge = false) => { if (bridge) plat(x + 1, ri(3, 4), Math.max(2, w - 2)); x += w; };
  const stairsUp = () => { for (let i = 0; i < 3; i++) { block(x, 3, i + 1); x += 3; } block(x, 7, 4); x += 7; };                    // 3 steps + a 7-wide landing
  const stairsDown = () => { block(x, 7, 4); x += 7; for (let i = 2; i >= 0; i--) { block(x, 3, i + 1); x += 3; } };
  const tower = () => { const h = ri(3, 4), w = ri(5, 6); gap(3, true); block(x, w, h); plat(x + w + 1, 2 + h + 1, 3); x += w; ground(x, 9); x += 9; };
  const islands = () => { let y = 4; for (let i = 0; i < 4; i++) { const w = ri(4, 6); plat(x, y, w); x += w + ri(3, 4); y = Math.max(4, Math.min(7, y + ri(-2, 2))); } ground(x, 6); x += 6; };
  const SEQ: (() => void)[][] = [
    [() => flat(14), () => { gap(4, true); }, () => flat(16), () => flat(11), () => gap(4, true), () => flat(15), () => flat(12)],
    [() => flat(10), stairsUp, stairsDown, () => flat(10), () => gap(4, true), stairsUp, stairsDown, () => flat(12)],
    [tower, () => flat(11), tower, tower, () => flat(10), tower],
    [islands, () => flat(9), islands, () => gap(4, true), islands, () => flat(9)],
  ];
  const cps: number[] = [], runs: number[] = [];
  for (let z = 0; z < 4; z++) {
    zone = z; if (z === 0) { /* intro already placed to x=50 */ }
    const end = INTRO + (z + 1) * ZONE_LEN - 12;
    let k = 0; while (x < end - 14) { SEQ[z][k++ % SEQ[z].length](); }
    runs.push(x);                                              // lower lane run-up starts here (the upper lane ends here and drops onto it)
    if (x < end) { ground(x, end - x); x = end; }              // flat run-up so the checkpoint is always on level ground
    ground(x, 12); if (z < 3) cps.push(x + 5); x += 12;          // checkpoints 1-3; the last zone runs straight into the boss arena
  }
  checkpoints.push(...cps);
  // ---------- boss arena ----------
  zone = 4; const arenaX = x; ground(x, 50); x += 50;
  const bossX = arenaX + 40;

  // ---------- two lanes ----------
  // LOWER lane = everything above (ground top y=2). UPPER lane = 1-thick stone slabs at tile y=10 (top 11), 8 tiles over the lower ground, so the lower lane
  // is a corridor under a ceiling. Connections: a 2-step ramp per zone (lower -> upper), holes in the slabs (drop to lower), and bullets: any block can be shot
  // away, so shooting DOWN through a slab opens a window onto the enemies below. Sealed walls in the lower corridor must be shot through (2 rows: aim straight + aim up).
  const SLAB = 10, UP = SLAB + 1;
  const low = rects.slice(), lowerGround = (x: number) => low.some(([rx, ry, rw]) => ry === 0 && x >= rx && x < rx + rw);
  const lowerClear = (x: number) => lowerGround(x) && !low.some(([rx, ry, rw]) => ry === 2 && x >= rx && x < rx + rw);   // floor with no block/pillar standing on it (floating platforms don't count)
  const blockedAt = (x: number) => rects.some(([rx, ry, rw, rh]) => x >= rx - 1 && x < rx + rw + 1 && ry <= 3 && ry + rh > 2 && ry >= 2);   // something stands on the lower ground here
  for (let z = 0; z < 4; z++) {
    const a = z === 0 ? 66 : cps[z - 1] + 14, b = runs[z]; let rx = -1;
    for (let X = a; X + 9 <= b && rx < 0; X++) if (Array.from({ length: 9 }, (_, i) => lowerClear(X + i)).every(Boolean)) rx = X;
    if (rx < 0) continue;
    for (let i = rects.length - 1; i >= 0; i--) { const [qx, qy, qw] = rects[i]; if (qy >= 3 && qy <= 9 && qx < rx + 9 && qx + qw > rx + 1) rects.splice(i, 1); }   // clear floating platforms out of the ramp's way
    for (let i = tops.length - 1; i >= 0; i--) { const t = tops[i]; if (t.floating && t.y >= 4 && t.y <= 10 && t.x < rx + 9 && t.x + t.w > rx + 1) tops.splice(i, 1); }
    rects.push([rx + 2, 2, 3, 3], [rx + 5, 2, 3, 6]);          // ramp: +3, +3, then +3 onto the slab (all single-jump)
    // lower sealed wall: a 1-wide column from the floor to the ceiling on a clear stretch after the ramp
    for (let X = rx + 9; X + 4 <= b; X++) if (X > a + 18 && lowerClear(X) && lowerClear(X - 2) && lowerClear(X + 2) && rnd() < 0.2) { rects.push([X, 2, 1, 8]); break; }
    // slab pieces with holes (holes only above clear lower ground, so you land on the lower lane, not in the void)
    let X = rx + 8; const pieces: { x: number; w: number; holeL: boolean; holeR: boolean }[] = []; let holeL = false;
    while (X < b - 8) {
      const w = Math.min(ri(8, 13), b - X); let hole = 0; const h = ri(3, 4);
      if (X + w + h + 8 < b && Array.from({ length: h + 2 }, (_, i) => lowerClear(X + w - 1 + i)).every(Boolean)) hole = h;
      pieces.push({ x: X, w, holeL, holeR: hole > 0 }); X += w + hole; holeL = hole > 0;
    }
    for (const pc of pieces) {
      rects.push([pc.x, SLAB, pc.w, 1]);
      const wx = pc.w >= 10 && rnd() < 0.45 ? pc.x + pc.w - 3 : -99; if (wx > 0) rects.push([wx, UP, 1, 4]);       // 4-high wall on the slab: shoot it away (or double-jump it)
      const n = pc.w >= 12 ? 2 : 1; if (pc.w >= 8) for (let i = 0; i < n; i++) { const fx = pc.x + pc.w * (i + 1) / (n + 1); if (Math.abs(fx - (wx + 0.5)) < 1.8) continue;
        foes.push({ x: fx, y: UP, r: Math.max(1, Math.min(2.5, pc.w / (2 * (n + 1)) - 0.6)), elite: z >= 2 && rnd() < 0.4 }); }
      if (pc.holeL && rnd() < 0.6) saws.push({ x: pc.x + 0.7, y: UP + 0.45, rx: 0 });             // saws sit on the slab EDGE next to a hole
      if (pc.holeR && rnd() < 0.6) saws.push({ x: pc.x + pc.w - 0.7, y: UP + 0.45, rx: 0 });
    }
  }

  // ---------- population ----------
  for (const t of tops) {
    if (t.x < INTRO + 4) continue;                              // intro + first run: nothing hostile
    if (t.x > arenaX - 14 && t.x < arenaX + 2) continue;
    if (cps.some(c => t.x <= c + 6 && t.x + t.w >= c - 6)) continue;     // never on a checkpoint
    const w = t.w, z = t.zone; if (z === 4) continue;
    if (!t.floating && w >= 7 && (z >= 1 || t.x > 70)) { const n = w >= 11 ? 2 : 1; for (let i = 0; i < n; i++) if (!blockedAt(t.x + w * (i + 1) / (n + 1))) foes.push({ x: t.x + w * (i + 1) / (n + 1), y: t.y, r: Math.max(1, Math.min(3, w / (2 * (n + 1)) - 0.6)), elite: z >= 2 && rnd() < 0.4 }); }
    else if (t.floating && w >= 4 && z >= 1 && rnd() < 0.75) { const n = w >= 7 ? 2 : 1; for (let i = 0; i < n; i++) foes.push({ x: t.x + w * (i + 1) / (n + 1), y: t.y, r: Math.max(0.8, Math.min(2, w / (2 * (n + 1)) - 0.4)), elite: z >= 3 && rnd() < 0.5 }); }
    // saws sit on platform EDGES (half sunk into the top), mostly on floating platforms; a few patrol longer ground runs
    if (t.floating && w >= 3 && t.x > 60 && rnd() < 0.5) saws.push({ x: t.x + (rnd() < 0.5 ? 0.7 : w - 0.7), y: t.y + 0.45, rx: 0 });
    else if (!t.floating && w >= 12 && t.x > 70 && rnd() < 0.5) saws.push({ x: t.x + w / 2 + ri(-2, 2), y: t.y + 0.9, rx: Math.min(2.2, w / 2 - 3) });
  }
  // dragons appear only AFTER the checkpoint that opens their zone: zone 1 green, zone 2 purple, zone 3 orange
  const DRAGON_H = 2;   // hover height above the upper lane's floor (tiles): lower = easier to shoot, higher = harder
  for (let z = 1; z <= 3; z++) { const start = cps[z - 1] + 12, end = z < 3 ? cps[z] - 14 : arenaX - 14, n = z === 3 ? 4 : 3, step = (end - start) / n;
    for (let i = 0; i < n; i++) dragons.push({ x: start + step * (i + 0.5), y: UP + DRAGON_H + ri(0, 2) * 0.5, v: z - 1 }); }   // dragons hover above the upper lane
  return { rects, foes, dragons, saws, checkpoints, bossX, arenaX, len: x, zones: [0, ...cps] };
}

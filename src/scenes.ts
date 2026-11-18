import type { Pose, Shot } from './cinematic';
// All cinematic scenes. Edit the story lines in TEXT; edit the camera moves below (each shot = duration + where the camera ends up).
// Shot fields: dur (s) | to / from {x,y,z,lx,ly} (z = distance, lx/ly = look-at point) | ease | text + who (caption) | slow (world speed, 1 = normal) | shake.
export const TEXT: Record<'intro' | 'boss' | 'win', Record<number, any>> = {
  intro: {
    1: ['The floating lands of Skyrubble are falling apart...', 'One soldier is left to reach the guardian at the end.'],
    2: ['Night falls over the hollow forest...', 'Something ancient is waiting in the dark.'],
  },
  boss: { 1: { who: 'ZEROMUS', line: 'Guardian of the first sky' }, 2: { who: 'SKELETON ELITE', line: 'Keeper of the hollow night' } },
  win: { 1: 'The guardian falls. The way to the night forest is open.', 2: 'The hollow forest is quiet again.' },
};
type P = { x: number; y: number };
type Aim = () => { x: number; y: number };
const follow = (aim: Aim, dx: number, dy: number, z: number) => (): Partial<Pose> => { const a = aim(); return { x: a.x + dx, y: a.y + dy, z, lx: a.x, ly: a.y }; };   // camera that tracks the boss

/** Start of a level: sweep in from far ahead, close-up on the hero, settle on the game camera. */
export const intro = (level: number, p: P): Shot[] => {
  const t: string[] = TEXT.intro[level] ?? [];
  return [
    { dur: 3.8, from: { x: p.x + 34, y: 13, z: 38, lx: p.x + 26, ly: 7 }, to: { x: p.x + 12, y: 8, z: 25, lx: p.x + 8, ly: 5 }, ease: 'out', text: t[0] },
    { dur: 2.8, to: { x: p.x + 1.8, y: p.y + 1.6, z: 9, lx: p.x + 1.8, ly: p.y + 1.2 }, text: t[1] },
    { dur: 1.3, to: { x: p.x + 2.5, y: 5, z: 17 } },
  ];
};
/** Entering the boss arena: fly over to the boss, name card + roar shake, back to the hero. */
export const bossReveal = (level: number, p: P, aim: Aim): Shot[] => {
  const b = TEXT.boss[level] ?? { who: 'BOSS', line: '' };
  return [
    { dur: 2.2, to: follow(aim, -6, 1.5, 24) },
    { dur: 2.8, to: follow(aim, -3, 1, 15), ease: 'out', shake: 0.5, who: b.who, text: b.line },
    { dur: 1.5, to: { x: p.x + 2.5, y: 5, z: 17 } },
  ];
};
/** Boss starts to fall apart: slow-mo push-in, then pull back and show the victory line. */
export const bossDefeat = (level: number, aim: Aim): Shot[] => [
  { dur: 1.5, slow: 0.3, to: follow(aim, 0, 0.5, 12), ease: 'out', shake: 0.5 },
  { dur: 2.4, slow: 1, to: follow(aim, 0, 1.5, 20), text: TEXT.win[level] },
];

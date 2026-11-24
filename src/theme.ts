import * as THREE from 'three';
// Look of each level. Level 2 (night) is switched on with ?level=2 for now. The day numbers are exactly the old level 1 values.
const qs = new URLSearchParams(location.search), ls = (k: string) => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; } };
// which level is active: ?level=N in the address wins (for testing), otherwise the level picked in Settings, and only if it is unlocked
const want = qs.has('level') ? Number(qs.get('level')) : Number(ls('sky_set').level) || 1;
export const LEVEL: 1 | 2 | 3 = (qs.has('level') || (ls('sky_stats').unlocked ?? 1) >= want) && want >= 2 ? (want >= 3 ? 3 : 2) : 1;
export const NIGHT = LEVEL === 2;         // level 2: the glowing night forest
export const SNOW = LEVEL === 3;          // level 3: snow + pink trees (Japan)
export const MONSTERS = LEVEL >= 2;       // levels 2 and 3 share the enemies: warriors + blue fire phantoms
interface Theme {
  sky: number; fogColor: number; fog: [number, number]; lum: boolean; edge: number; edgeI: number; grassTint: THREE.Color; hemi: [number, number, number]; sun: [number, number]; grade: Partial<Record<'saturation' | 'contrast' | 'brightness' | 'bloom' | 'vignette', number>>;
  tint: number; allPink: boolean; stone: number; far: { cols: number[]; ops: number[] }; mist: number[]; rock: number; grass: number; block: number; trunk: number; bush: THREE.Color; bushPink: THREE.Color;
}
const DAY: Theme = {
  sky: 0x8fd8ee, fogColor: 0x8fd8ee, fog: [14, 75], lum: false, edge: 0x000000, edgeI: 0, grassTint: new THREE.Color(0xe8e8e8), hemi: [0x9fd9ff, 0x5a7a3a, 1.1], sun: [0xffe2b0, 2.6], grade: {},
  tint: 0xe8e8e8, allPink: false, stone: 0xd8d8d8, far: { cols: [0x78b2da, 0x92c4e4, 0xaed6ee], ops: [0.5, 0.42, 0.35] }, mist: [205, 236, 248], rock: 0x5f6b7d,
  grass: 0x4f9a2a, block: 0x55555b, trunk: 0x4a3a30, bush: new THREE.Color(0xe8e8e8), bushPink: new THREE.Color(0xe8e8e8),
};
// NIGHT: tweak these to change the whole mood. bush / bushPink are HDR tints (values above 1 make the leaves glow through the bloom).
const NITE: Theme = {
  sky: 0x0b1030, fogColor: 0x0b1030, fog: [10, 62], lum: true, edge: 0x000000, edgeI: 0, grassTint: new THREE.Color(0x4f7a8c), hemi: [0x4a5cb0, 0x1a1840, 0.9], sun: [0x8fa8ff, 1.3],
  grade: { saturation: 0.15, contrast: 0.18, brightness: -0.03, bloom: 0.95, vignette: 0.7 },
  tint: 0x4f7a8c, allPink: false, stone: 0x5b6190, far: { cols: [0x1c2a66, 0x25347a, 0x2e3f8c], ops: [0.75, 0.6, 0.45] }, mist: [28, 36, 90], rock: 0x2a3050,
  grass: 0x2e5a60, block: 0x30344f, trunk: 0x181830, bush: new THREE.Color(0.2, 0.8, 1.8), bushPink: new THREE.Color(1.8, 0.45, 1.3),
};
// SNOW (level 3): pale winter sky, white snowy grass, every tree pink. grassTint is painted by brightness only (see level.ts), so it can turn the green tufts white.
const SNOWY: Theme = {
  sky: 0xc3d1e8, fogColor: 0xd6e0f0, fog: [16, 90], lum: false, edge: 0x000000, edgeI: 0, grassTint: new THREE.Color(0xeaf1ff), hemi: [0xdfeaff, 0xb4bfd8, 1.0], sun: [0xfff0e6, 1.8],
  grade: { saturation: 0.12, contrast: 0.08, brightness: 0.03, bloom: 0.15, vignette: 0.3 },
  tint: 0xf2f2f6, allPink: true, stone: 0xc3cbe0, far: { cols: [0xcdb6d6, 0xdcc9e0, 0xe9dcec], ops: [0.55, 0.45, 0.38] }, mist: [236, 240, 250], rock: 0x8d95ad,
  grass: 0xd8e2f0, block: 0x8790ab, trunk: 0x4a2f3c, bush: new THREE.Color(1.08, 1, 1.04), bushPink: new THREE.Color(1.12, 1, 1.06),
};
export const THEME: Theme = SNOW ? SNOWY : NIGHT ? NITE : DAY;

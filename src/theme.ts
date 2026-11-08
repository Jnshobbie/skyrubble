import * as THREE from 'three';
// Look of each level. Level 2 (night) is switched on with ?level=2 for now. The day numbers are exactly the old level 1 values.
const qs = new URLSearchParams(location.search), ls = (k: string) => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; } };
// which level is active: ?level=N in the address wins (for testing), otherwise the level picked in Settings, and only if it is unlocked
export const NIGHT: boolean = qs.has('level') ? qs.get('level') === '2' : ls('sky_set').level === 2 && (ls('sky_stats').unlocked ?? 1) >= 2;
export const LEVEL = NIGHT ? 2 : 1;
interface Theme {
  sky: number; fogColor: number; fog: [number, number]; lum: boolean; edge: number; edgeI: number; grassTint: THREE.Color; hemi: [number, number, number]; sun: [number, number]; grade: Partial<Record<'saturation' | 'contrast' | 'brightness' | 'bloom' | 'vignette', number>>;
  tint: number; stone: number; far: { cols: number[]; ops: number[] }; mist: number[]; rock: number; grass: number; block: number; trunk: number; bush: THREE.Color; bushPink: THREE.Color;
}
const DAY: Theme = {
  sky: 0x8fd8ee, fogColor: 0x8fd8ee, fog: [14, 75], lum: false, edge: 0x000000, edgeI: 0, grassTint: new THREE.Color(0xe8e8e8), hemi: [0x9fd9ff, 0x5a7a3a, 1.1], sun: [0xffe2b0, 2.6], grade: {},
  tint: 0xe8e8e8, stone: 0xd8d8d8, far: { cols: [0x78b2da, 0x92c4e4, 0xaed6ee], ops: [0.5, 0.42, 0.35] }, mist: [205, 236, 248], rock: 0x5f6b7d,
  grass: 0x4f9a2a, block: 0x55555b, trunk: 0x4a3a30, bush: new THREE.Color(0xe8e8e8), bushPink: new THREE.Color(0xe8e8e8),
};
// NIGHT: tweak these to change the whole mood. bush / bushPink are HDR tints (values above 1 make the leaves glow through the bloom).
const NITE: Theme = {
  sky: 0x0b1030, fogColor: 0x2b3a86, fog: [8, 50], lum: true, edge: 0x2fd6c4, edgeI: 0.6, grassTint: new THREE.Color(0.4, 2.2, 2.0), hemi: [0x4a5cb0, 0x1a1840, 0.9], sun: [0x8fa8ff, 1.3],
  grade: { saturation: 0.15, contrast: 0.18, brightness: -0.03, bloom: 0.95, vignette: 0.7 },
  tint: 0x4f7a8c, stone: 0x5b6190, far: { cols: [0x1c2a66, 0x25347a, 0x2e3f8c], ops: [0.75, 0.6, 0.45] }, mist: [70, 90, 170], rock: 0x2a3050,
  grass: 0x2e5a60, block: 0x30344f, trunk: 0x181830, bush: new THREE.Color(0.2, 0.8, 1.8), bushPink: new THREE.Color(1.8, 0.45, 1.3),
};
export const THEME: Theme = NIGHT ? NITE : DAY;

// Single source of truth for weapon stats. Valorant-inspired, arcade-tuned.
// Units: damage = HP (per pellet for shotguns), fireRate = rounds/min,
// times = seconds, angles = degrees, recoil = radians, range = metres.
// category: sidearm | smg | shotgun | rifle | sniper | mg | melee | special

const R = (pitch, yaw = 0, rec = 0.14) => ({ pitchPerShot: pitch, yawJitter: yaw, recoverPerSec: rec });

export const WEAPONS = {
  // ---------------- sidearms ----------------
  classic: {
    id: 'classic', name: 'Classic', category: 'sidearm', type: 'hitscan', price: 0,
    damage: 26, headshotMult: 3.0, legMult: 0.85, fireRate: 400, automatic: false,
    magSize: 12, reserveAmmo: -1, reloadTime: 1.5, spreadDeg: 0.45, adsSpreadDeg: 0.25,
    recoil: R(0.012, 0.006, 0.12), canADS: false, adsFovMult: 1, range: 70, swapTime: 0.5,
  },
  shorty: {
    id: 'shorty', name: 'Shorty', category: 'sidearm', type: 'hitscan', price: 300,
    damage: 11, headshotMult: 2.0, legMult: 0.85, fireRate: 200, automatic: false, pellets: 8,
    magSize: 2, reserveAmmo: -1, reloadTime: 1.75, spreadDeg: 4.5, adsSpreadDeg: 4.5,
    recoil: R(0.03, 0.02, 0.1), canADS: false, adsFovMult: 1, range: 16, swapTime: 0.5,
  },
  frenzy: {
    id: 'frenzy', name: 'Frenzy', category: 'sidearm', type: 'hitscan', price: 450,
    damage: 26, headshotMult: 2.0, legMult: 0.85, fireRate: 1000, automatic: true,
    magSize: 13, reserveAmmo: -1, reloadTime: 1.5, spreadDeg: 1.3, adsSpreadDeg: 1.0,
    recoil: R(0.012, 0.012, 0.18), canADS: false, adsFovMult: 1, range: 45, swapTime: 0.55,
  },
  ghost: {
    id: 'ghost', name: 'Ghost', category: 'sidearm', type: 'hitscan', price: 500,
    damage: 30, headshotMult: 3.0, legMult: 0.85, fireRate: 670, automatic: false,
    magSize: 15, reserveAmmo: -1, reloadTime: 1.5, spreadDeg: 0.4, adsSpreadDeg: 0.2,
    recoil: R(0.013, 0.006, 0.13), canADS: true, adsFovMult: 0.9, range: 80, swapTime: 0.6,
  },
  sheriff: {
    id: 'sheriff', name: 'Sheriff', category: 'sidearm', type: 'hitscan', price: 800,
    damage: 55, headshotMult: 4.0, legMult: 0.85, fireRate: 240, automatic: false,
    magSize: 6, reserveAmmo: -1, reloadTime: 2.25, spreadDeg: 0.5, adsSpreadDeg: 0.3,
    recoil: R(0.03, 0.01, 0.09), canADS: false, adsFovMult: 1, range: 90, swapTime: 0.7,
  },

  // ---------------- smgs ----------------
  stinger: {
    id: 'stinger', name: 'Stinger', category: 'smg', type: 'hitscan', price: 1100,
    damage: 27, headshotMult: 2.1, legMult: 0.85, fireRate: 900, automatic: true,
    magSize: 20, reserveAmmo: -1, reloadTime: 2.25, spreadDeg: 1.4, adsSpreadDeg: 0.7,
    recoil: R(0.011, 0.012, 0.18), canADS: true, adsFovMult: 0.85, range: 55, swapTime: 0.65,
  },
  spectre: {
    id: 'spectre', name: 'Spectre', category: 'smg', type: 'hitscan', price: 1600,
    damage: 26, headshotMult: 2.0, legMult: 0.85, fireRate: 750, automatic: true,
    magSize: 30, reserveAmmo: -1, reloadTime: 2.5, spreadDeg: 1.0, adsSpreadDeg: 0.5,
    recoil: R(0.012, 0.01, 0.17), canADS: true, adsFovMult: 0.85, range: 65, swapTime: 0.7,
  },

  // ---------------- shotguns ----------------
  bucky: {
    id: 'bucky', name: 'Bucky', category: 'shotgun', type: 'hitscan', price: 850, pellets: 12,
    damage: 7, headshotMult: 2.0, legMult: 0.9, fireRate: 110, automatic: false,
    magSize: 5, reserveAmmo: -1, reloadTime: 2.5, spreadDeg: 5, adsSpreadDeg: 3,
    recoil: R(0.04, 0.02, 0.08), canADS: true, adsFovMult: 0.95, range: 18, swapTime: 0.75,
  },
  judge: {
    id: 'judge', name: 'Judge', category: 'shotgun', type: 'hitscan', price: 1850, pellets: 12,
    damage: 5, headshotMult: 2.0, legMult: 0.9, fireRate: 220, automatic: true,
    magSize: 7, reserveAmmo: -1, reloadTime: 2.2, spreadDeg: 4.5, adsSpreadDeg: 3,
    recoil: R(0.03, 0.02, 0.12), canADS: true, adsFovMult: 0.95, range: 16, swapTime: 0.8,
  },

  // ---------------- rifles ----------------
  bulldog: {
    id: 'bulldog', name: 'Bulldog', category: 'rifle', type: 'hitscan', price: 2050,
    damage: 35, headshotMult: 3.0, legMult: 0.85, fireRate: 600, automatic: true,
    magSize: 24, reserveAmmo: -1, reloadTime: 2.5, spreadDeg: 0.4, adsSpreadDeg: 0.1,
    recoil: R(0.014, 0.01, 0.16), canADS: true, adsFovMult: 0.8, range: 100, swapTime: 0.75,
  },
  guardian: {
    id: 'guardian', name: 'Guardian', category: 'rifle', type: 'hitscan', price: 2250,
    damage: 65, headshotMult: 3.0, legMult: 0.85, fireRate: 195, automatic: false,
    magSize: 12, reserveAmmo: -1, reloadTime: 2.5, spreadDeg: 0.3, adsSpreadDeg: 0.0,
    recoil: R(0.022, 0.008, 0.1), canADS: true, adsFovMult: 0.8, range: 120, swapTime: 0.75,
  },
  phantom: {
    id: 'phantom', name: 'Phantom', category: 'rifle', type: 'hitscan', price: 2900,
    damage: 39, headshotMult: 3.0, legMult: 0.85, fireRate: 660, automatic: true,
    magSize: 30, reserveAmmo: -1, reloadTime: 2.5, spreadDeg: 0.3, adsSpreadDeg: 0.0,
    recoil: R(0.015, 0.009, 0.16), canADS: true, adsFovMult: 0.8, range: 95, swapTime: 0.75,
  },
  vandal: {
    id: 'vandal', name: 'Vandal', category: 'rifle', type: 'hitscan', price: 2900,
    damage: 40, headshotMult: 3.0, legMult: 0.85, fireRate: 600, automatic: true,
    magSize: 25, reserveAmmo: -1, reloadTime: 2.5, spreadDeg: 0.3, adsSpreadDeg: 0.0,
    recoil: R(0.016, 0.01, 0.16), canADS: true, adsFovMult: 0.8, range: 120, swapTime: 0.75,
  },

  // ---------------- snipers ----------------
  marshal: {
    id: 'marshal', name: 'Marshal', category: 'sniper', type: 'hitscan', price: 950,
    damage: 101, headshotMult: 2.25, legMult: 0.85, fireRate: 150, automatic: false,
    magSize: 5, reserveAmmo: -1, reloadTime: 2.5, spreadDeg: 2.0, adsSpreadDeg: 0.0,
    recoil: R(0.04, 0, 0.08), canADS: true, adsFovMult: 0.5, scoped: true, range: 160, swapTime: 0.85,
  },
  outlaw: {
    id: 'outlaw', name: 'Outlaw', category: 'sniper', type: 'hitscan', price: 2400,
    damage: 140, headshotMult: 1.6, legMult: 0.85, fireRate: 80, automatic: false,
    magSize: 2, reserveAmmo: -1, reloadTime: 2.6, spreadDeg: 2.0, adsSpreadDeg: 0.0,
    recoil: R(0.05, 0, 0.07), canADS: true, adsFovMult: 0.45, scoped: true, range: 180, swapTime: 0.9,
  },
  operator: {
    id: 'operator', name: 'Operator', category: 'sniper', type: 'hitscan', price: 4700,
    damage: 150, headshotMult: 1.0, legMult: 0.8, fireRate: 40, automatic: false,
    magSize: 5, reserveAmmo: -1, reloadTime: 3.7, spreadDeg: 2.5, adsSpreadDeg: 0.0,
    recoil: R(0.05, 0, 0.06), canADS: true, adsFovMult: 0.35, scoped: true, range: 200, swapTime: 1.0,
  },

  // ---------------- machine guns ----------------
  ares: {
    id: 'ares', name: 'Ares', category: 'mg', type: 'hitscan', price: 1600,
    damage: 30, headshotMult: 2.0, legMult: 0.85, fireRate: 800, automatic: true,
    magSize: 50, reserveAmmo: -1, reloadTime: 3.25, spreadDeg: 1.0, adsSpreadDeg: 0.4,
    recoil: R(0.012, 0.012, 0.2), canADS: true, adsFovMult: 0.85, range: 100, swapTime: 0.9,
  },
  odin: {
    id: 'odin', name: 'Odin', category: 'mg', type: 'hitscan', price: 3200,
    damage: 38, headshotMult: 2.0, legMult: 0.85, fireRate: 850, automatic: true,
    magSize: 100, reserveAmmo: -1, reloadTime: 5, spreadDeg: 1.2, adsSpreadDeg: 0.5,
    recoil: R(0.014, 0.013, 0.22), canADS: true, adsFovMult: 0.85, range: 120, swapTime: 1.0,
  },

  // ---------------- melee / special ----------------
  knife: {
    id: 'knife', name: 'Knife', category: 'melee', type: 'melee', price: 0,
    damage: 50, headshotMult: 1.0, legMult: 1.0, fireRate: 120, automatic: false,
    magSize: Infinity, reserveAmmo: -1, reloadTime: 0, spreadDeg: 0, adsSpreadDeg: 0,
    recoil: R(0, 0, 0.2), canADS: false, adsFovMult: 1, range: 0, meleeRange: 2.5, swapTime: 0.4,
  },
  blades: {
    id: 'blades', name: 'Blade Storm', category: 'special', type: 'hitscan', price: 0,
    damage: 75, headshotMult: 2.0, legMult: 1.0, fireRate: 200, automatic: false,
    magSize: 5, reserveAmmo: 0, reloadTime: 0, spreadDeg: 0, adsSpreadDeg: 0,
    recoil: R(0, 0, 0.2), canADS: false, adsFovMult: 1, range: 90, swapTime: 0.3,
  },
};

// buy-menu layout (matches the reference shop columns)
export const CATEGORIES = [
  { key: 'sidearm', label: 'Sidearms', ids: ['classic', 'shorty', 'frenzy', 'ghost', 'sheriff'] },
  { key: 'smg', label: 'SMGs', ids: ['stinger', 'spectre'] },
  { key: 'shotgun', label: 'Shotguns', ids: ['bucky', 'judge'] },
  { key: 'rifle', label: 'Rifles', ids: ['bulldog', 'guardian', 'phantom', 'vandal'] },
  { key: 'sniper', label: 'Sniper Rifles', ids: ['marshal', 'outlaw', 'operator'] },
  { key: 'mg', label: 'Machine Guns', ids: ['ares', 'odin'] },
];

// which categories occupy the Primary slot (key 1) vs the Sidearm slot (key 2)
export const PRIMARY_CATEGORIES = ['smg', 'shotgun', 'rifle', 'sniper', 'mg'];
export const DEFAULT_PRIMARY = 'vandal';
export const DEFAULT_SIDEARM = 'classic';

// maps a weapon to the viewmodel/icon family it uses
export function modelKeyFor(id) {
  const c = WEAPONS[id]?.category;
  if (c === 'sidearm') return 'pistol';
  if (c === 'melee' || c === 'special') return 'knife';
  return c; // smg | shotgun | rifle | sniper | mg
}

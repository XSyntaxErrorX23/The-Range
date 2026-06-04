import * as THREE from 'three';
import { modelKeyFor } from './weapons.config.js';

/**
 * Single source of truth for weapon geometry. Builds a distinct primitive gun
 * per weapon id (barrel pointing -Z, grip down -Y, in local space). Used by the
 * first-person ViewModel AND by enemy agents' held weapons, so a gun looks the
 * same in your hands and in theirs. Materials are shared module-level singletons.
 */

const MAT = {
  body: new THREE.MeshStandardMaterial({ color: 0x26292f, roughness: 0.5, metalness: 0.6 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x131519, roughness: 0.55, metalness: 0.5 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x6a7075, roughness: 0.3, metalness: 0.9 }),
  accent: new THREE.MeshStandardMaterial({ color: 0x46e0d6, roughness: 0.35, metalness: 0.4, emissive: 0x123c39, emissiveIntensity: 0.7 }),
  blade: new THREE.MeshStandardMaterial({ color: 0xd2d9dd, roughness: 0.18, metalness: 0.95 }),
  grip: new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.8, metalness: 0.2 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.75, metalness: 0.15 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xc8a13a, roughness: 0.35, metalness: 0.9 }),
  glow: new THREE.MeshStandardMaterial({ color: 0x46e0d6, roughness: 0.3, metalness: 0.3, emissive: 0x2fd6c8, emissiveIntensity: 1.4 }),
};

function box(w, h, d, x, y, z, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function cyl(rt, rb, len, x, y, z, mat, seg = 14) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, len, seg), mat);
  m.rotation.x = Math.PI / 2; // axis along Z (forward/back)
  m.position.set(x, y, z);
  return m;
}

function scope(g, { x = 0, y = 0.12, z = -0.06, r = 0.034, len = 0.28 } = {}) {
  g.add(cyl(r, r, len, x, y, z, MAT.dark, 16));
  g.add(cyl(r * 1.25, r * 1.25, 0.04, x, y, z - len / 2, MAT.accent, 16)); // front lens
  g.add(cyl(r * 1.25, r * 1.25, 0.04, x, y, z + len / 2, MAT.dark, 16)); // rear bell
  g.add(cyl(0.01, 0.01, 0.05, x, y + r + 0.02, z, MAT.steel, 8)); // turret
}

function pistolGrip(g, { y = -0.13, z = 0.06, mat } = {}) {
  g.add(box(0.06, 0.17, 0.09, 0, y, z, mat || MAT.grip));
}

function stock(g, { z = 0.24, h = 0.1, d = 0.24, mat } = {}) {
  g.add(box(0.07, h, d, 0, 0.0, z, mat || MAT.dark));
}

/** Build the unique gun model for a weapon id (family silhouette fallback). */
export function buildWeaponModel(id) {
  const g = new THREE.Group();
  const { body, dark, steel, accent, grip, blade, wood, gold, glow } = MAT;

  switch (id) {
    // ----------------------------- sidearms -----------------------------
    case 'classic':
      g.add(box(0.07, 0.105, 0.27, 0, 0, -0.02, body));
      g.add(cyl(0.017, 0.017, 0.1, 0, 0, -0.2, steel, 10));
      pistolGrip(g, { y: -0.12, z: 0.05 });
      g.add(box(0.012, 0.028, 0.028, 0, 0.066, -0.11, accent));
      break;
    case 'shorty':
      g.add(box(0.085, 0.1, 0.2, 0, 0, 0.0, body));
      g.add(cyl(0.024, 0.024, 0.24, -0.024, 0.012, -0.2, steel, 12));
      g.add(cyl(0.024, 0.024, 0.24, 0.024, 0.012, -0.2, steel, 12));
      g.add(cyl(0.024, 0.024, 0.24, -0.024, -0.024, -0.2, steel, 12));
      g.add(cyl(0.024, 0.024, 0.24, 0.024, -0.024, -0.2, steel, 12));
      pistolGrip(g, { y: -0.11, z: 0.06, mat: wood });
      break;
    case 'frenzy':
      g.add(box(0.072, 0.12, 0.33, 0, 0, -0.04, body));
      g.add(cyl(0.018, 0.018, 0.1, 0, 0.01, -0.23, steel, 10));
      g.add(box(0.05, 0.2, 0.07, 0, -0.16, 0.03, dark));
      pistolGrip(g, { y: -0.12, z: 0.04 });
      g.add(box(0.014, 0.04, 0.12, 0, 0.075, -0.06, accent));
      break;
    case 'ghost':
      g.add(box(0.066, 0.1, 0.3, 0, 0, -0.02, body));
      g.add(cyl(0.028, 0.028, 0.24, 0, 0.005, -0.28, dark, 14));
      pistolGrip(g, { y: -0.12, z: 0.05 });
      g.add(box(0.012, 0.026, 0.024, 0, 0.064, -0.13, accent));
      g.add(box(0.012, 0.026, 0.024, 0, 0.064, 0.04, accent));
      break;
    case 'sheriff':
      g.add(box(0.058, 0.11, 0.26, 0, 0.0, -0.06, body));
      g.add(cyl(0.016, 0.016, 0.3, 0, 0.02, -0.26, steel, 12));
      g.add(cyl(0.05, 0.05, 0.08, 0, -0.005, -0.02, gold, 12));
      g.add(box(0.05, 0.16, 0.1, 0, -0.12, 0.06, wood));
      g.add(box(0.012, 0.02, 0.02, 0, 0.07, -0.18, gold));
      break;

    // ------------------------------- smgs -------------------------------
    case 'stinger':
      g.add(box(0.076, 0.11, 0.34, 0, 0, -0.04, body));
      g.add(cyl(0.02, 0.02, 0.14, 0, 0.01, -0.26, steel, 12));
      g.add(box(0.05, 0.16, 0.07, 0, -0.13, 0.0, dark));
      pistolGrip(g, { y: -0.1, z: 0.13 });
      g.add(box(0.04, 0.05, 0.16, 0, 0.04, 0.18, dark));
      g.add(box(0.016, 0.045, 0.14, 0, 0.082, -0.04, accent));
      break;
    case 'spectre':
      g.add(box(0.08, 0.12, 0.4, 0, 0, -0.06, body));
      g.add(cyl(0.03, 0.03, 0.22, 0, 0.01, -0.36, dark, 14));
      { const mag = box(0.05, 0.22, 0.08, 0, -0.16, 0.02, dark); mag.rotation.x = 0.25; g.add(mag); }
      pistolGrip(g, { y: -0.09, z: 0.15 });
      g.add(box(0.05, 0.07, 0.18, 0, 0.03, 0.2, dark));
      g.add(box(0.02, 0.05, 0.16, 0, 0.09, -0.05, accent));
      break;

    // ----------------------------- shotguns -----------------------------
    case 'bucky':
      g.add(box(0.09, 0.12, 0.5, 0, 0, -0.06, body));
      g.add(cyl(0.035, 0.035, 0.44, 0, 0.025, -0.42, steel, 14));
      g.add(cyl(0.05, 0.05, 0.2, 0, -0.045, -0.3, wood, 14));
      g.add(box(0.06, 0.12, 0.1, 0, -0.1, 0.14, wood));
      g.add(box(0.07, 0.13, 0.24, 0, 0.0, 0.26, wood));
      break;
    case 'judge':
      g.add(box(0.09, 0.12, 0.46, 0, 0, -0.06, body));
      g.add(cyl(0.034, 0.034, 0.38, 0, 0.025, -0.4, steel, 14));
      g.add(cyl(0.11, 0.11, 0.09, 0, -0.12, 0.0, dark, 18));
      g.add(cyl(0.05, 0.05, 0.1, 0, -0.12, 0.0, steel, 18));
      pistolGrip(g, { y: -0.1, z: 0.16 });
      g.add(box(0.06, 0.09, 0.18, 0, 0.01, 0.22, dark));
      break;

    // ------------------------------ rifles ------------------------------
    case 'bulldog':
      g.add(box(0.076, 0.11, 0.46, 0, 0, -0.1, body));
      g.add(cyl(0.02, 0.02, 0.3, 0, 0.012, -0.42, steel, 12));
      g.add(cyl(0.032, 0.032, 0.18, 0, 0.0, -0.3, dark, 12));
      g.add(box(0.05, 0.16, 0.085, 0, -0.13, 0.02, dark));
      pistolGrip(g, { y: -0.09, z: 0.16 });
      stock(g, { z: 0.2, h: 0.08, d: 0.18 });
      g.add(box(0.016, 0.045, 0.18, 0, 0.082, -0.06, accent));
      break;
    case 'guardian':
      g.add(box(0.07, 0.1, 0.5, 0, 0, -0.12, body));
      g.add(cyl(0.016, 0.016, 0.44, 0, 0.012, -0.52, steel, 12));
      scope(g, { y: 0.1, z: -0.06, r: 0.028, len: 0.18 });
      g.add(box(0.045, 0.15, 0.08, 0, -0.12, 0.04, dark));
      pistolGrip(g, { y: -0.08, z: 0.16 });
      stock(g, { z: 0.24, h: 0.09, d: 0.22, mat: wood });
      break;
    case 'phantom':
      g.add(box(0.08, 0.11, 0.52, 0, 0, -0.12, body));
      g.add(cyl(0.03, 0.03, 0.36, 0, 0.012, -0.5, dark, 14));
      g.add(box(0.05, 0.18, 0.085, 0, -0.14, 0.02, dark));
      pistolGrip(g, { y: -0.09, z: 0.16 });
      stock(g, { z: 0.22 });
      g.add(box(0.018, 0.05, 0.2, 0, 0.085, -0.08, accent));
      break;
    case 'vandal':
      g.add(box(0.08, 0.12, 0.55, 0, 0, -0.12, body));
      g.add(cyl(0.022, 0.022, 0.4, 0, 0.012, -0.5, steel, 12));
      g.add(cyl(0.035, 0.035, 0.22, 0, 0.0, -0.34, dark, 12));
      g.add(cyl(0.032, 0.026, 0.07, 0, 0.012, -0.73, dark, 12));
      g.add(box(0.05, 0.18, 0.09, 0, -0.14, 0.02, dark));
      pistolGrip(g, { y: -0.09, z: 0.16 });
      stock(g, { z: 0.22 });
      g.add(box(0.018, 0.05, 0.2, 0, 0.085, -0.08, accent));
      break;

    // ------------------------------ snipers -----------------------------
    case 'marshal':
      g.add(box(0.07, 0.1, 0.5, 0, 0, -0.14, body));
      g.add(cyl(0.018, 0.018, 0.46, 0, 0.012, -0.54, steel, 12));
      scope(g, { y: 0.11, z: -0.1, r: 0.032, len: 0.24 });
      g.add(box(0.06, 0.13, 0.3, 0, -0.02, 0.22, wood));
      pistolGrip(g, { y: -0.08, z: 0.12 });
      g.add(box(0.03, 0.07, 0.04, 0, -0.1, 0.02, steel));
      break;
    case 'outlaw':
      g.add(box(0.08, 0.11, 0.5, 0, 0, -0.12, body));
      g.add(cyl(0.022, 0.022, 0.52, -0.026, 0.01, -0.5, steel, 12));
      g.add(cyl(0.022, 0.022, 0.52, 0.026, 0.01, -0.5, steel, 12));
      scope(g, { y: 0.12, z: -0.08, r: 0.034, len: 0.26 });
      g.add(box(0.05, 0.11, 0.09, 0, -0.08, 0.18, grip));
      stock(g, { z: 0.3, h: 0.12, d: 0.28, mat: wood });
      break;
    case 'operator':
      g.add(box(0.085, 0.13, 0.72, 0, 0, -0.18, body));
      g.add(cyl(0.026, 0.026, 0.6, 0, 0.012, -0.8, steel, 14));
      g.add(cyl(0.038, 0.032, 0.08, 0, 0.012, -1.06, dark, 14));
      scope(g, { y: 0.14, z: -0.08, r: 0.05, len: 0.36 });
      g.add(box(0.05, 0.16, 0.08, 0, -0.13, 0.1, dark));
      g.add(box(0.05, 0.11, 0.09, 0, -0.08, 0.22, grip));
      stock(g, { z: 0.34, h: 0.1, d: 0.26 });
      break;

    // --------------------------- machine guns ---------------------------
    case 'ares':
      g.add(box(0.1, 0.14, 0.6, 0, 0, -0.12, body));
      g.add(cyl(0.026, 0.026, 0.5, 0, 0.02, -0.6, steel, 14));
      g.add(cyl(0.045, 0.045, 0.3, 0, 0.02, -0.46, dark, 16));
      g.add(box(0.07, 0.18, 0.16, 0, -0.16, 0.0, dark));
      pistolGrip(g, { y: -0.1, z: 0.18 });
      stock(g, { z: 0.3, h: 0.1, d: 0.24 });
      g.add(cyl(0.012, 0.012, 0.3, -0.06, -0.16, -0.5, steel, 8));
      g.add(cyl(0.012, 0.012, 0.3, 0.06, -0.16, -0.5, steel, 8));
      g.add(box(0.02, 0.05, 0.2, 0, 0.105, -0.1, accent));
      break;
    case 'odin':
      g.add(box(0.12, 0.16, 0.74, 0, 0, -0.14, body));
      g.add(cyl(0.05, 0.05, 0.44, 0, 0.02, -0.62, steel, 18));
      g.add(cyl(0.028, 0.028, 0.56, 0, 0.02, -0.68, dark, 12));
      g.add(box(0.19, 0.24, 0.22, 0, -0.18, -0.02, dark));
      pistolGrip(g, { y: -0.1, z: 0.2 });
      stock(g, { z: 0.32, h: 0.11, d: 0.26 });
      g.add(cyl(0.013, 0.013, 0.32, -0.07, -0.17, -0.52, steel, 8));
      g.add(cyl(0.013, 0.013, 0.32, 0.07, -0.17, -0.52, steel, 8));
      g.add(box(0.02, 0.06, 0.22, 0, 0.12, -0.1, gold));
      break;

    // --------------------------- melee / special ------------------------
    case 'knife':
      g.add(box(0.02, 0.05, 0.34, 0, 0.06, -0.12, blade));
      g.add(box(0.025, 0.025, 0.08, 0, 0.06, -0.32, blade));
      g.add(box(0.09, 0.04, 0.03, 0, 0.06, 0.04, steel));
      g.add(cyl(0.022, 0.022, 0.16, 0, 0.04, 0.12, grip, 10));
      g.add(box(0.03, 0.03, 0.03, 0, 0.04, 0.2, accent));
      break;
    case 'blades':
      g.add(box(0.022, 0.07, 0.42, 0, 0.06, -0.16, glow));
      g.add(box(0.03, 0.03, 0.1, 0, 0.06, -0.4, glow));
      g.add(box(0.12, 0.045, 0.03, 0, 0.06, 0.04, steel));
      g.add(cyl(0.024, 0.024, 0.16, 0, 0.045, 0.12, grip, 10));
      g.add(cyl(0.03, 0.03, 0.03, 0, 0.045, 0.21, glow, 10));
      break;

    default:
      return buildFamily(modelKeyFor(id));
  }
  return g;
}

/** Generic per-family silhouette, used as a fallback for unknown ids. */
export function buildFamily(key) {
  const g = new THREE.Group();
  const { body, dark, steel, accent, blade } = MAT;
  if (key === 'pistol') {
    g.add(box(0.07, 0.11, 0.3, 0, 0, -0.02, body));
    g.add(cyl(0.02, 0.02, 0.12, 0, 0, -0.2, steel, 10));
    pistolGrip(g);
  } else if (key === 'knife') {
    g.add(box(0.02, 0.05, 0.34, 0, 0.06, -0.12, blade));
    g.add(cyl(0.022, 0.022, 0.16, 0, 0.04, 0.12, MAT.grip, 10));
  } else {
    g.add(box(0.08, 0.12, 0.5, 0, 0, -0.1, body));
    g.add(cyl(0.022, 0.022, 0.36, 0, 0.01, -0.46, steel, 12));
    g.add(box(0.05, 0.16, 0.085, 0, -0.13, 0.02, dark));
    pistolGrip(g, { y: -0.09, z: 0.16 });
    stock(g, { z: 0.22 });
    g.add(box(0.018, 0.05, 0.2, 0, 0.085, -0.08, accent));
  }
  return g;
}

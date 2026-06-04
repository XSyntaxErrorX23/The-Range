import * as THREE from 'three';
import { damp, clamp } from '../util/math.js';
import { modelKeyFor, WEAPONS } from './weapons.config.js';

/**
 * First-person weapon viewmodel: a unique higher-poly primitive gun per weapon
 * id (23 distinct silhouettes), parented to the camera. Adds hipfire/ADS poses,
 * walk bob, look sway, recoil kickback, reload dip and a melee swing. Hidden in
 * third-person / while scoped. Unknown ids fall back to their family silhouette.
 */
export class ViewModel {
  constructor(camera) {
    this.root = new THREE.Group();
    camera.add(this.root);

    this._mat = {
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

    // One model per weapon id; fall back to the family silhouette if missing.
    this.models = {};
    for (const id of Object.keys(WEAPONS)) {
      const m = this._buildById(id);
      m.visible = false;
      this.root.add(m);
      this.models[id] = m;
    }
    this.currentKey = null;

    this.hipPos = new THREE.Vector3(0.3, -0.3, -0.7);
    this.adsPos = new THREE.Vector3(0.0, -0.16, -0.45);
    this.basePos = this.hipPos.clone();

    this.isADS = false;
    this.hidden = false;
    this.scopedHidden = false;

    this.kick = 0;
    this.reloadT = 0; this.reloadDur = 0;
    this.swingT = 0;
    this.bobPhase = 0;
    this.swayX = 0; this.swayY = 0;
  }

  _box(w, h, d, x, y, z, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    return m;
  }

  _cyl(rt, rb, len, x, y, z, mat, seg = 14) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, len, seg), mat);
    m.rotation.x = Math.PI / 2; // axis along Z (forward/back)
    m.position.set(x, y, z);
    return m;
  }

  // ---- shared sub-assemblies, reused across weapon builders ----
  _scope(g, { x = 0, y = 0.12, z = -0.06, r = 0.034, len = 0.28 } = {}) {
    const { dark, accent, steel } = this._mat;
    g.add(this._cyl(r, r, len, x, y, z, dark, 16));
    g.add(this._cyl(r * 1.25, r * 1.25, 0.04, x, y, z - len / 2, accent, 16)); // front lens
    g.add(this._cyl(r * 1.25, r * 1.25, 0.04, x, y, z + len / 2, dark, 16)); // rear bell
    g.add(this._cyl(0.01, 0.01, 0.05, x, y + r + 0.02, z, steel, 8)); // turret
  }

  _pistolGrip(g, { y = -0.13, z = 0.06, mat } = {}) {
    g.add(this._box(0.06, 0.17, 0.09, 0, y, z, mat || this._mat.grip));
  }

  _stock(g, { z = 0.24, h = 0.1, d = 0.24, mat } = {}) {
    g.add(this._box(0.07, h, d, 0, 0.0, z, mat || this._mat.dark));
  }

  _buildById(id) {
    const g = new THREE.Group();
    const M = this._mat;
    const { body, dark, steel, accent, grip, blade, wood, gold, glow } = M;

    switch (id) {
      // ----------------------------- sidearms -----------------------------
      case 'classic': // compact service pistol
        g.add(this._box(0.07, 0.105, 0.27, 0, 0, -0.02, body));
        g.add(this._cyl(0.017, 0.017, 0.1, 0, 0, -0.2, steel, 10));
        this._pistolGrip(g, { y: -0.12, z: 0.05 });
        g.add(this._box(0.012, 0.028, 0.028, 0, 0.066, -0.11, accent));
        break;
      case 'shorty': // sawed-off double-barrel pocket shotgun
        g.add(this._box(0.085, 0.1, 0.2, 0, 0, 0.0, body));
        g.add(this._cyl(0.024, 0.024, 0.24, -0.024, 0.012, -0.2, steel, 12));
        g.add(this._cyl(0.024, 0.024, 0.24, 0.024, 0.012, -0.2, steel, 12));
        g.add(this._cyl(0.024, 0.024, 0.24, -0.024, -0.024, -0.2, steel, 12));
        g.add(this._cyl(0.024, 0.024, 0.24, 0.024, -0.024, -0.2, steel, 12));
        this._pistolGrip(g, { y: -0.11, z: 0.06, mat: wood });
        break;
      case 'frenzy': // boxy automatic machine pistol, extended mag
        g.add(this._box(0.072, 0.12, 0.33, 0, 0, -0.04, body));
        g.add(this._cyl(0.018, 0.018, 0.1, 0, 0.01, -0.23, steel, 10));
        g.add(this._box(0.05, 0.2, 0.07, 0, -0.16, 0.03, dark)); // long mag
        this._pistolGrip(g, { y: -0.12, z: 0.04 });
        g.add(this._box(0.014, 0.04, 0.12, 0, 0.075, -0.06, accent)); // top rail
        break;
      case 'ghost': // sleek suppressed pistol
        g.add(this._box(0.066, 0.1, 0.3, 0, 0, -0.02, body));
        g.add(this._cyl(0.028, 0.028, 0.24, 0, 0.005, -0.28, dark, 14)); // suppressor
        this._pistolGrip(g, { y: -0.12, z: 0.05 });
        g.add(this._box(0.012, 0.026, 0.024, 0, 0.064, -0.13, accent));
        g.add(this._box(0.012, 0.026, 0.024, 0, 0.064, 0.04, accent));
        break;
      case 'sheriff': // long-barrel revolver, gold accents
        g.add(this._box(0.058, 0.11, 0.26, 0, 0.0, -0.06, body));
        g.add(this._cyl(0.016, 0.016, 0.3, 0, 0.02, -0.26, steel, 12)); // long barrel
        g.add(this._cyl(0.05, 0.05, 0.08, 0, -0.005, -0.02, gold, 12)); // cylinder
        g.add(this._box(0.05, 0.16, 0.1, 0, -0.12, 0.06, wood)); // grip
        g.add(this._box(0.012, 0.02, 0.02, 0, 0.07, -0.18, gold)); // front sight
        break;

      // ------------------------------- smgs -------------------------------
      case 'stinger': // stubby SMG, folding stock
        g.add(this._box(0.076, 0.11, 0.34, 0, 0, -0.04, body));
        g.add(this._cyl(0.02, 0.02, 0.14, 0, 0.01, -0.26, steel, 12));
        g.add(this._box(0.05, 0.16, 0.07, 0, -0.13, 0.0, dark)); // mag
        this._pistolGrip(g, { y: -0.1, z: 0.13 });
        g.add(this._box(0.04, 0.05, 0.16, 0, 0.04, 0.18, dark)); // folded stock
        g.add(this._box(0.016, 0.045, 0.14, 0, 0.082, -0.04, accent));
        break;
      case 'spectre': // suppressed SMG, curved mag
        g.add(this._box(0.08, 0.12, 0.4, 0, 0, -0.06, body));
        g.add(this._cyl(0.03, 0.03, 0.22, 0, 0.01, -0.36, dark, 14)); // suppressor
        { const mag = this._box(0.05, 0.22, 0.08, 0, -0.16, 0.02, dark); mag.rotation.x = 0.25; g.add(mag); }
        this._pistolGrip(g, { y: -0.09, z: 0.15 });
        g.add(this._box(0.05, 0.07, 0.18, 0, 0.03, 0.2, dark)); // stock
        g.add(this._box(0.02, 0.05, 0.16, 0, 0.09, -0.05, accent));
        break;

      // ----------------------------- shotguns -----------------------------
      case 'bucky': // wood pump-action shotgun
        g.add(this._box(0.09, 0.12, 0.5, 0, 0, -0.06, body));
        g.add(this._cyl(0.035, 0.035, 0.44, 0, 0.025, -0.42, steel, 14)); // barrel
        g.add(this._cyl(0.05, 0.05, 0.2, 0, -0.045, -0.3, wood, 14)); // pump forend
        g.add(this._box(0.06, 0.12, 0.1, 0, -0.1, 0.14, wood)); // grip
        g.add(this._box(0.07, 0.13, 0.24, 0, 0.0, 0.26, wood)); // stock
        break;
      case 'judge': // auto shotgun, big front drum
        g.add(this._box(0.09, 0.12, 0.46, 0, 0, -0.06, body));
        g.add(this._cyl(0.034, 0.034, 0.38, 0, 0.025, -0.4, steel, 14));
        g.add(this._cyl(0.11, 0.11, 0.09, 0, -0.12, 0.0, dark, 18)); // drum mag
        g.add(this._cyl(0.05, 0.05, 0.1, 0, -0.12, 0.0, steel, 18));
        this._pistolGrip(g, { y: -0.1, z: 0.16 });
        g.add(this._box(0.06, 0.09, 0.18, 0, 0.01, 0.22, dark)); // short stock
        break;

      // ------------------------------ rifles ------------------------------
      case 'bulldog': // compact carbine, short barrel + handguard
        g.add(this._box(0.076, 0.11, 0.46, 0, 0, -0.1, body));
        g.add(this._cyl(0.02, 0.02, 0.3, 0, 0.012, -0.42, steel, 12));
        g.add(this._cyl(0.032, 0.032, 0.18, 0, 0.0, -0.3, dark, 12)); // handguard
        g.add(this._box(0.05, 0.16, 0.085, 0, -0.13, 0.02, dark)); // mag
        this._pistolGrip(g, { y: -0.09, z: 0.16 });
        this._stock(g, { z: 0.2, h: 0.08, d: 0.18 });
        g.add(this._box(0.016, 0.045, 0.18, 0, 0.082, -0.06, accent));
        break;
      case 'guardian': // slim marksman rifle with a small scope
        g.add(this._box(0.07, 0.1, 0.5, 0, 0, -0.12, body));
        g.add(this._cyl(0.016, 0.016, 0.44, 0, 0.012, -0.52, steel, 12)); // long thin barrel
        this._scope(g, { y: 0.1, z: -0.06, r: 0.028, len: 0.18 });
        g.add(this._box(0.045, 0.15, 0.08, 0, -0.12, 0.04, dark)); // mag
        this._pistolGrip(g, { y: -0.08, z: 0.16 });
        this._stock(g, { z: 0.24, h: 0.09, d: 0.22, mat: wood });
        break;
      case 'phantom': // suppressed assault rifle (integrated shroud, no muzzle)
        g.add(this._box(0.08, 0.11, 0.52, 0, 0, -0.12, body));
        g.add(this._cyl(0.03, 0.03, 0.36, 0, 0.012, -0.5, dark, 14)); // integrated suppressor
        g.add(this._box(0.05, 0.18, 0.085, 0, -0.14, 0.02, dark)); // mag
        this._pistolGrip(g, { y: -0.09, z: 0.16 });
        this._stock(g, { z: 0.22 });
        g.add(this._box(0.018, 0.05, 0.2, 0, 0.085, -0.08, accent));
        break;
      case 'vandal': // classic muzzle-braked assault rifle
        g.add(this._box(0.08, 0.12, 0.55, 0, 0, -0.12, body));
        g.add(this._cyl(0.022, 0.022, 0.4, 0, 0.012, -0.5, steel, 12));
        g.add(this._cyl(0.035, 0.035, 0.22, 0, 0.0, -0.34, dark, 12)); // handguard
        g.add(this._cyl(0.032, 0.026, 0.07, 0, 0.012, -0.73, dark, 12)); // muzzle brake
        g.add(this._box(0.05, 0.18, 0.09, 0, -0.14, 0.02, dark)); // mag
        this._pistolGrip(g, { y: -0.09, z: 0.16 });
        this._stock(g, { z: 0.22 });
        g.add(this._box(0.018, 0.05, 0.2, 0, 0.085, -0.08, accent));
        break;

      // ------------------------------ snipers -----------------------------
      case 'marshal': // lever-action scout, wood stock + scope
        g.add(this._box(0.07, 0.1, 0.5, 0, 0, -0.14, body));
        g.add(this._cyl(0.018, 0.018, 0.46, 0, 0.012, -0.54, steel, 12));
        this._scope(g, { y: 0.11, z: -0.1, r: 0.032, len: 0.24 });
        g.add(this._box(0.06, 0.13, 0.3, 0, -0.02, 0.22, wood)); // wood stock
        this._pistolGrip(g, { y: -0.08, z: 0.12 });
        { const lever = this._box(0.03, 0.07, 0.04, 0, -0.1, 0.02, steel); g.add(lever); } // lever loop
        break;
      case 'outlaw': // double-barrel break sniper, scope
        g.add(this._box(0.08, 0.11, 0.5, 0, 0, -0.12, body));
        g.add(this._cyl(0.022, 0.022, 0.52, -0.026, 0.01, -0.5, steel, 12));
        g.add(this._cyl(0.022, 0.022, 0.52, 0.026, 0.01, -0.5, steel, 12));
        this._scope(g, { y: 0.12, z: -0.08, r: 0.034, len: 0.26 });
        g.add(this._box(0.05, 0.11, 0.09, 0, -0.08, 0.18, grip));
        this._stock(g, { z: 0.3, h: 0.12, d: 0.28, mat: wood });
        break;
      case 'operator': // heavy bolt-action, big scope + muzzle brake
        g.add(this._box(0.085, 0.13, 0.72, 0, 0, -0.18, body));
        g.add(this._cyl(0.026, 0.026, 0.6, 0, 0.012, -0.8, steel, 14));
        g.add(this._cyl(0.038, 0.032, 0.08, 0, 0.012, -1.06, dark, 14)); // muzzle brake
        this._scope(g, { y: 0.14, z: -0.08, r: 0.05, len: 0.36 });
        g.add(this._box(0.05, 0.16, 0.08, 0, -0.13, 0.1, dark)); // mag
        g.add(this._box(0.05, 0.11, 0.09, 0, -0.08, 0.22, grip));
        this._stock(g, { z: 0.34, h: 0.1, d: 0.26 });
        break;

      // --------------------------- machine guns ---------------------------
      case 'ares': // LMG, vented barrel shroud + box mag + bipod
        g.add(this._box(0.1, 0.14, 0.6, 0, 0, -0.12, body));
        g.add(this._cyl(0.026, 0.026, 0.5, 0, 0.02, -0.6, steel, 14)); // barrel
        g.add(this._cyl(0.045, 0.045, 0.3, 0, 0.02, -0.46, dark, 16)); // vent shroud
        g.add(this._box(0.07, 0.18, 0.16, 0, -0.16, 0.0, dark)); // box mag
        this._pistolGrip(g, { y: -0.1, z: 0.18 });
        this._stock(g, { z: 0.3, h: 0.1, d: 0.24 });
        g.add(this._cyl(0.012, 0.012, 0.3, -0.06, -0.16, -0.5, steel, 8)); // bipod legs
        g.add(this._cyl(0.012, 0.012, 0.3, 0.06, -0.16, -0.5, steel, 8));
        g.add(this._box(0.02, 0.05, 0.2, 0, 0.105, -0.1, accent));
        break;
      case 'odin': // huge LMG, rotary barrel shroud + drum, gold accents
        g.add(this._box(0.12, 0.16, 0.74, 0, 0, -0.14, body));
        g.add(this._cyl(0.05, 0.05, 0.44, 0, 0.02, -0.62, steel, 18)); // barrel shroud
        g.add(this._cyl(0.028, 0.028, 0.56, 0, 0.02, -0.68, dark, 12)); // protruding barrel
        g.add(this._box(0.19, 0.24, 0.22, 0, -0.18, -0.02, dark)); // huge ammo drum/box
        this._pistolGrip(g, { y: -0.1, z: 0.2 });
        this._stock(g, { z: 0.32, h: 0.11, d: 0.26 });
        g.add(this._cyl(0.013, 0.013, 0.32, -0.07, -0.17, -0.52, steel, 8)); // bipod
        g.add(this._cyl(0.013, 0.013, 0.32, 0.07, -0.17, -0.52, steel, 8));
        g.add(this._box(0.02, 0.06, 0.22, 0, 0.12, -0.1, gold)); // gold rail
        break;

      // --------------------------- melee / special ------------------------
      case 'knife': // tactical combat knife
        g.add(this._box(0.02, 0.05, 0.34, 0, 0.06, -0.12, blade));
        g.add(this._box(0.025, 0.025, 0.08, 0, 0.06, -0.32, blade)); // point
        g.add(this._box(0.09, 0.04, 0.03, 0, 0.06, 0.04, steel)); // crossguard
        g.add(this._cyl(0.022, 0.022, 0.16, 0, 0.04, 0.12, grip, 10)); // handle
        g.add(this._box(0.03, 0.03, 0.03, 0, 0.04, 0.2, accent)); // pommel
        break;
      case 'blades': // Blade Storm — glowing energy dagger
        g.add(this._box(0.022, 0.07, 0.42, 0, 0.06, -0.16, glow));
        g.add(this._box(0.03, 0.03, 0.1, 0, 0.06, -0.4, glow)); // glowing tip
        g.add(this._box(0.12, 0.045, 0.03, 0, 0.06, 0.04, steel)); // crossguard
        g.add(this._cyl(0.024, 0.024, 0.16, 0, 0.045, 0.12, grip, 10)); // handle
        g.add(this._cyl(0.03, 0.03, 0.03, 0, 0.045, 0.21, glow, 10)); // glowing pommel
        break;

      default:
        return this._buildFamily(modelKeyFor(id));
    }
    return g;
  }

  // Generic per-family silhouette, used as a fallback for unknown ids.
  _buildFamily(key) {
    const g = new THREE.Group();
    const { body, dark, steel, accent, grip } = this._mat;
    if (key === 'pistol') {
      g.add(this._box(0.07, 0.11, 0.3, 0, 0, -0.02, body));
      g.add(this._cyl(0.02, 0.02, 0.12, 0, 0, -0.2, steel, 10));
      this._pistolGrip(g);
    } else if (key === 'knife') {
      g.add(this._box(0.02, 0.05, 0.34, 0, 0.06, -0.12, this._mat.blade));
      g.add(this._cyl(0.022, 0.022, 0.16, 0, 0.04, 0.12, grip, 10));
    } else {
      g.add(this._box(0.08, 0.12, 0.5, 0, 0, -0.1, body));
      g.add(this._cyl(0.022, 0.022, 0.36, 0, 0.01, -0.46, steel, 12));
      g.add(this._box(0.05, 0.16, 0.085, 0, -0.13, 0.02, dark));
      this._pistolGrip(g, { y: -0.09, z: 0.16 });
      this._stock(g, { z: 0.22 });
      g.add(this._box(0.018, 0.05, 0.2, 0, 0.085, -0.08, accent));
    }
    return g;
  }

  _applyVisibility() {
    if (this.currentKey && this.models[this.currentKey]) {
      this.models[this.currentKey].visible = !this.hidden && !this.scopedHidden;
    }
  }

  setWeapon(id) {
    const key = this.models[id] ? id : modelKeyFor(id);
    if (this.currentKey && this.models[this.currentKey]) this.models[this.currentKey].visible = false;
    this.currentKey = key;
    this.kick = 0; this.reloadT = 0; this.swingT = 0;
    this._applyVisibility();
  }

  setVisible(visible) { this.hidden = !visible; this._applyVisibility(); }
  setScopedHidden(hidden) { this.scopedHidden = hidden; this._applyVisibility(); }
  setADS(isADS) { this.isADS = isADS; }

  triggerKick(amount = 1) { this.kick = Math.min(1.4, this.kick + amount); }
  triggerReload(dur) { this.reloadT = dur; this.reloadDur = dur; }
  triggerSwing() { this.swingT = 0.25; }

  update(dt, motion = {}) {
    if (!this.currentKey) return;
    const model = this.models[this.currentKey];
    const speed = motion.speed || 0;
    const moving = speed > 0.4;

    const targetPos = this.isADS ? this.adsPos : this.hipPos;
    this.basePos.x = damp(this.basePos.x, targetPos.x, 16, dt);
    this.basePos.y = damp(this.basePos.y, targetPos.y, 16, dt);
    this.basePos.z = damp(this.basePos.z, targetPos.z, 16, dt);

    const bobScale = this.isADS ? 0.25 : 1;
    if (moving) this.bobPhase += dt * (7 + speed);
    const bobActive = moving ? 1 : 0;
    const bobX = Math.cos(this.bobPhase) * 0.014 * bobScale * bobActive;
    const bobY = Math.abs(Math.sin(this.bobPhase)) * 0.018 * bobScale * bobActive;

    const swayK = this.isADS ? 0.0002 : 0.0006;
    this.swayX = damp(this.swayX, clamp(-(motion.lookDX || 0) * swayK, -0.04, 0.04), 10, dt);
    this.swayY = damp(this.swayY, clamp((motion.lookDY || 0) * swayK, -0.04, 0.04), 10, dt);

    this.kick = damp(this.kick, 0, 12, dt);

    let reloadDip = 0, reloadRot = 0;
    if (this.reloadT > 0) {
      this.reloadT = Math.max(0, this.reloadT - dt);
      const phase = this.reloadDur > 0 ? 1 - this.reloadT / this.reloadDur : 1;
      const s = Math.sin(phase * Math.PI);
      reloadDip = -0.2 * s;
      reloadRot = 0.6 * s;
    }

    let swingRot = 0, swingPos = 0;
    if (this.swingT > 0) {
      this.swingT = Math.max(0, this.swingT - dt);
      const s = Math.sin((1 - this.swingT / 0.25) * Math.PI);
      swingRot = -1.2 * s;
      swingPos = -0.14 * s;
    }

    model.position.set(
      this.basePos.x + bobX + this.swayX,
      this.basePos.y + bobY + this.swayY + reloadDip,
      this.basePos.z + this.kick * 0.13 + swingPos
    );
    model.rotation.set(
      -this.kick * 0.2 + reloadRot + swingRot - this.swayY * 1.5,
      -this.swayX * 1.5,
      0
    );
  }
}

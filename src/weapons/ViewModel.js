import * as THREE from 'three';
import { damp, clamp } from '../util/math.js';
import { modelKeyFor } from './weapons.config.js';

const FAMILIES = ['pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'mg', 'knife'];

/**
 * First-person weapon viewmodel: higher-poly primitive guns parented to the
 * camera, one model per weapon family (sidearm->pistol, melee/special->knife).
 * Adds hipfire/ADS poses, walk bob, look sway, recoil kickback, reload dip and
 * a melee swing. Hidden in third-person / while scoped.
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
    };

    this.models = {};
    for (const key of FAMILIES) {
      const m = this._build(key);
      m.visible = false;
      this.root.add(m);
      this.models[key] = m;
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
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z);
    return m;
  }

  _build(key) {
    const g = new THREE.Group();
    const { body, dark, steel, accent, grip, blade } = this._mat;
    if (key === 'pistol') {
      g.add(this._box(0.07, 0.11, 0.3, 0, 0, -0.02, body));
      g.add(this._cyl(0.02, 0.02, 0.12, 0, 0, -0.2, steel, 10));
      g.add(this._box(0.06, 0.17, 0.09, 0, -0.13, 0.06, grip));
      g.add(this._box(0.012, 0.03, 0.03, 0, 0.07, -0.12, accent));
    } else if (key === 'smg') {
      g.add(this._box(0.08, 0.12, 0.4, 0, 0, -0.06, body));
      g.add(this._cyl(0.022, 0.022, 0.22, 0, 0.01, -0.34, steel, 12));
      g.add(this._box(0.05, 0.2, 0.08, 0, -0.15, 0.04, dark));
      g.add(this._box(0.05, 0.11, 0.09, 0, -0.09, 0.15, grip));
      g.add(this._box(0.05, 0.07, 0.18, 0, 0.03, 0.2, dark));
      g.add(this._box(0.02, 0.05, 0.16, 0, 0.09, -0.05, accent));
    } else if (key === 'shotgun') {
      g.add(this._box(0.1, 0.13, 0.62, 0, 0, -0.1, body)); // receiver
      g.add(this._cyl(0.04, 0.04, 0.5, 0, 0.02, -0.45, steel, 14)); // wide barrel
      g.add(this._cyl(0.05, 0.05, 0.24, 0, -0.04, -0.34, dark, 14)); // pump/forend
      g.add(this._box(0.06, 0.12, 0.1, 0, -0.1, 0.14, grip)); // grip
      g.add(this._box(0.07, 0.13, 0.22, 0, 0.0, 0.26, dark)); // stock
    } else if (key === 'rifle') {
      g.add(this._box(0.08, 0.12, 0.55, 0, 0, -0.12, body));
      g.add(this._cyl(0.022, 0.022, 0.4, 0, 0.01, -0.5, steel, 12));
      g.add(this._cyl(0.035, 0.035, 0.22, 0, 0, -0.34, dark, 12));
      g.add(this._cyl(0.03, 0.025, 0.06, 0, 0, -0.72, dark, 12));
      g.add(this._box(0.05, 0.18, 0.09, 0, -0.14, 0.02, dark));
      g.add(this._box(0.05, 0.12, 0.09, 0, -0.09, 0.16, grip));
      g.add(this._box(0.06, 0.08, 0.2, 0, 0.02, 0.22, dark));
      g.add(this._box(0.018, 0.05, 0.2, 0, 0.09, -0.08, accent));
    } else if (key === 'sniper') {
      g.add(this._box(0.085, 0.12, 0.7, 0, 0, -0.18, body));
      g.add(this._cyl(0.025, 0.025, 0.6, 0, 0.01, -0.78, steel, 14));
      g.add(this._cyl(0.045, 0.045, 0.34, 0, 0.13, -0.08, dark, 16));
      g.add(this._cyl(0.05, 0.05, 0.04, 0, 0.13, -0.26, accent, 16));
      g.add(this._cyl(0.05, 0.05, 0.04, 0, 0.13, 0.1, dark, 16));
      g.add(this._box(0.05, 0.16, 0.08, 0, -0.13, 0.1, dark));
      g.add(this._box(0.05, 0.11, 0.09, 0, -0.08, 0.22, grip));
      g.add(this._box(0.07, 0.1, 0.26, 0, -0.01, 0.34, dark));
    } else if (key === 'mg') {
      g.add(this._box(0.11, 0.15, 0.72, 0, 0, -0.14, body)); // big receiver
      g.add(this._cyl(0.03, 0.03, 0.5, 0, 0.02, -0.62, steel, 14)); // barrel
      g.add(this._box(0.16, 0.22, 0.2, 0, -0.16, -0.02, dark)); // ammo box
      g.add(this._box(0.06, 0.12, 0.1, 0, -0.1, 0.18, grip)); // grip
      g.add(this._box(0.07, 0.1, 0.24, 0, 0.0, 0.3, dark)); // stock
      g.add(this._cyl(0.012, 0.012, 0.3, -0.06, -0.16, -0.5, steel, 8)); // bipod legs
      g.add(this._cyl(0.012, 0.012, 0.3, 0.06, -0.16, -0.5, steel, 8));
      g.add(this._box(0.02, 0.05, 0.2, 0, 0.11, -0.1, accent)); // rail
    } else if (key === 'knife') {
      g.add(this._box(0.02, 0.05, 0.34, 0, 0.06, -0.12, blade));
      g.add(this._box(0.025, 0.025, 0.08, 0, 0.06, -0.32, blade));
      g.add(this._box(0.09, 0.04, 0.03, 0, 0.06, 0.04, steel));
      g.add(this._cyl(0.022, 0.022, 0.16, 0, 0.04, 0.12, grip, 10));
      g.add(this._box(0.03, 0.03, 0.03, 0, 0.04, 0.2, accent));
    }
    return g;
  }

  _applyVisibility() {
    if (this.currentKey && this.models[this.currentKey]) {
      this.models[this.currentKey].visible = !this.hidden && !this.scopedHidden;
    }
  }

  setWeapon(id) {
    const key = modelKeyFor(id);
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

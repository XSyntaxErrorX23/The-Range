import * as THREE from 'three';
import { damp, clamp } from '../util/math.js';
import { modelKeyFor, WEAPONS } from './weapons.config.js';
import { buildWeaponModel } from './weaponModel.js';

/**
 * First-person weapon viewmodel: a unique gun per weapon id (built by the shared
 * weaponModel factory), parented to the camera. Adds hipfire/ADS poses, walk bob,
 * look sway, recoil kickback, reload dip and a melee swing. Hidden in third-person
 * / while scoped. Unknown ids fall back to their family silhouette.
 */
export class ViewModel {
  constructor(camera) {
    this.root = new THREE.Group();
    camera.add(this.root);

    // One model per weapon id, built by the shared weapon-model factory.
    this.models = {};
    for (const id of Object.keys(WEAPONS)) {
      const m = buildWeaponModel(id);
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
    this._swingDir = 1; // alternates each light slash (left / right)
    this.stabT = 0;
    this.inspectT = 0; this.inspectDur = 2.1;
    this.bobPhase = 0;
    this.swayX = 0; this.swayY = 0;
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
    this.kick = 0; this.reloadT = 0; this.swingT = 0; this.stabT = 0; this.inspectT = 0;
    this._applyVisibility();
  }

  setVisible(visible) { this.hidden = !visible; this._applyVisibility(); }
  setScopedHidden(hidden) { this.scopedHidden = hidden; this._applyVisibility(); }
  setADS(isADS) { this.isADS = isADS; if (isADS) this.inspectT = 0; }

  triggerKick(amount = 1) { this.kick = Math.min(1.4, this.kick + amount); this.inspectT = 0; }
  triggerReload(dur) { this.reloadT = dur; this.reloadDur = dur; this.inspectT = 0; }
  triggerSwing() { this._swingDir = -this._swingDir; this.swingT = 0.16; } // fast, alternating side
  triggerStab() { this.stabT = 0.3; this.inspectT = 0; }
  triggerInspect() { if (!this.isADS) this.inspectT = this.inspectDur; }

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

    // light slash: a horizontal sweep that alternates left/right each click
    let swingRX = 0, swingRY = 0, swingRZ = 0, swingPX = 0, swingPZ = 0;
    if (this.swingT > 0) {
      this.swingT = Math.max(0, this.swingT - dt);
      const p = 1 - this.swingT / 0.16;       // 0..1 progress
      const s = Math.sin(p * Math.PI);         // 0..1..0 envelope
      const d = this._swingDir;
      swingPX = d * 0.34 * (1 - 2 * p);        // wide sweep across the screen
      swingPZ = -0.12 * s;                      // slight forward
      swingRZ = -d * 1.15 * s;                  // roll the blade into the slash
      swingRY = d * 0.95 * s;                   // wide yaw across
      swingRX = -0.26 * s;                      // downward arc
    }

    // heavy stab: a forward thrust (push the blade toward the target, slight dip)
    let stabPos = 0, stabRot = 0;
    if (this.stabT > 0) {
      this.stabT = Math.max(0, this.stabT - dt);
      const p = 1 - this.stabT / 0.3;
      const s = Math.sin(Math.min(1, p * 1.4) * Math.PI); // quick thrust + recover
      stabPos = -0.34 * s; // forward (toward -Z)
      stabRot = 0.32 * s;  // tip down into the stab
    }

    // inspect: tilt the muzzle up to show the top, hold, then drop back down
    let inspRX = 0, inspRY = 0, inspRZ = 0, inspPX = 0, inspPY = 0, inspPZ = 0;
    if (this.inspectT > 0) {
      this.inspectT = Math.max(0, this.inspectT - dt);
      const p = 1 - this.inspectT / this.inspectDur; // 0..1
      // trapezoid envelope: ease up -> hold -> ease down
      let env = Math.min(Math.min(1, p / 0.22), Math.min(1, (1 - p) / 0.28));
      env = env * env * (3 - 2 * env); // smoothstep the edges
      inspRX = 0.6 * env;   // pitch the muzzle up (~35°)
      inspRY = 0.26 * env;  // slight yaw to angle it (~15°)
      inspRZ = 0.12 * env;  // small roll
      inspPY = 0.05 * env;  // lift it up
      inspPZ = 0.15 * env;  // pull closer to the camera
    }

    model.position.set(
      this.basePos.x + bobX + this.swayX + swingPX + inspPX,
      this.basePos.y + bobY + this.swayY + reloadDip + inspPY,
      this.basePos.z + this.kick * 0.13 + swingPZ + stabPos + inspPZ
    );
    model.rotation.set(
      -this.kick * 0.2 + reloadRot + swingRX + stabRot - this.swayY * 1.5 + inspRX,
      -this.swayX * 1.5 + swingRY + inspRY,
      swingRZ + inspRZ
    );
  }
}

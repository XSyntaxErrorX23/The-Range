import * as THREE from 'three';
import { bus, EV } from '../core/events.js';
import { canvasTexture, accuracyTargetCanvas } from './textures.js';

/**
 * A bullseye drone for the practice range (Valorant-style targets).
 *
 * Two behaviours:
 *  - wander (default): a quadcopter that glides between random waypoints downrange.
 *  - popup: hovers at a fixed spot; when shot it sinks/vanishes and (via DroneField)
 *    pops back up at a different spot — like the range's pop-up bots.
 *
 * The bullseye disc reuses the accuracy-target scoring (userData.accuracyTarget +
 * center + rings); `center` is re-synced to the disc's world position every frame so
 * hits register on the moving/hovering target. It's a movable solid (no decals).
 */
const R = 0.9;            // bullseye radius
const REGION = { x0: -7, x1: 8, y0: 1.7, y1: 4.1, z0: 16, z1: 29 }; // wander box
const RESPAWN = 1.5;      // popup downtime before it can pop up again

export class RangeDrone {
  constructor(scene, { popup = false } = {}) {
    this.scene = scene;
    this.popup = popup;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this.enabled = false;
    this._solids = null; // the solids array we registered the disc into
    this._t = Math.random() * 6.28;
    this._rotors = [];
    this._hopFlash = 0;

    this.state = 'up';   // popup: 'up' | 'down'
    this._scale = 1;     // popup rise/sink animation
    this._downTimer = 0;
    this.needsRespawn = false;
    this._lastKey = '';

    this._base = new THREE.Vector3(0, 2.6, 22);
    this._target = new THREE.Vector3(0, 2.6, 22);
    this._spot = new THREE.Vector3(0, 2.6, 22);
    this._discWorld = new THREE.Vector3();

    this._build();
    bus.on(EV.ACCURACY_SCORE, ({ point }) => this._onScore(point));
  }

  _build() {
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c2228, roughness: 0.5, metalness: 0.7 });
    const blade = new THREE.MeshStandardMaterial({ color: 0x2c333b, roughness: 0.6, metalness: 0.4, transparent: true, opacity: 0.85 });
    this._lightMat = new THREE.MeshStandardMaterial({ color: 0x0a1a1c, emissive: 0x46e0d6, emissiveIntensity: 0.9, roughness: 0.4 });

    const tex = canvasTexture(accuracyTargetCanvas(), 1, 1);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(R, 48), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05 }));
    disc.rotation.y = Math.PI;
    disc.userData.accuracyTarget = true;
    disc.userData.center = new THREE.Vector3();
    disc.userData.rings = [[R * 0.10, 100], [R * 0.25, 75], [R * 0.46, 50], [R * 0.71, 25], [R, 10]];
    this.group.add(disc);
    this.disc = disc;

    const rim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.04, 0.05, 10, 48), this._lightMat);
    rim.position.z = 0.01;
    this.group.add(rim);

    // ---- quadcopter chassis above the disc ----
    const hubY = R + 0.55, hubZ = 0.18;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.28, 6), dark);
    hub.position.set(0, hubY, hubZ);
    this.group.add(hub);
    const topLight = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), this._lightMat);
    topLight.position.set(0, hubY + 0.18, hubZ);
    this.group.add(topLight);

    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, hubY - R + 0.1, 6), dark);
    strut.position.set(0, (R + hubY) / 2, hubZ * 0.5);
    this.group.add(strut);

    for (const ry of [Math.PI / 4, -Math.PI / 4]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.05, 0.08), dark);
      bar.position.set(0, hubY, hubZ);
      bar.rotation.y = ry;
      this.group.add(bar);
    }
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const mx = sx * 0.39, mz = hubZ + sz * 0.39;
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 10), dark);
      motor.position.set(mx, hubY + 0.02, mz);
      this.group.add(motor);
      const rotor = new THREE.Group();
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.012, 0.07), blade);
      const b2 = b1.clone(); b2.rotation.y = Math.PI / 2;
      rotor.add(b1); rotor.add(b2);
      rotor.position.set(mx, hubY + 0.1, mz);
      this.group.add(rotor);
      this._rotors.push(rotor);
    }
  }

  // ---- wandering drone (single, free-flying) ----
  enable(world) {
    if (this.enabled && this._solids === world.solids) return;
    this.disable();
    this.enabled = true;
    this.group.visible = true;
    this.group.scale.setScalar(1);
    this._solids = world.solids;
    this._solids.push(this.disc);
    this._pickTarget();
  }

  // ---- popup drone placement (driven by DroneField) ----
  placeAt(spot, solids) {
    this._spot.copy(spot);
    this._base.copy(spot);
    this._lastKey = `${Math.round(spot.x)},${Math.round(spot.z)}`;
    this.state = 'up';
    this._scale = 0.02; // pop up / grow in
    this._downTimer = 0;
    this.needsRespawn = false;
    this.enabled = true;
    this.group.visible = true;
    this._solids = solids;
    if (solids && solids.indexOf(this.disc) < 0) solids.push(this.disc);
  }

  disable() {
    this.enabled = false;
    this.group.visible = false;
    this.state = 'up';
    this._scale = 1;
    this.group.scale.setScalar(1);
    this.needsRespawn = false;
    this._removeDisc();
    this._solids = null;
  }

  _removeDisc() {
    if (!this._solids) return;
    const i = this._solids.indexOf(this.disc);
    if (i >= 0) this._solids.splice(i, 1);
  }

  _pickTarget() {
    this._target.set(
      REGION.x0 + Math.random() * (REGION.x1 - REGION.x0),
      REGION.y0 + Math.random() * (REGION.y1 - REGION.y0),
      REGION.z0 + Math.random() * (REGION.z1 - REGION.z0),
    );
  }

  _onScore(point) {
    if (!this.enabled) return;
    if (point.distanceTo(this._discWorld) > R + 0.5) return; // not our bullseye
    this._hopFlash = 0.3;
    if (this.popup) {
      if (this.state !== 'up' || this._scale < 0.9) return;
      this.state = 'down';      // sink + go dormant
      this._downTimer = RESPAWN;
      this._removeDisc();       // can't be shot while down
    } else {
      this._pickTarget();       // wanderer darts away
    }
  }

  update(dt) {
    if (!this.enabled) return;
    this._t += dt;
    const spin = this.state === 'down' ? 8 : 30;
    for (const r of this._rotors) r.rotation.y += dt * spin;

    if (this.popup) this._updatePopup(dt);
    else this._updateWander(dt);

    // keep the scoring centre synced to the disc's live world position
    this.disc.getWorldPosition(this._discWorld);
    this.disc.userData.center.copy(this._discWorld);

    if (this._hopFlash > 0) this._hopFlash = Math.max(0, this._hopFlash - dt);
    this._lightMat.emissiveIntensity = 0.9 + this._hopFlash * 9;
  }

  _updateWander(dt) {
    this._base.lerp(this._target, Math.min(1, dt * 0.7));
    if (this._base.distanceTo(this._target) < 0.5) this._pickTarget();
    this.group.position.copy(this._base);
    this.group.position.y += Math.sin(this._t * 2) * 0.13 + Math.sin(this._t * 3.3) * 0.04;
    this.group.position.x += Math.sin(this._t * 1.3) * 0.06;
  }

  _updatePopup(dt) {
    if (this.state === 'up') {
      this._scale = Math.min(1, this._scale + dt * 4);
      this.group.position.copy(this._spot);
      this.group.position.y += Math.sin(this._t * 2) * 0.11 + Math.sin(this._t * 3.1) * 0.03;
    } else {
      this._scale = Math.max(0, this._scale - dt * 5);
      this.group.position.copy(this._spot);
      this.group.position.y -= (1 - this._scale) * 1.4; // sink as it shrinks
      this._downTimer -= dt;
      if (this._downTimer <= 0 && this._scale <= 0.03) this.needsRespawn = true;
    }
    this.group.scale.setScalar(Math.max(0.02, this._scale));
  }
}

// Spots the pop-up drones occupy around the practice range — spread across the
// full depth (near firing line → far back wall) and width so nowhere is empty.
const SPOTS = [
  [-19, 2.4, 14], [4, 3.2, 16], [21, 2.8, 18],          // near
  [-12, 3.0, 24], [16, 3.0, 22], [-3, 2.6, 28], [10, 2.4, 26], // mid
  [-21, 3.4, 36], [14, 3.0, 38], [-8, 2.2, 42], [6, 2.6, 40], [22, 2.6, 44], [-15, 2.8, 44], // far
];

/**
 * A field of pop-up bullseye drones stationed around the range. Each hovers at a
 * spot; when shot it sinks and pops back up at a different free spot.
 */
export class DroneField {
  constructor(scene, count = 4) {
    this.scene = scene;
    this.drones = [];
    for (let i = 0; i < count; i++) this.drones.push(new RangeDrone(scene, { popup: true }));
    this.spots = SPOTS.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    this.enabled = false;
    this._solidsRef = null;
  }

  enable(world) {
    if (this.enabled && this._solidsRef === world.solids) return;
    this.disable();
    this.enabled = true;
    this._solidsRef = world.solids;
    // spread the initial drones evenly across depth (near → far) so the back isn't empty
    const sorted = this.spots.slice().sort((a, b) => a.z - b.z);
    const n = sorted.length;
    const denom = Math.max(1, this.drones.length - 1);
    this.drones.forEach((d, i) => {
      const idx = Math.round((i * (n - 1)) / denom);
      d.placeAt(sorted[idx], world.solids);
    });
  }

  disable() {
    this.enabled = false;
    this._solidsRef = null;
    for (const d of this.drones) d.disable();
  }

  update(dt) {
    if (!this.enabled) return;
    for (const d of this.drones) {
      d.update(dt);
      if (d.needsRespawn) d.placeAt(this._freeSpot(d), this._solidsRef);
    }
  }

  _key(v) { return `${Math.round(v.x)},${Math.round(v.z)}`; }

  _freeSpot(drone) {
    const used = new Set();
    for (const d of this.drones) if (d !== drone && d.enabled && d.state === 'up') used.add(this._key(d._spot));
    const free = this.spots.filter((s) => !used.has(this._key(s)) && this._key(s) !== drone._lastKey);
    const list = free.length ? free : this.spots;
    return list[Math.floor(Math.random() * list.length)];
  }

  _shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

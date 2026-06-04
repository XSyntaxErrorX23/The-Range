import * as THREE from 'three';
import { bus } from '../core/events.js';

const DASH_SPEED = 17;
const DASH_TIME = 0.32;
const UPDRAFT_VELOCITY = 9.0;

/**
 * Jett's kit (range-friendly: charges auto-recharge):
 *   C — Cloudburst : throw a vision-blocking smoke where you aim
 *   Q — Updraft    : vertical boost (good with the parkour course)
 *   E — Tailwind   : horizontal dash in your movement/look direction
 *   X — Blade Storm: equip throwing knives (handled by WeaponManager)
 */
export class Abilities {
  constructor({ input, player, cameraRig, scene, weapons, world, audio }) {
    this.input = input;
    this.player = player;
    this.cameraRig = cameraRig;
    this.scene = scene;
    this.weapons = weapons;
    this.world = world;
    this.audio = audio;

    this.defs = {
      cloud: { name: 'Cloudburst', max: 2, count: 2, recharge: 4.5, timer: 0 },
      updraft: { name: 'Updraft', max: 2, count: 2, recharge: 4.5, timer: 0 },
      dash: { name: 'Tailwind', max: 1, count: 1, recharge: 6, timer: 0 },
      ult: { name: 'Blade Storm', max: 1, count: 1, recharge: 16, timer: 0 },
    };

    this.dashTime = 0;
    this.dashDir = new THREE.Vector3();
    this.smokes = [];

    this._origin = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._ray = new THREE.Raycaster();

    this._emit();
  }

  _spend(def) { def.count = Math.max(0, def.count - 1); this._emit(); }

  update(dt) {
    // recharge
    let changed = false;
    for (const k in this.defs) {
      const d = this.defs[k];
      if (d.count < d.max) {
        d.timer += dt;
        if (d.timer >= d.recharge) { d.timer = 0; d.count++; changed = true; }
      } else {
        d.timer = 0;
      }
    }
    if (changed) this._emit();

    // casts (edges)
    if (this.input.pressed('ABILITY_DASH') && this.defs.dash.count > 0) this._dash();
    if (this.input.pressed('ABILITY_UPDRAFT') && this.defs.updraft.count > 0) this._updraft();
    if (this.input.pressed('ABILITY_CLOUD') && this.defs.cloud.count > 0) this._cloud();
    if (this.input.pressed('ABILITY_ULT') && this.defs.ult.count > 0) this._blade();

    // active dash overrides horizontal velocity (float, no gravity) — but let an
    // intentional upward impulse (Updraft / jump cast mid-dash) survive
    if (this.dashTime > 0) {
      this.dashTime -= dt;
      this.player.velocity.x = this.dashDir.x * DASH_SPEED;
      this.player.velocity.z = this.dashDir.z * DASH_SPEED;
      if (this.player.velocity.y < 0) this.player.velocity.y = 0;
    }

    this._updateSmokes(dt);
  }

  _dash() {
    this._spend(this.defs.dash);
    const yaw = this.cameraRig.yaw;
    this._fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    this._right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    const f = (this.input.isDown('MOVE_FORWARD') ? 1 : 0) - (this.input.isDown('MOVE_BACK') ? 1 : 0);
    const s = (this.input.isDown('MOVE_RIGHT') ? 1 : 0) - (this.input.isDown('MOVE_LEFT') ? 1 : 0);
    this.dashDir.set(0, 0, 0).addScaledVector(this._fwd, f).addScaledVector(this._right, s);
    if (this.dashDir.lengthSq() < 1e-4) this.dashDir.copy(this._fwd); // none pressed -> forward
    this.dashDir.normalize();
    this.dashTime = DASH_TIME;
    this.player.grounded = false;
    if (this.audio) this.audio.dash();
  }

  _updraft() {
    this._spend(this.defs.updraft);
    this.player.velocity.y = UPDRAFT_VELOCITY;
    this.player.grounded = false;
    if (this.audio) this.audio.updraft();
  }

  _cloud() {
    this._spend(this.defs.cloud);
    this.cameraRig.getAimRay(this._origin, this._dir);
    this._ray.set(this._origin, this._dir);
    this._ray.far = 20;
    const hit = this._ray.intersectObjects(this.world.solids, false)[0];
    const pos = hit ? hit.point.clone() : this._origin.clone().addScaledVector(this._dir, 14);
    pos.y = Math.max(pos.y + 0.4, 1.3); // float a bit off the floor

    const geo = new THREE.SphereGeometry(1, 18, 14);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xe7edf2, roughness: 1, metalness: 0,
      transparent: true, opacity: 0, depthWrite: false,
      side: THREE.DoubleSide, // render the inner surface too, so it reads as a volume from inside
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.scale.setScalar(0.2);
    this.scene.add(mesh);
    this.smokes.push({ mesh, t: 0, life: 5 });
    if (this.audio) this.audio.smoke();
  }

  _blade() {
    this._spend(this.defs.ult);
    this.weapons.equipBlades();
    if (this.audio) this.audio.blade();
  }

  /** How much a point's vision is obscured by smoke (0 clear .. 1 blind). Used to
   *  blind the player's screen when the camera is inside a cloud. */
  visionObscure(point) {
    let f = 0;
    for (const s of this.smokes) {
      const r = s.mesh.scale.x; // sphere geometry radius is 1, so scale == world radius
      const d = point.distanceTo(s.mesh.position);
      if (d < r) {
        const depth = 1 - d / r;                 // 0 at the edge, 1 at the centre
        const fade = s.mesh.material.opacity / 0.92; // current fade-in/out (0..1)
        f = Math.max(f, Math.min(1, depth * 1.7) * fade);
      }
    }
    return f;
  }

  _updateSmokes(dt) {
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.t += dt;
      const grow = Math.min(1, s.t / 0.35);
      s.mesh.scale.setScalar(0.2 + 2.4 * grow);
      const fadeIn = Math.min(1, s.t / 0.35);
      const fadeOut = s.t > s.life - 0.8 ? Math.max(0, (s.life - s.t) / 0.8) : 1;
      s.mesh.material.opacity = 0.92 * fadeIn * fadeOut;
      if (s.t >= s.life) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        s.mesh.material.dispose();
        this.smokes.splice(i, 1);
      }
    }
  }

  _emit() {
    const state = {};
    for (const k in this.defs) state[k] = { count: this.defs[k].count, max: this.defs[k].max, ready: this.defs[k].count > 0 };
    bus.emit('abilities:update', state);
  }
}

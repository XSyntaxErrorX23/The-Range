import * as THREE from 'three';
import { bus, EV } from '../core/events.js';

/**
 * Aim Labs–style "gridshot" trainer. A fixed number of glowing orbs float on a
 * plane downrange; shooting one pops it and immediately spawns a fresh orb
 * elsewhere. A 60s timer tracks score, accuracy and best streak. Hit detection
 * is an analytic ray–sphere test off the camera aim ray (fired on COMBAT_FIRED),
 * independent of the bot/world hitscan so it never fights the normal pipeline.
 *
 * Lives on the practice range world; only active while botMode === 'aim'.
 */

const SESSION = 60;        // seconds per run
const COUNTDOWN = 1.6;     // "GET READY" before the clock starts
const TARGET_COUNT = 3;    // orbs visible at once
const ORB_R = 0.32;        // orb radius (world units)
const HIT_PAD = 1.05;      // hit radius vs the orb mesh (kept close to avoid double-tracer edges)
const PLANE_Z = 14;        // depth of the orb wall (downrange = +Z)
const REGION = { x: 7, yLo: 0.9, yHi: 3.5 }; // spawn rectangle (centered on x=0)
const MIN_SEP = 1.7;       // keep orbs from overlapping

export class AimTrainer {
  constructor({ scene, player, cameraRig, settings, weapons }) {
    this.scene = scene;
    this.player = player;
    this.cameraRig = cameraRig;
    this.settings = settings;
    this.weapons = weapons;

    this.active = false;
    this.phase = 'idle'; // idle | countdown | live | ended
    this.timer = 0;
    this.elapsed = 0;
    this.orbs = [];
    this.arena = null; // set by Game so orbs join the firing raycast (block + no decal)

    this.score = 0; this.shots = 0; this.hits = 0;
    this.streak = 0; this.bestStreak = 0;

    this.group = new THREE.Group();
    this.group.visible = false;
    this.scene.add(this.group);

    // shared geometry/material for all orbs
    this._geo = new THREE.SphereGeometry(ORB_R, 20, 16);
    this._mat = new THREE.MeshStandardMaterial({
      color: 0x0a1a1c, emissive: 0x46e0d6, emissiveIntensity: 1.6,
      roughness: 0.3, metalness: 0,
    });

    this._origin = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._savedLoadout = null;

    this.onMatchEnd = () => {};
    bus.on(EV.COMBAT_FIRED, ({ weapon }) => this._onFired(weapon));
  }

  /** Game hands us the active arena so orb meshes can join its solids list. */
  setArena(arena) { this.arena = arena; }

  activate() {
    this.active = true;
    this._savedLoadout = { primaryId: this.weapons.primaryId, sidearmId: this.weapons.sidearmId };
    this._reset();
  }

  deactivate() {
    this.active = false;
    this.phase = 'idle';
    this._clearOrbs();
    this.group.visible = false;
    if (this._savedLoadout) {
      this.weapons.primaryId = this._savedLoadout.primaryId;
      this.weapons.sidearmId = this._savedLoadout.sidearmId;
      this.weapons.equip(this._savedLoadout.primaryId);
      this._savedLoadout = null;
    }
    this.player.health = this.player.maxHealth;
    this.player.armor = 0;
    this.player.alive = true;
    this.player._emitHealth();
    this._emitState();
  }

  /** Restart a run (used by activate + REMATCH). */
  restart() { this._reset(); }

  _reset() {
    this.score = 0; this.shots = 0; this.hits = 0;
    this.streak = 0; this.bestStreak = 0;
    this.elapsed = 0;
    this.timer = COUNTDOWN;
    this.phase = 'countdown';
    this.group.visible = true;

    // stand the player at the firing line, facing downrange (+Z)
    this.player.spawnReset(new THREE.Vector3(0, 0, 2));
    this.cameraRig.yaw = Math.PI; this.cameraRig.pitch = 0;
    this.cameraRig.recoilPitch = 0; this.cameraRig.recoilYaw = 0;
    // a precise, infinite-ammo sidearm keeps it about aim, not recoil/reloads
    this.weapons.setLoadout('sheriff');
    this.weapons.ammo.mag = this.weapons.weapon.magSize;
    this.weapons._emitAmmo();

    this._clearOrbs();
    for (let i = 0; i < TARGET_COUNT; i++) this._spawnOrb();

    bus.emit(EV.AIM_ANNOUNCE, { text: 'GET READY', sub: 'GRIDSHOT · 60s' });
    this._emitState();
  }

  playerFrozen() { return this.active && this.phase !== 'live'; }

  update(dt) {
    if (!this.active) return;

    // orb idle life — gentle pulse so they read as "alive"
    this.elapsed += dt;
    const pulse = 1 + Math.sin(this.elapsed * 5) * 0.06;
    for (const o of this.orbs) o.mesh.scale.setScalar(pulse);

    if (this.phase === 'countdown') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.phase = 'live';
        this.timer = SESSION;
        bus.emit(EV.AIM_ANNOUNCE, { text: 'GO', sub: '' });
        this._emitState();
      }
      return;
    }

    if (this.phase === 'live') {
      this.timer -= dt;
      this._emitState();
      if (this.timer <= 0) this._finish();
    }
  }

  _finish() {
    this.phase = 'ended';
    this._clearOrbs();
    const acc = this.shots ? Math.round((this.hits / this.shots) * 100) : 0;
    const kps = (this.score / SESSION).toFixed(2);
    bus.emit(EV.AIM_END, { score: this.score, acc, best: this.bestStreak, kps });
    bus.emit(EV.AIM_STATE, { active: false });
    this.onMatchEnd({ score: this.score, acc, best: this.bestStreak, kps });
  }

  /** A trigger pull: count the shot, test the orbs, pop the nearest one hit. */
  _onFired(weapon) {
    if (!this.active || this.phase !== 'live') return;
    if (weapon && (weapon.type === 'melee' || weapon.category === 'special')) return;
    this.shots++;

    this.cameraRig.getAimRay(this._origin, this._dir);
    let best = null, bestT = Infinity;
    const rr = (ORB_R * HIT_PAD) * (ORB_R * HIT_PAD);
    for (const o of this.orbs) {
      this._tmp.copy(o.center).sub(this._origin);
      const t = this._tmp.dot(this._dir);
      if (t < 0) continue; // behind the camera
      const d2 = this._tmp.lengthSq() - t * t; // perp distance² from ray to center
      if (d2 <= rr && t < bestT) { best = o; bestT = t; }
    }

    if (best) {
      this.hits++; this.score++;
      this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak);
      const point = best.center.clone();
      // hitmarker + a floating streak number. No `from` here: the firing hitscan
      // already draws the single tracer/impact to the orb (it's a solid now).
      bus.emit(EV.COMBAT_HIT, { zone: 'body', damage: this.streak, point, dead: true, bot: null, from: null });
      this._removeOrb(best);
      this._spawnOrb();
    } else {
      this.streak = 0;
    }
    this._emitState();
  }

  _spawnOrb() {
    let x = 0, y = 1.5, tries = 0;
    do {
      x = (Math.random() * 2 - 1) * REGION.x;
      y = REGION.yLo + Math.random() * (REGION.yHi - REGION.yLo);
      tries++;
    } while (tries < 12 && this.orbs.some((o) => Math.hypot(o.center.x - x, o.center.y - y) < MIN_SEP));

    const mesh = new THREE.Mesh(this._geo, this._mat);
    mesh.position.set(x, y, PLANE_Z);
    mesh.userData.aimOrb = true; // FiringController stops the bullet here, no decal
    mesh.updateMatrixWorld();
    this.group.add(mesh);
    if (this.arena) this.arena.solids.push(mesh); // joins the firing raycast
    this.orbs.push({ mesh, center: new THREE.Vector3(x, y, PLANE_Z), spawnT: this.elapsed });
  }

  _removeOrb(orb) {
    const i = this.orbs.indexOf(orb);
    if (i >= 0) this.orbs.splice(i, 1);
    this.group.remove(orb.mesh);
    this._unregister(orb.mesh);
  }

  _clearOrbs() {
    for (const o of this.orbs) { this.group.remove(o.mesh); this._unregister(o.mesh); }
    this.orbs.length = 0;
  }

  _unregister(mesh) {
    if (!this.arena) return;
    const j = this.arena.solids.indexOf(mesh);
    if (j >= 0) this.arena.solids.splice(j, 1);
  }

  _emitState() {
    const acc = this.shots ? Math.round((this.hits / this.shots) * 100) : 100;
    bus.emit(EV.AIM_STATE, {
      active: this.active && this.phase !== 'ended',
      time: Math.max(0, Math.ceil(this.timer)),
      countdown: this.phase === 'countdown',
      score: this.score, shots: this.shots, hits: this.hits,
      acc, streak: this.streak,
    });
  }
}

import * as THREE from 'three';
import { Bot } from './Bot.js';
import { bus, EV } from '../core/events.js';
import { WEAPONS, weaponMoveMult } from '../weapons/weapons.config.js';

/**
 * A team-deathmatch combatant. Wraps a `Bot` (visual/colliders/damage) and runs
 * combat AI against a list of opponents (each exposing alive/pos/eye/takeHit), so
 * the same agent fights bots OR the player. Adapted from EnemyAgent, but the target
 * is the nearest living opponent rather than a fixed player reference.
 *
 * Itself implements the opponent interface (alive/pos/eye/takeHit), so an enemy
 * bot can target an ally bot the same way it targets the player.
 */
const EYE_Y = 1.7;
const DIFF = { reaction: 0.2, accuracy: 0.6, moveSpeed: 4.1, strafeChance: 0.6, retreatHP: 28, headChance: 0.12 };

export class TeamBot {
  constructor(scene, id, team) {
    this.team = team; // 'ally' | 'enemy'
    this.name = '';
    this._mates = [];
    this._lastAttacker = null;
    this.bot = new Bot(scene, id);
    this.bot.hide();
    this.world = null;
    this.ray = new THREE.Raycaster();
    this._from = new THREE.Vector3();
    this._to = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this.setWeapon('vandal');
    this._reset();
    this._recolor(team);
  }

  // ---- opponent interface ----
  get alive() { return this.bot.alive; }
  get pos() { return this.bot.root.position; }
  eye(out) { const b = this.bot.root.position; return out.set(b.x, b.y + EYE_Y, b.z); }
  takeHit(dmg, zone, attacker) {
    if (attacker) this._lastAttacker = attacker;
    return this.bot.takeDamage(dmg, zone || 'body', this.bot.root.position);
  }

  _recolor(team) {
    const b = this.bot;
    if (team === 'ally') { b.bodyMat.color.set(0x2f6fb0); b.visorMat.emissive.set(0x2fa0ff); }
    else { b.bodyMat.color.set(0xc0383a); b.visorMat.emissive.set(0xff3a2a); }
    b.visorMat.emissiveIntensity = 0.9;
  }

  setWeapon(id) {
    this.weaponId = WEAPONS[id] ? id : 'vandal';
    this.weapon = WEAPONS[this.weaponId];
    this.mag = this.weapon.magSize;
    this.bot.setWeaponModel(this.weaponId);
  }

  _reset() {
    this.fireCd = 0; this.reloadTimer = 0;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1; this.strafeTimer = 0;
    this.desiredRange = 7 + Math.random() * 7;
    this.mag = this.weapon.magSize;
    this.hasLOS = false; this.losTimer = 0; this.seenTime = 0;
    this.target = null; this.retargetT = 0;
  }

  spawn(pos) { this.bot.spawnAt(pos.clone(), { armor: 0 }); this._reset(); }
  hide() { this.bot.hide(); }

  update(dt, opponents, teammates) {
    this._mates = teammates || [];
    this.bot.update(dt);
    if (!this.bot.alive || this.bot.state !== 'alive') return;

    this.retargetT -= dt;
    if (this.retargetT <= 0 || !this.target || !this.target.alive) { this.target = this._nearest(opponents); this.retargetT = 0.5; }
    if (!this.target) return;

    const b = this.bot.root.position;
    this._from.set(b.x, b.y + EYE_Y, b.z);
    this.target.eye(this._to);
    this._dir.copy(this._to).sub(this._from);
    const dist = this._dir.length() || 1;
    this._dir.multiplyScalar(1 / dist);

    this.bot.root.rotation.y = Math.atan2(this._to.x - b.x, this._to.z - b.z);

    this.losTimer -= dt;
    if (this.losTimer <= 0) { this.losTimer = 0.12; this.hasLOS = this._checkLOS(dist); }
    if (this.hasLOS && dist <= this.weapon.range + 5) this.seenTime += dt; else this.seenTime = 0;

    this._navigate(dt, dist);
    this._combat(dt, dist);
  }

  _nearest(opps) {
    let best = null, bd = Infinity;
    const b = this.bot.root.position;
    for (const o of opps) {
      if (!o || !o.alive) continue;
      const p = o.pos; const d = (p.x - b.x) ** 2 + (p.z - b.z) ** 2;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  _checkLOS(dist) {
    this.ray.set(this._from, this._dir);
    this.ray.near = 0.2; this.ray.far = dist - 0.5;
    return !this.ray.intersectObjects(this.world.solids, false)[0];
  }

  _navigate(dt, dist) {
    const b = this.bot.root.position;
    const tp = this.target.pos;
    const tox = tp.x - b.x, toz = tp.z - b.z;
    const tl = Math.hypot(tox, toz) || 1;
    const nx = tox / tl, nz = toz / tl;

    let mvx = 0, mvz = 0;
    const lowHP = this.bot.health < DIFF.retreatHP;
    if (dist > this.desiredRange + 2) { mvx += nx; mvz += nz; }
    else if (dist < this.desiredRange - 2 || lowHP) { mvx -= nx; mvz -= nz; }

    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) { this.strafeTimer = 0.6 + Math.random() * 0.9; if (Math.random() < DIFF.strafeChance) this.strafeDir *= -1; }
    const amt = (this.hasLOS ? 1 : 0.4) * (lowHP ? 1.2 : 0.9);
    mvx += -nz * this.strafeDir * amt;
    mvz += nx * this.strafeDir * amt;

    // separation: push away from nearby teammates so the squad spreads out
    for (const a of this._mates) {
      if (a === this || !a.alive) continue;
      const ap = a.pos; const dx = b.x - ap.x, dz = b.z - ap.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 9 && d2 > 1e-4) { const d = Math.sqrt(d2); const f = ((3 - d) / d) * 0.7; mvx += dx * f; mvz += dz * f; }
    }

    const ml = Math.hypot(mvx, mvz);
    if (ml > 1e-3) { mvx /= ml; mvz /= ml; }
    const speed = DIFF.moveSpeed * weaponMoveMult(this.weaponId);
    b.x += mvx * speed * dt;
    b.z += mvz * speed * dt;
    this._avoid(b);

    this.bot.strafeMax = speed;
    this.bot.strafeVel = ml > 0.01 ? speed * this.strafeDir : 0;
  }

  _avoid(b) {
    const r = 0.55;
    for (const box of this.world.boxes) {
      if (box.maxY <= 0.5) continue;       // floor-level / steppable
      if (box.minY > 2.0) continue;        // overhead (lintels, roofs) — bots walk under it
      if (b.x < box.minX - r || b.x > box.maxX + r || b.z < box.minZ - r || b.z > box.maxZ + r) continue;
      const cx = Math.max(box.minX, Math.min(b.x, box.maxX));
      const cz = Math.max(box.minZ, Math.min(b.z, box.maxZ));
      const dx = b.x - cx, dz = b.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 1e-6) { const d = Math.sqrt(d2); const push = (r - d) / d; b.x += dx * push; b.z += dz * push; }
    }
    const bd = this.world.bounds;
    b.x = Math.max(bd.minX + 1, Math.min(bd.maxX - 1, b.x));
    b.z = Math.max(bd.minZ + 1, Math.min(bd.maxZ - 1, b.z));
    b.y = 0;
  }

  _combat(dt, dist) {
    if (this.fireCd > 0) this.fireCd -= dt;
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.mag = this.weapon.magSize;
      return;
    }
    if (!this.hasLOS || dist > this.weapon.range) return;
    if (this.seenTime < DIFF.reaction) return;
    if (this.fireCd > 0) return;
    if (this.mag <= 0) { this.reloadTimer = this.weapon.reloadTime; return; }

    this.fireCd = 60 / this.weapon.fireRate;
    this.mag -= 1;

    const hit = Math.random() < this._hitChance(dist);
    if (hit && this.target && this.target.alive) {
      const base = this.weapon.damage;
      let zone = 'body', dmg = base;
      if (Math.random() < DIFF.headChance) { zone = 'head'; dmg = Math.min(160, Math.round(base * this.weapon.headshotMult)); }
      else if (Math.random() < 0.16) { zone = 'leg'; dmg = Math.round(base * (this.weapon.legMult || 1)); }
      this.target.takeHit(dmg, zone, this);
    }
    bus.emit(EV.ENEMY_FIRED, { from: this._from.clone(), to: this._to.clone(), hit, weapon: this.weapon });
  }

  _hitChance(dist) {
    const distF = Math.max(0.3, 1 - Math.max(0, dist - 8) / 45);
    return Math.min(0.9, DIFF.accuracy * distF);
  }
}

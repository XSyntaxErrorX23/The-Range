import * as THREE from 'three';
import { Bot } from './Bot.js';
import { bus, EV } from '../core/events.js';
import { WEAPONS, weaponMoveMult } from '../weapons/weapons.config.js';

/**
 * A fighting opponent for skirmish (1v1). Wraps a `Bot` for the visual, colliders
 * and damage/death (so the player shoots it exactly like a practice dummy), and
 * layers on combat behaviour: navigate to keep an engagement range, strafe, take
 * line-of-sight checks, react, and fire a hitscan weapon at the player.
 *
 * Hits on the player are resolved probabilistically (accuracy × distance × the
 * player's movement) rather than a precise raycast, since the player has no
 * collider mesh — cleaner and easy to tune per difficulty.
 */

const DIFFICULTY = {
  easy:   { reaction: 0.5,  accuracy: 0.34, moveSpeed: 3.0, strafeChance: 0.3, retreatHP: 18, headChance: 0.05 },
  medium: { reaction: 0.28, accuracy: 0.55, moveSpeed: 3.8, strafeChance: 0.5, retreatHP: 28, headChance: 0.12 },
  hard:   { reaction: 0.13, accuracy: 0.78, moveSpeed: 4.4, strafeChance: 0.7, retreatHP: 35, headChance: 0.2 },
};

const EYE_Y = 1.7;
const NAV_MAX_Z = 36; // keep the AI off the back target platform

export class EnemyAgent {
  constructor(scene, world, player, { onDamagePlayer, difficulty = 'hard' }) {
    this.world = world;
    this.player = player;
    this.onDamagePlayer = onDamagePlayer || (() => {});

    this.bot = new Bot(scene, 99);
    this.bot.hide();

    this.ray = new THREE.Raycaster();
    this._from = new THREE.Vector3();
    this._to = new THREE.Vector3();
    this._dir = new THREE.Vector3();

    this.setDifficulty(difficulty);
    this.setWeapon('vandal');
    this._reset();
  }

  get alive() { return this.bot.alive; }

  setDifficulty(d) { this.diff = DIFFICULTY[d] || DIFFICULTY.hard; }

  setWeapon(id) {
    this.weaponId = WEAPONS[id] ? id : 'vandal';
    this.weapon = WEAPONS[this.weaponId];
    this.mag = this.weapon.magSize;
    this.bot.setWeaponModel(this.weaponId); // show the matching gun model
  }

  _reset() {
    this.seenTime = 0;
    this.losTimer = 0;
    this.hasLOS = false;
    this.fireCd = 0;
    this.reloadTimer = 0;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeTimer = 0;
    this.desiredRange = 8 + Math.random() * 5;
    this.mag = this.weapon.magSize;
  }

  spawn(pos) {
    this.bot.spawnAt(pos.clone(), { armor: 0 });
    this._reset();
  }

  hide() { this.bot.hide(); }

  update(dt) {
    this.bot.update(dt); // animation + rise/death state
    if (!this.bot.alive || this.bot.state !== 'alive') return;

    const b = this.bot.root.position;
    this._from.set(b.x, b.y + EYE_Y, b.z);
    this._to.copy(this.player.eyePosition());
    this._dir.copy(this._to).sub(this._from);
    const dist = this._dir.length() || 1;
    this._dir.multiplyScalar(1 / dist);

    // face the player
    this.bot.root.rotation.y = Math.atan2(this._to.x - b.x, this._to.z - b.z);

    // throttled line-of-sight
    this.losTimer -= dt;
    if (this.losTimer <= 0) { this.losTimer = 0.1; this.hasLOS = this._checkLOS(dist); }
    if (this.hasLOS && dist <= this.weapon.range + 5) this.seenTime += dt; else this.seenTime = 0;

    this._navigate(dt, dist);
    this._combat(dt, dist);
  }

  _checkLOS(dist) {
    this.ray.set(this._from, this._dir);
    this.ray.near = 0.2;
    this.ray.far = dist - 0.4;
    return !this.ray.intersectObjects(this.world.solids, false)[0];
  }

  _navigate(dt, dist) {
    const b = this.bot.root.position;
    const p = this.player.position;
    const tox = p.x - b.x, toz = p.z - b.z;
    const tl = Math.hypot(tox, toz) || 1;
    const nx = tox / tl, nz = toz / tl;

    let mvx = 0, mvz = 0;
    const lowHP = this.bot.health < this.diff.retreatHP;
    if (dist > this.desiredRange + 2) { mvx += nx; mvz += nz; }           // close in
    else if (dist < this.desiredRange - 2 || lowHP) { mvx -= nx; mvz -= nz; } // back off / retreat

    // perpendicular strafe, flipping direction on a timer
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeTimer = 0.6 + Math.random() * 0.9;
      if (Math.random() < this.diff.strafeChance) this.strafeDir *= -1;
    }
    const amt = (this.hasLOS ? 1 : 0.3) * (lowHP ? 1.2 : 0.9);
    mvx += -nz * this.strafeDir * amt;
    mvz += nx * this.strafeDir * amt;

    const ml = Math.hypot(mvx, mvz);
    if (ml > 1e-3) { mvx /= ml; mvz /= ml; }
    const speed = this.diff.moveSpeed * weaponMoveMult(this.weaponId); // heavier gun = slower
    b.x += mvx * speed * dt;
    b.z += mvz * speed * dt;
    this._avoid(b);

    // drive the walk-cycle animation from actual movement
    this.bot.strafeMax = speed;
    this.bot.strafeVel = ml > 0.01 ? speed * this.strafeDir : 0;
  }

  _avoid(b) {
    const r = 0.55;
    for (const box of this.world.boxes) {
      if (box.maxY <= 0.5) continue; // floor-level / steppable
      if (box.minY > 2.0) continue;  // overhead (lintels/roofs) — walk under it
      if (b.x < box.minX - r || b.x > box.maxX + r || b.z < box.minZ - r || b.z > box.maxZ + r) continue;
      const cx = Math.max(box.minX, Math.min(b.x, box.maxX));
      const cz = Math.max(box.minZ, Math.min(b.z, box.maxZ));
      const dx = b.x - cx, dz = b.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (r - d) / d;
        b.x += dx * push;
        b.z += dz * push;
      }
    }
    const bd = this.world.bounds;
    b.x = Math.max(bd.minX + 1, Math.min(bd.maxX - 1, b.x));
    b.z = Math.max(bd.minZ + 1, Math.min(NAV_MAX_Z, b.z));
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
    if (this.seenTime < this.diff.reaction) return; // reaction delay after acquiring
    if (this.fireCd > 0) return;
    if (this.mag <= 0) { this.reloadTimer = this.weapon.reloadTime; return; }

    this.fireCd = 60 / this.weapon.fireRate;
    this.mag -= 1;

    const head = Math.random() < this.diff.headChance;
    const hit = Math.random() < this._hitChance(dist);
    if (hit) {
      const base = this.weapon.damage;
      const dmg = head ? Math.min(160, Math.round(base * this.weapon.headshotMult)) : base;
      this.onDamagePlayer(dmg, head);
    }
    bus.emit(EV.ENEMY_FIRED, { from: this._from.clone(), to: this._to.clone(), hit, weapon: this.weapon });
  }

  _hitChance(dist) {
    const distF = Math.max(0.3, 1 - Math.max(0, dist - 8) / 45);
    const psp = Math.hypot(this.player.velocity.x, this.player.velocity.z);
    const moveF = psp > 4 ? 0.7 : psp > 1 ? 0.85 : 1;
    return Math.min(0.95, this.diff.accuracy * distF * moveF);
  }
}

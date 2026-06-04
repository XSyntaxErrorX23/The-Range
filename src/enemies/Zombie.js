import * as THREE from 'three';
import { Bot } from './Bot.js';
import { bus, EV } from '../core/events.js';

/**
 * A melee zombie. Wraps a `Bot` (recoloured) for the body, colliders, health and
 * death animation, so the player shoots it like any other bot. Navigation reuses
 * the steer-to-target + AABB-avoidance pattern from EnemyAgent, but it closes all
 * the way in and bites on contact instead of shooting. Bosses are scaled up.
 */
let NEXT_ID = 200;

export class Zombie {
  constructor(scene, world, player, { onDamagePlayer }) {
    this.world = world;
    this.player = player;
    this.onDamagePlayer = onDamagePlayer || (() => {});
    this.bot = new Bot(scene, NEXT_ID++);
    this._recolor();
    // the zombie pose pushes the visual head forward — move the head HITBOX to match
    // so headshots line up with where the head actually is.
    this.bot.colliders.head.position.set(0, 1.82, 0.16);
    this.bot.hide();

    this.moveSpeed = 2.5;
    this.meleeDmg = 10;
    this.meleeRange = 1.7;
    this.attackCd = 0;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeTimer = 0;
    this.isBoss = false;
    this._bossBuilt = false;
    this._isBossModel = false;
    this.variant = 'normal'; // normal | brute | flyer | boss
    this.flyHeight = 0;
    this._t = 0;
    this._wings = null;
  }

  get alive() { return this.bot.alive; }
  get bot_() { return this.bot; }

  _recolor() {
    const b = this.bot;
    b.bodyMat.color.set(0x4f6a3c); b.bodyMat.roughness = 0.92; b.bodyMat.metalness = 0;
    b.headMat.color.set(0x93a06f);
    b.darkMat.color.set(0x2a2e22);
    b.visorMat.color.set(0x1a0c0c); b.visorMat.emissive.set(0xff2a14); b.visorMat.emissiveIntensity = 0.9;
  }

  spawn(pos, { health = 100, speed = 2.5, dmg = 10, boss = false, type = 'normal' } = {}) {
    this.isBoss = boss;
    this.variant = boss ? 'boss' : type;
    this.moveSpeed = speed;
    this.meleeDmg = dmg;
    this.flyHeight = 0;
    this.bot.pose = boss ? 'default' : 'zombie';
    if (boss && !this._bossBuilt) this._buildBoss();
    this._applyVariant(this.variant);
    this.bot.spawnAt(pos.clone(), { armor: 0 });
    this.bot.maxHealth = health; // override the Bot default after spawnAt
    this.bot.health = health;
    this.attackCd = 0.6;
    this.strafeTimer = 0;
  }

  /** Size, colour and decorations for a zombie variant (boss keeps its own build). */
  _applyVariant(v) {
    let scale = 1;
    if (v === 'boss') { scale = 2.8; }
    else if (v === 'brute') { scale = 1.8; this._tint(0x6a2a22, 0x9a5040, 0x3a1410); }   // hulking dark-red
    else if (v === 'flyer') { scale = 0.92; this.flyHeight = 2.5; this._tint(0x365463, 0x9fc0cf, 0x142028); this._buildWings(); } // pale floating
    else { this._tint(0x4f6a3c, 0x93a06f, 0x2a2e22); }                                     // normal green
    this.bot.root.scale.setScalar(scale);
    if (this._wings) this._wings.visible = (v === 'flyer');
  }

  _tint(bodyColor, headColor, darkColor) {
    const b = this.bot;
    b.bodyMat.color.set(bodyColor);
    b.headMat.color.set(headColor);
    b.darkMat.color.set(darkColor);
  }

  _buildWings() {
    if (this._wings) return;
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x223038, roughness: 0.9, metalness: 0, transparent: true, opacity: 0.82, side: THREE.DoubleSide });
    for (const sx of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.62), mat);
      wing.position.set(sx * 0.5, 1.5, -0.12);
      wing.rotation.set(0, sx * 0.5, sx * 0.3);
      g.add(wing);
    }
    this._wings = g;
    this.bot.visual.add(g);
  }

  /** Turn this zombie into the Gravekeeper: hooded robe, a SKULL head, a scythe. */
  _buildBoss() {
    this._bossBuilt = true;
    this._isBossModel = true;
    const v = this.bot.visual;
    // move the head hitbox to the skull (which sits forward/up of the agent head)
    this.bot.colliders.head.position.set(0, 1.9, 0.16);
    // hide the agent head/visor under the hood (the skull replaces it)
    this.bot.bodyMat.color.set(0x16180f);
    this.bot.headMat.color.set(0x14140d);
    this.bot.visorMat.emissiveIntensity = 0;
    const robe = new THREE.MeshStandardMaterial({ color: 0x0e1016, roughness: 0.97, metalness: 0 });
    const bone = new THREE.MeshStandardMaterial({ color: 0xd8d2bc, roughness: 0.75, metalness: 0.05 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x04050a, roughness: 1 });
    const eye = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x66ff88, emissiveIntensity: 2.6 });

    // heavy robe (shoulders -> floor) + mantle + beefy shoulder pads
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 1.32, 2.1, 18), robe); r.position.y = 1.05; r.castShadow = true; v.add(r);
    const mantle = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.98, 0.55, 18), robe); mantle.position.y = 1.72; v.add(mantle);
    for (const dx of [-0.62, 0.62]) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), robe);
      s.position.set(dx, 1.78, 0); v.add(s);
    }
    // hood draped over the top/back, shifted BACK so the skull face is exposed
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.0, 16), robe); hood.position.set(0, 2.18, -0.12); v.add(hood);

    // ---- skull head (protrudes from the hood) ----
    const sk = new THREE.Group(); sk.position.set(0, 1.9, 0.16); v.add(sk);
    const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 14), bone); cranium.scale.set(1, 1.12, 1.15); cranium.castShadow = true; sk.add(cranium);
    for (const dx of [-0.21, 0.21]) sk.add(this._at(new THREE.SphereGeometry(0.1, 8, 8), bone, dx, -0.04, 0.12)); // cheekbones
    sk.add(this._at(new THREE.BoxGeometry(0.44, 0.06, 0.1), bone, 0, 0.17, 0.24));      // brow ridge
    for (const dx of [-0.12, 0.12]) {
      sk.add(this._at(new THREE.SphereGeometry(0.1, 10, 8), dark, dx, 0.03, 0.22));     // deep eye socket
      sk.add(this._at(new THREE.SphereGeometry(0.055, 8, 8), eye, dx, 0.03, 0.26));     // glowing eye
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 4), dark); nose.position.set(0, -0.05, 0.3); sk.add(nose);
    sk.add(this._at(new THREE.BoxGeometry(0.36, 0.14, 0.24), bone, 0, -0.23, 0.16));    // jaw
    for (let i = 0; i < 7; i++) sk.add(this._at(new THREE.BoxGeometry(0.035, 0.075, 0.035), dark, -0.15 + i * 0.05, -0.17, 0.3)); // teeth gaps

    // bony hands
    for (const dx of [-0.52, 0.52]) sk.parent && v.add(this._at(new THREE.SphereGeometry(0.15, 10, 8), bone, dx, 0.82, 0.12));

    // scythe on the weapon holder
    const holder = this.bot.parts.weaponHolder;
    if (holder) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.0, 8), bone); pole.position.set(0, 0.6, 0); holder.add(pole);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 1.3), bone); blade.position.set(0, 1.95, 0.6); blade.rotation.x = 0.5; holder.add(blade);
    }
  }

  _at(geo, mat, x, y, z) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; }

  hide() { this.bot.hide(); }

  update(dt) {
    this._t += dt;
    this.bot.update(dt); // animation + rise/death
    if (this._wings && this._wings.visible) { // flap
      const f = Math.sin(this._t * 16) * 0.5;
      this._wings.children[0].rotation.z = 0.3 + f;
      this._wings.children[1].rotation.z = -0.3 - f;
    }
    if (!this.bot.alive || this.bot.state !== 'alive') return;
    if (this.attackCd > 0) this.attackCd -= dt;

    const b = this.bot.root.position;
    const p = this.player.position;
    const dist = Math.hypot(p.x - b.x, p.z - b.z);
    this.bot.root.rotation.y = Math.atan2(p.x - b.x, p.z - b.z); // face the player

    this._navigate(dt, dist);

    // bite on contact
    const reach = this.meleeRange * this.bot.root.scale.x;
    if (dist <= reach && this.attackCd <= 0 && this.player.alive) {
      this.attackCd = this.isBoss ? 1.5 : (this.variant === 'flyer' ? 0.8 : 1.0);
      this.bot.flinch = 0.14; // little lunge
      this.onDamagePlayer(this.meleeDmg);
      bus.emit(EV.ZOMBIE_ATTACK, { boss: this.isBoss });
    }
  }

  _navigate(dt, dist) {
    const b = this.bot.root.position;
    const p = this.player.position;
    const tox = p.x - b.x, toz = p.z - b.z;
    const tl = Math.hypot(tox, toz) || 1;
    const nx = tox / tl, nz = toz / tl;

    let mvx = nx, mvz = nz;
    // gentle strafe wobble so a horde doesn't perfectly stack
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) { this.strafeTimer = 0.5 + Math.random(); if (Math.random() < 0.4) this.strafeDir *= -1; }
    mvx += -nz * this.strafeDir * 0.22;
    mvz += nx * this.strafeDir * 0.22;

    const stop = this.meleeRange * 0.9 * this.bot.root.scale.x;
    if (dist < stop) { mvx = 0; mvz = 0; }

    const ml = Math.hypot(mvx, mvz);
    if (ml > 1e-3) { mvx /= ml; mvz /= ml; }
    b.x += mvx * this.moveSpeed * dt;
    b.z += mvz * this.moveSpeed * dt;
    this._avoid(b);

    // settle to ground, or rise + hover for flyers
    let ty = this.flyHeight;
    if (this.variant === 'flyer') ty += Math.sin(this._t * 3) * 0.18;
    b.y += (ty - b.y) * Math.min(1, dt * 3);

    this.bot.strafeMax = this.moveSpeed;
    this.bot.strafeVel = ml > 0.01 ? this.moveSpeed * this.strafeDir : 0;
  }

  _avoid(b) {
    const r = 0.5 * this.bot.root.scale.x;
    for (const box of this.world.boxes) {
      if (box.maxY <= 0.5) continue;
      if (box.minY > 2.0) continue; // overhead — walk under it
      if (b.x < box.minX - r || b.x > box.maxX + r || b.z < box.minZ - r || b.z > box.maxZ + r) continue;
      const cx = Math.max(box.minX, Math.min(b.x, box.maxX));
      const cz = Math.max(box.minZ, Math.min(b.z, box.maxZ));
      const dx = b.x - cx, dz = b.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (r - d) / d;
        b.x += dx * push; b.z += dz * push;
      }
    }
    const bd = this.world.bounds;
    b.x = Math.max(bd.minX + 1.2, Math.min(bd.maxX - 1.2, b.x));
    b.z = Math.max(bd.minZ + 1.2, Math.min(bd.maxZ - 1.2, b.z));
    // y handled by the caller (ground settle / flyer hover)
  }
}

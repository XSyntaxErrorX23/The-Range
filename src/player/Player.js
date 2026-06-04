import * as THREE from 'three';
import { bus, EV } from '../core/events.js';

/**
 * Player state + a simple third-person body mesh (hidden in first-person).
 * Position is at the feet; the eye sits `eyeHeight` above it.
 */
export class Player {
  constructor(scene) {
    this.position = new THREE.Vector3(0, 0, -6); // start behind the firing line
    this.velocity = new THREE.Vector3();
    this.grounded = true;
    this.crouching = false;

    // combat state (only damaged in skirmish mode; full HP otherwise)
    this.maxHealth = 100;
    this.health = 100;
    this.armor = 0;
    this.alive = true;

    this.radius = 0.4;
    this.standHeight = 1.8;
    this.eyeStand = 1.65;
    this.eyeCrouch = 1.05;
    this.eyeHeight = this.eyeStand;

    this.body = this._buildBody();
    this.body.visible = false; // first-person is default
    scene.add(this.body);

    this._eye = new THREE.Vector3();
  }

  _buildBody() {
    const g = new THREE.Group();
    const suit = new THREE.MeshStandardMaterial({ color: 0x2f8f80, roughness: 0.6, metalness: 0.2 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x21343a, roughness: 0.7, metalness: 0.3 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xdde7e4, roughness: 0.55 });
    const visor = new THREE.MeshStandardMaterial({ color: 0x12313a, roughness: 0.25, metalness: 0.6, emissive: 0x46e0d6, emissiveIntensity: 0.5 });

    const m = (geo, mat, x, y, z, cast = true) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      if (cast) mesh.castShadow = true;
      g.add(mesh);
      return mesh;
    };

    // boots / base
    m(new THREE.CylinderGeometry(0.36, 0.42, 0.07, 20), dark, 0, 0.035, 0, false);
    // legs + boots
    m(new THREE.CylinderGeometry(0.12, 0.1, 0.9, 10), dark, -0.14, 0.5, 0);
    m(new THREE.CylinderGeometry(0.12, 0.1, 0.9, 10), dark, 0.14, 0.5, 0);
    m(new THREE.BoxGeometry(0.18, 0.1, 0.3), dark, -0.14, 0.06, 0.06);
    m(new THREE.BoxGeometry(0.18, 0.1, 0.3), dark, 0.14, 0.06, 0.06);
    // pelvis + torso + chest plate + belt
    m(new THREE.BoxGeometry(0.4, 0.22, 0.3), dark, 0, 1.0, 0);
    m(new THREE.CapsuleGeometry(0.29, 0.5, 6, 16), suit, 0, 1.4, 0);
    m(new THREE.BoxGeometry(0.48, 0.42, 0.16), suit, 0, 1.44, 0.2);
    m(new THREE.BoxGeometry(0.44, 0.08, 0.32), visor, 0, 1.15, 0);
    // shoulders + arms + hands
    m(new THREE.SphereGeometry(0.15, 12, 10), suit, -0.38, 1.6, 0);
    m(new THREE.SphereGeometry(0.15, 12, 10), suit, 0.38, 1.6, 0);
    m(new THREE.CylinderGeometry(0.1, 0.08, 0.7, 10), suit, -0.4, 1.25, 0);
    m(new THREE.CylinderGeometry(0.1, 0.08, 0.7, 10), suit, 0.4, 1.25, 0);
    m(new THREE.SphereGeometry(0.09, 10, 8), dark, -0.4, 0.9, 0);
    m(new THREE.SphereGeometry(0.09, 10, 8), dark, 0.4, 0.9, 0);
    // neck + head + helmet + visor
    m(new THREE.CylinderGeometry(0.08, 0.1, 0.13, 10), dark, 0, 1.7, 0);
    m(new THREE.SphereGeometry(0.19, 18, 14), skin, 0, 1.82, 0);
    m(new THREE.SphereGeometry(0.215, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), dark, 0, 1.84, 0);
    m(new THREE.BoxGeometry(0.28, 0.085, 0.06), visor, 0, 1.82, 0.17);

    return g;
  }

  eyePosition() {
    return this._eye.copy(this.position).setY(this.position.y + this.eyeHeight);
  }

  /** Respawn at a position with full health (skirmish round start). */
  spawnReset(pos, { armor = 0 } = {}) {
    this.position.copy(pos);
    this.velocity.set(0, 0, 0);
    this.eyeHeight = this.eyeStand;
    this.crouching = false;
    this.grounded = true;
    this.health = this.maxHealth;
    this.armor = armor;
    this.alive = true;
    this._emitHealth();
  }

  /** Apply incoming damage; armor soaks ~2/3 of it. Returns true if this kills. */
  takeDamage(dmg, head = false) {
    if (!this.alive) return false;
    let remaining = dmg;
    if (this.armor > 0) {
      const soak = Math.min(this.armor, Math.round(dmg * 0.66));
      this.armor -= soak;
      remaining -= soak;
    }
    this.health = Math.max(0, this.health - remaining);
    this._emitHealth();
    if (this.health <= 0) {
      this.alive = false;
      bus.emit(EV.PLAYER_DEAD, { byHead: head });
      return true;
    }
    return false;
  }

  _emitHealth() {
    bus.emit(EV.PLAYER_HEALTH, { health: this.health, armor: this.armor, max: this.maxHealth });
  }

  /** Keep the visible body aligned with the player (third-person only). */
  syncBody(yaw) {
    this.body.position.copy(this.position);
    this.body.rotation.y = yaw;
    const squash = this.crouching ? 0.7 : 1;
    this.body.scale.set(1, squash, 1);
  }
}

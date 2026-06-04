import * as THREE from 'three';

/**
 * Floating, bobbing power-ups for Zombie Survival. Four types (health / speed /
 * damage / ammo), each a small glowing icon over a ring. Pooled per type. The
 * owner spawns them at ground spots and calls update() with the player position;
 * on contact the onCollect(type) callback fires and the pickup hides.
 */

const TYPES = {
  health: { color: 0x4ef07a, emissive: 0x2bd45a },
  speed: { color: 0x46e0d6, emissive: 0x2dd4bf },
  damage: { color: 0xff6a3a, emissive: 0xff4655 },
  ammo: { color: 0xffd23a, emissive: 0xe0a020 },
};

export class Pickups {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.active = []; // { mesh, type, baseY, t }
    this._pool = {};  // type -> [meshes]
  }

  _make(type) {
    const def = TYPES[type];
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: def.color, emissive: def.emissive, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.3 });
    if (type === 'health') {
      g.add(this._box(0.12, 0.42, 0.12, mat));
      g.add(this._box(0.42, 0.12, 0.12, mat));
    } else if (type === 'speed') {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.42, 14), mat);
      cone.rotation.x = -Math.PI / 2; g.add(cone);
    } else if (type === 'damage') {
      g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.28), mat));
    } else { // ammo
      g.add(this._box(0.22, 0.4, 0.22, mat));
    }
    // glowing base ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 8, 24), mat);
    ring.rotation.x = Math.PI / 2; ring.position.y = -0.45;
    g.add(ring);
    g.userData.type = type;
    g.visible = false;
    this.group.add(g);
    return g;
  }

  _box(w, h, d, mat) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); }

  spawn(type, pos) {
    let pool = this._pool[type] || (this._pool[type] = []);
    let mesh = pool.find((m) => !m.visible);
    if (!mesh) { mesh = this._make(type); pool.push(mesh); }
    mesh.position.set(pos.x, pos.y + 0.9, pos.z);
    mesh.visible = true;
    this.active.push({ mesh, type, baseY: pos.y + 0.9, t: Math.random() * 6.28 });
  }

  update(dt, playerPos, onCollect) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      a.t += dt;
      a.mesh.rotation.y += dt * 1.6;
      a.mesh.position.y = a.baseY + Math.sin(a.t * 2) * 0.12;
      const dx = a.mesh.position.x - playerPos.x;
      const dz = a.mesh.position.z - playerPos.z;
      const dy = a.mesh.position.y - (playerPos.y + 1);
      if (dx * dx + dz * dz < 1.6 && Math.abs(dy) < 1.6) {
        a.mesh.visible = false;
        this.active.splice(i, 1);
        onCollect(a.type);
      }
    }
  }

  clear() {
    for (const a of this.active) a.mesh.visible = false;
    this.active.length = 0;
  }
}

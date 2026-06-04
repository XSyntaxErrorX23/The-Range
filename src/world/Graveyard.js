import * as THREE from 'three';
import { canvasTexture, concreteCanvas } from './textures.js';

/**
 * Open outdoor graveyard arena for Zombie Survival. Exposes the same collision
 * interface as Range (bounds, boxes, solids, colliderMeshes, group, enter/exit,
 * update) plus zombie-mode data: playerSpawn, zombieSpawns (perimeter), pickupSpots.
 * Built from primitives: dark ground, perimeter wall, gravestones, a crypt, dead
 * trees, and "destroyed construction" clusters (scaffolding/walls/planks/rebar)
 * you can parkour over via the shared step-up/jump collision.
 */
export class Graveyard {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this.bounds = { minX: -30, maxX: 30, minZ: -30, maxZ: 30 };
    this.boxes = [];
    this.colliderMeshes = [];
    this.solids = [];

    this.playerSpawn = new THREE.Vector3(0, 0, -16);
    this.zombieSpawns = [];
    this.pickupSpots = [];

    this._t = 0;
    this._lanterns = [];

    this.mat = {
      ground: new THREE.MeshStandardMaterial({ map: canvasTexture(concreteCanvas(), 16, 16), color: 0x4a5240, roughness: 1, metalness: 0 }),
      wall: new THREE.MeshStandardMaterial({ color: 0x3b3f44, roughness: 0.95, metalness: 0 }),
      stone: new THREE.MeshStandardMaterial({ color: 0x6b6f74, roughness: 0.9, metalness: 0.05 }),
      darkstone: new THREE.MeshStandardMaterial({ color: 0x45484d, roughness: 0.92 }),
      concrete: new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.9 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x53381f, roughness: 0.85 }),
      rebar: new THREE.MeshStandardMaterial({ color: 0x70513a, roughness: 0.6, metalness: 0.7 }),
      bark: new THREE.MeshStandardMaterial({ color: 0x2c241b, roughness: 0.95 }),
      lantern: new THREE.MeshStandardMaterial({ color: 0xffcf6e, emissive: 0xffb347, emissiveIntensity: 1.2, roughness: 0.5 }),
    };

    this._build();
  }

  _box(w, h, d, x, y, z, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    return m;
  }

  _cyl(rt, rb, len, x, y, z, mat, seg = 12) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, len, seg), mat);
    m.position.set(x, y, z);
    return m;
  }

  _add(mesh, { collide = false, occlude = false, solid = false, penetrable = false } = {}) {
    this.group.add(mesh);
    if (penetrable) mesh.userData.penetrable = true;
    if (occlude) this.colliderMeshes.push(mesh);
    if (solid) this.solids.push(mesh);
    if (collide) {
      mesh.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(mesh);
      this.boxes.push({
        minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y, minZ: box.min.z, maxZ: box.max.z,
      });
    }
    return mesh;
  }

  _build() {
    const b = this.bounds;
    // ground
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), this.mat.ground);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this._add(ground, { solid: true });

    // perimeter cemetery wall (visual; bounds-clamp handles blocking)
    const t = 0.6, h = 4;
    for (const [x, z, w, d] of [
      [0, b.minZ, 60, t], [0, b.maxZ, 60, t], [b.minX, 0, t, 60], [b.maxX, 0, t, 60],
    ]) {
      const wall = this._box(w, h, d, x, h / 2, z, this.mat.wall);
      wall.receiveShadow = true;
      this._add(wall, { solid: true, occlude: true });
    }

    // gravestones — slabs + a few crosses, scattered
    const grave = (x, z, cross) => {
      this._add(this._box(0.9, 0.15, 0.6, x, 0.075, z, this.mat.darkstone), { solid: true }); // base
      if (cross) {
        this._add(this._box(0.18, 1.3, 0.18, x, 0.65, z, this.mat.stone), { collide: true, solid: true, occlude: true });
        this._add(this._box(0.7, 0.18, 0.18, x, 1.05, z, this.mat.stone), { solid: true });
      } else {
        const slab = this._box(0.8, 1.1, 0.22, x, 0.55, z, this.mat.stone);
        slab.castShadow = true; slab.receiveShadow = true;
        this._add(slab, { collide: true, solid: true, occlude: true });
      }
    };
    const graves = [
      [-8, -6, 0], [-5, -9, 1], [-11, -3, 0], [-7, 2, 0], [-13, 5, 1], [-4, 7, 0],
      [9, -7, 1], [6, -10, 0], [12, -4, 0], [8, 3, 0], [13, 6, 1], [5, 9, 0],
      [-2, 12, 0], [3, 14, 1], [-10, 14, 0], [11, 13, 0], [-15, -10, 0], [15, -11, 1],
      [-18, 4, 0], [18, 2, 0], [0, -22, 0], [-6, 20, 1], [7, 20, 0],
    ];
    for (const [x, z, c] of graves) grave(x, z, c);

    // crypt / mausoleum (corner building — cover, not climbable)
    this._buildCrypt(-22, -20);

    // destroyed construction clusters (parkour)
    this._buildConstruction(16, 16);
    this._buildConstruction(-20, 18);
    this._buildConstruction(20, -18);

    // dead trees (decorative trunks, collidable)
    for (const [x, z] of [[-24, 10], [22, 22], [-14, -22], [24, -6], [-2, 24]]) this._deadTree(x, z);

    // glowing lanterns on a few wall posts (atmosphere)
    for (const [x, z] of [[b.minX + 1, -8], [b.maxX - 1, 8], [-8, b.minZ + 1], [8, b.maxZ - 1]]) {
      this._add(this._cyl(0.12, 0.12, 3, x, 1.5, z, this.mat.bark, 8), { solid: true });
      const lamp = this._box(0.3, 0.4, 0.3, x, 3.1, z, this.mat.lantern);
      this.group.add(lamp);
      this._lanterns.push({ mat: lamp.material, base: 1.2, phase: Math.random() * 6.28 });
    }

    // zombie spawn points around the perimeter (inside the wall)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      this.zombieSpawns.push(new THREE.Vector3(Math.cos(a) * 26, 0, Math.sin(a) * 26));
    }
    // pickup spots spread around the centre area
    this.pickupSpots = [
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(-10, 0, 8), new THREE.Vector3(10, 0, 8),
      new THREE.Vector3(-8, 0, -8), new THREE.Vector3(8, 0, -8), new THREE.Vector3(0, 0, 12),
      new THREE.Vector3(-16, 0, -2), new THREE.Vector3(16, 0, 2),
    ];
  }

  _buildCrypt(x, z) {
    const m = this.mat.darkstone;
    const W = 7, D = 6, H = 3.4;
    // walls (leave a front opening facing centre, +Z/+X)
    this._add(this._box(W, H, 0.5, x, H / 2, z - D / 2, m), { collide: true, solid: true, occlude: true }); // back
    this._add(this._box(0.5, H, D, x - W / 2, H / 2, z, m), { collide: true, solid: true, occlude: true }); // left
    this._add(this._box(0.5, H, D, x + W / 2, H / 2, z, m), { collide: true, solid: true, occlude: true }); // right
    this._add(this._box(2, H, 0.5, x - 2.5, H / 2, z + D / 2, m), { collide: true, solid: true, occlude: true }); // front-left
    this._add(this._box(2, H, 0.5, x + 2.5, H / 2, z + D / 2, m), { collide: true, solid: true, occlude: true }); // front-right
    // roof
    const roof = this._box(W + 0.8, 0.5, D + 0.8, x, H + 0.25, z, this.mat.stone);
    roof.castShadow = true;
    this._add(roof, { solid: true });
    this._add(this._box(W + 1.2, 0.4, D + 1.2, x, H + 0.6, z, m), { solid: true }); // cap
  }

  /** A pile of broken construction: stepped scaffold boxes, a leaning wall, planks, rebar. */
  _buildConstruction(x, z) {
    const con = this.mat.concrete, wood = this.mat.wood, rebar = this.mat.rebar;
    // stepped concrete blocks — jump/climb up
    const steps = [[0, 0, 0.7], [1.4, 0, 1.4], [2.8, 0.4, 2.1], [1.4, 1.8, 2.8]];
    for (const [dx, dz, top] of steps) {
      const m = this._box(1.6, top + 0.5, 1.6, x + dx, (top + 0.5) / 2, z + dz, con);
      m.castShadow = true; m.receiveShadow = true;
      this._add(m, { collide: true, solid: true, occlude: true });
    }
    // a broken/leaning wall (cover)
    const wall = this._box(0.4, 2.6, 3.6, x - 2.2, 1.3, z + 1, con);
    this._add(wall, { collide: true, solid: true, occlude: true, penetrable: true });
    // planks bridging up (light cover, penetrable)
    this._add(this._box(2.6, 0.16, 0.5, x + 0.6, 1.0, z - 1.2, wood), { collide: true, solid: true, penetrable: true });
    this._add(this._box(0.5, 0.16, 2.4, x + 2.2, 1.4, z - 0.2, wood), { collide: true, solid: true, penetrable: true });
    // rebar (decorative spikes)
    for (let i = 0; i < 4; i++) {
      const r = this._cyl(0.05, 0.05, 1.6 + Math.random(), x - 2 + i * 0.4, 0.9, z - 2, rebar, 6);
      r.rotation.z = (Math.random() - 0.5) * 0.4;
      this._add(r, { solid: true });
    }
  }

  _deadTree(x, z) {
    const trunk = this._cyl(0.25, 0.4, 4.5, x, 2.25, z, this.mat.bark, 8);
    trunk.castShadow = true;
    this._add(trunk, { collide: true, solid: true, occlude: true });
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const branch = this._cyl(0.06, 0.12, 1.8, x + Math.cos(a) * 0.5, 3.5 + Math.random(), z + Math.sin(a) * 0.5, this.mat.bark, 5);
      branch.rotation.z = (Math.random() - 0.5) * 1.6;
      branch.rotation.y = a;
      this._add(branch, { solid: true });
    }
  }

  /** Night atmosphere — called by Game on world swap. */
  enter(scene, lights) {
    scene.background = new THREE.Color(0x0b0e15);
    scene.fog = new THREE.Fog(0x121622, 12, 64);
    if (lights) {
      lights.sun.color.set(0x9fb6e0); lights.sun.intensity = 0.55; // moonlight
      lights.sun.position.set(-22, 28, -12); lights.sun.target.position.set(0, 0, 0);
      lights.hemi.color.set(0x3a4a6a); lights.hemi.groundColor.set(0x0a0a0c); lights.hemi.intensity = 0.42;
      lights.amb.color.set(0x12151f); lights.amb.intensity = 0.32;
    }
  }
  exit() {}

  update(dt) {
    this._t += dt;
    for (const l of this._lanterns) {
      l.mat.emissiveIntensity = l.base * (0.7 + 0.3 * Math.sin(this._t * 5 + l.phase) * Math.random());
    }
  }
}

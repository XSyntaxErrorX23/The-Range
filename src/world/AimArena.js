import * as THREE from 'three';

/**
 * Small enclosed arena for the Aim Trainer (gridshot). Clean "studio" box room —
 * a limited, distraction-free space so it's all about flicking to the orbs.
 * Exposes the same collision interface as Range/Graveyard (bounds, boxes, solids,
 * colliderMeshes, group, enter/exit, update). The orb plane (AimTrainer) sits just
 * in front of the back wall at z≈14; the room is sized to frame it.
 */
export class AimArena {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    // tight play area: player stands near z=2, orbs fill the wall at z=14
    this.bounds = { minX: -9, maxX: 9, minZ: -4, maxZ: 16 };
    this.boxes = [];
    this.colliderMeshes = [];
    this.solids = [];
    this.laneSpawns = []; // unused in aim mode, present for interface parity
    this.playerSpawn = new THREE.Vector3(0, 0, 2);

    this._t = 0;
    this._accents = [];

    this.mat = {
      floor: new THREE.MeshStandardMaterial({ color: 0x20262e, roughness: 0.85, metalness: 0.05 }),
      wall: new THREE.MeshStandardMaterial({ color: 0x2b323c, roughness: 0.9, metalness: 0.04 }),
      target: new THREE.MeshStandardMaterial({ color: 0x161b22, roughness: 0.95, metalness: 0 }),
      ceil: new THREE.MeshStandardMaterial({ color: 0x171b21, roughness: 1 }),
      accent: new THREE.MeshStandardMaterial({ color: 0x0a1a1c, emissive: 0x46e0d6, emissiveIntensity: 1.1, roughness: 0.4 }),
    };

    this._build();
  }

  _box(w, h, d, x, y, z, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    return m;
  }

  _add(mesh, { collide = false, occlude = false, solid = false } = {}) {
    this.group.add(mesh);
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
    const W = b.maxX - b.minX;   // 18
    const D = b.maxZ - b.minZ;   // 20
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const H = 5;
    const t = 0.5;

    // floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), this.mat.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.receiveShadow = true;
    this._add(floor, { solid: true });

    // ceiling
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), this.mat.ceil);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(cx, H, cz);
    this._add(ceil, { solid: true });

    // four walls (target wall darker for orb contrast)
    const walls = [
      [cx, b.minZ - t / 2, W + t * 2, t, this.mat.wall],         // front (behind player)
      [cx, b.maxZ + t / 2, W + t * 2, t, this.mat.target],       // back (the target wall)
      [b.minX - t / 2, cz, t, D + t * 2, this.mat.wall],         // left
      [b.maxX + t / 2, cz, t, D + t * 2, this.mat.wall],         // right
    ];
    for (const [x, z, w, d, mat] of walls) {
      const wall = this._box(w, H, d, x, H / 2, z, mat);
      wall.receiveShadow = true;
      this._add(wall, { collide: true, solid: true, occlude: true });
    }

    // a subtle frame around the target wall to define the play area
    const fz = b.maxZ - 0.04;
    for (const [w, h, y] of [[W - 1, 0.12, 0.6], [W - 1, 0.12, 4.2]]) {
      this._add(this._box(w, h, 0.06, cx, y, fz, this.mat.accent));
    }
    for (const dx of [-(W / 2 - 0.5), (W / 2 - 0.5)]) {
      this._add(this._box(0.12, 3.7, 0.06, cx + dx, 2.4, fz, this.mat.accent));
    }

    // glowing floor strips: firing line + edge accents (decorative, pulse in update)
    const fl = this._box(W - 1.2, 0.04, 0.12, cx, 0.03, this.playerSpawn.z, this.mat.accent.clone());
    this._add(fl); this._accents.push({ mat: fl.material, base: 1.1, phase: 0 });
    for (const dx of [b.minX + 0.3, b.maxX - 0.3]) {
      const s = this._box(0.1, 0.04, D - 1.2, dx, 0.03, cz, this.mat.accent.clone());
      this._add(s); this._accents.push({ mat: s.material, base: 0.8, phase: Math.random() * 6.28 });
    }
  }

  /** Clean, evenly-lit studio look — called by Game on world swap. */
  enter(scene, lights) {
    scene.background = new THREE.Color(0x10141a);
    scene.fog = null;
    if (lights) {
      lights.sun.color.set(0xffffff); lights.sun.intensity = 0.7;
      lights.sun.position.set(0, 22, 6); lights.sun.target.position.set(0, 0, 10);
      lights.hemi.color.set(0xbfd0e6); lights.hemi.groundColor.set(0x1a1f26); lights.hemi.intensity = 0.95;
      lights.amb.color.set(0x3a4250); lights.amb.intensity = 0.7;
    }
  }
  exit() {}

  update(dt) {
    this._t += dt;
    for (const a of this._accents) {
      a.mat.emissiveIntensity = a.base * (0.75 + 0.25 * Math.sin(this._t * 3 + a.phase));
    }
  }
}

import * as THREE from 'three';
import { canvasTexture, concreteCanvas, crateCanvas } from './textures.js';

/**
 * A small symmetrical 5v5 arena inspired by Nuketown: two facing houses at the
 * north/south ends with a doorway + porch, a central yard with cars, crates and
 * low walls for cover, and a perimeter fence. Same collision interface as the
 * other worlds (bounds, boxes, solids, colliderMeshes, group, enter/exit, update)
 * plus team data: allySpawns / enemySpawns.
 */
export class Nuketown {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this.bounds = { minX: -15, maxX: 15, minZ: -23, maxZ: 23 };
    this.boxes = [];
    this.colliderMeshes = [];
    this.solids = [];
    this.laneSpawns = [];
    this.allySpawns = [];   // south house (player team), facing +Z
    this.enemySpawns = [];  // north house, facing -Z
    this.spawnPoints = [];  // open positions across the whole map (random respawns)

    this.mat = {
      ground: new THREE.MeshStandardMaterial({ map: canvasTexture(concreteCanvas(), 12, 18), color: 0x8a8275, roughness: 1, metalness: 0 }),
      wallA: new THREE.MeshStandardMaterial({ color: 0xc2b487, roughness: 0.92 }),     // tan house (ally)
      wallB: new THREE.MeshStandardMaterial({ color: 0xb6c0c8, roughness: 0.92 }),     // blue-grey house (enemy)
      roofA: new THREE.MeshStandardMaterial({ color: 0x7c5a3a, roughness: 0.9 }),
      roofB: new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.9 }),
      fence: new THREE.MeshStandardMaterial({ color: 0x6a6f74, roughness: 0.85, metalness: 0.3 }),
      car: new THREE.MeshStandardMaterial({ color: 0xc8a13a, roughness: 0.45, metalness: 0.6 }),
      car2: new THREE.MeshStandardMaterial({ color: 0x9a3b3b, roughness: 0.45, metalness: 0.6 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x223036, roughness: 0.2, metalness: 0.6, transparent: true, opacity: 0.6 }),
      crate: new THREE.MeshStandardMaterial({ map: canvasTexture(crateCanvas(), 1, 1), color: 0x9a7b4a, roughness: 0.8 }),
      accent: new THREE.MeshStandardMaterial({ color: 0x0a1a1c, emissive: 0x46e0d6, emissiveIntensity: 0.9, roughness: 0.4 }),
    };

    this._build();
  }

  _box(w, h, d, x, y, z, mat) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; }

  _add(mesh, { collide = false, occlude = false, solid = false } = {}) {
    this.group.add(mesh);
    if (occlude) this.colliderMeshes.push(mesh);
    if (solid) this.solids.push(mesh);
    if (collide) {
      mesh.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(mesh);
      this.boxes.push({ minX: b.min.x, maxX: b.max.x, minY: b.min.y, maxY: b.max.y, minZ: b.min.z, maxZ: b.max.z });
    }
    return mesh;
  }

  _wall(w, h, d, x, y, z, mat) {
    const m = this._box(w, h, d, x, y, z, mat);
    m.castShadow = true; m.receiveShadow = true;
    return this._add(m, { collide: true, solid: true, occlude: true });
  }

  _build() {
    const b = this.bounds;
    // ground
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(34, 50), this.mat.ground);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    this._add(ground, { solid: true });

    // perimeter fence (visual; bounds clamp blocks the player)
    const ft = 0.4, fh = 3;
    for (const [x, z, w, d] of [[0, b.minZ, 30, ft], [0, b.maxZ, 30, ft], [b.minX, 0, ft, 46], [b.maxX, 0, ft, 46]]) {
      this._wall(w, fh, d, x, fh / 2, z, this.mat.fence);
    }

    // the two houses (door + porch face the centre)
    this._house(-15, +1, this.mat.wallA, this.mat.roofA, this.allySpawns);
    this._house(+15, -1, this.mat.wallB, this.mat.roofB, this.enemySpawns);

    // central yard cover ------------------------------------------------
    // two cars flanking the centre
    this._car(-6, -1.5, this.mat.car);
    this._car(6, 1.5, this.mat.car2);
    // low central wall (shoot over / crouch behind)
    this._wall(0.5, 1.2, 5, 0, 0.6, 0, this.mat.fence);
    this._add(this._box(0.6, 0.06, 5, 0, 1.24, 0, this.mat.accent), { solid: true });
    // crate clusters mid-map
    for (const [x, z, sgn] of [[-9, 4, 1], [9, -4, 1], [-3, 7, 1], [3, -7, 1]]) {
      this._wall(1.4, 1.4, 1.4, x, 0.7, z, this.mat.crate);
      if (sgn) this._wall(1.2, 1.2, 1.2, x + 1.3, 0.6, z + 0.4, this.mat.crate);
    }
    // short side walls breaking the long lanes
    this._wall(0.5, 2.4, 4, -11, 1.2, -3, this.mat.fence);
    this._wall(0.5, 2.4, 4, 11, 1.2, 3, this.mat.fence);
    this._wall(4, 2.4, 0.5, -6, 1.2, 8, this.mat.fence);
    this._wall(4, 2.4, 0.5, 6, 1.2, -8, this.mat.fence);

    // open spawn positions spread across the whole map (for random respawns)
    for (const [x, z] of [
      [-4, -17], [0, -18], [4, -17],        // ally house
      [-4, 17], [0, 18], [4, 17],           // enemy house
      [-13, -12], [-13, -2], [-13, 8], [-13, 16], // west lane
      [13, -12], [13, -2], [13, 8], [13, 16],     // east lane
      [-3, -9], [3, -9], [-3, 9], [3, 9],   // yard near the doorways
      [-10, 4], [10, -4],                    // yard flanks
    ]) this.spawnPoints.push(new THREE.Vector3(x, 0, z));
  }

  /** A house at centre z=cz with the doorway/porch facing the map centre (dir = +1 means door on +Z). */
  _house(cz, dir, wallMat, roofMat, spawns) {
    const HW = 7, HD = 9, HH = 3.6, t = 0.5;
    const front = cz + dir * (HD / 2); // wall facing centre
    const back = cz - dir * (HD / 2);

    // back wall (solid) + side walls
    this._wall(HW * 2 + t, HH, t, 0, HH / 2, back, wallMat);
    for (const sx of [-HW, HW]) this._wall(t, HH, HD, sx, HH / 2, cz, wallMat);
    // front wall: two segments leaving a central doorway
    const door = 2.6;
    const segW = (HW - door / 2);
    this._wall(segW, HH, t, -(door / 2 + segW / 2), HH / 2, front, wallMat);
    this._wall(segW, HH, t, (door / 2 + segW / 2), HH / 2, front, wallMat);
    // lintel above the door (overhead only — solid for shots, but NOT a nav blocker)
    this._add(this._box(door + 0.4, HH - 2.4, t, 0, HH - (HH - 2.4) / 2, front, wallMat), { solid: true, occlude: true });
    // flat roof (overhead — solid, not collidable)
    const roof = this._box(HW * 2 + 1, 0.4, HD + 1, 0, HH + 0.2, cz, roofMat);
    roof.castShadow = true; this._add(roof, { solid: true });
    // raised porch slab toward the centre
    this._add(this._box(HW * 2, 0.2, 2.4, 0, 0.1, front + dir * 1.4, roofMat), { solid: true });

    // interior cover: a counter + a crate
    this._wall(3.2, 1.0, 0.6, -2.5, 0.5, cz + dir * 1.5, this.mat.crate);
    this._wall(1.3, 1.3, 1.3, 3.5, 0.65, cz - dir * 1.5, this.mat.crate);

    // team spawn points (inside, spread across the back)
    for (const x of [-4.5, -2.2, 0, 2.2, 4.5]) spawns.push(new THREE.Vector3(x, 0, cz - dir * 2.6));
  }

  _car(x, z, mat) {
    const body = this._box(2.0, 0.7, 4.4, x, 0.85, z, mat);
    body.castShadow = true; this._add(body, { collide: true, solid: true, occlude: true });
    this._add(this._box(1.7, 0.6, 2.2, x, 1.5, z - 0.2, this.mat.glass), { solid: true }); // cabin
    for (const [dx, dz] of [[-0.85, -1.6], [0.85, -1.6], [-0.85, 1.6], [0.85, 1.6]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 16), this.mat.fence);
      w.rotation.z = Math.PI / 2; w.position.set(x + dx, 0.42, z + dz); this._add(w, { solid: true });
    }
  }

  enter(scene, lights) {
    scene.background = new THREE.Color(0xb9c4cc);
    scene.fog = new THREE.Fog(0xb9c4cc, 40, 110);
    if (lights) {
      lights.sun.color.set(0xfff4e0); lights.sun.intensity = 1.15;
      lights.sun.position.set(10, 22, -8); lights.sun.target.position.set(0, 0, 0);
      lights.hemi.color.set(0xdfeaf2); lights.hemi.groundColor.set(0x9a8f7a); lights.hemi.intensity = 0.7;
      lights.amb.color.set(0x3a4048); lights.amb.intensity = 0.35;
    }
  }
  exit() {}
  update() {}
}

import * as THREE from 'three';
import { Scoreboard } from './scoreboard.js';
import {
  canvasTexture, concreteCanvas, plasterCanvas, woodCanvas,
  metalCanvas, crateCanvas, bumpCanvas, accuracyTargetCanvas, rulerCanvas,
} from './textures.js';

/**
 * Builds "The Range" from primitives: tan floor with orange lane markings,
 * plaster walls, wooden roof trusses, a spawn console, a target platform,
 * crate cover, and the suspended scoreboard. Exposes collision data:
 *   bounds         — XZ play area for the player
 *   colliders      — XZ AABBs (player push-out)
 *   colliderMeshes — meshes for third-person camera occlusion
 *   solids         — meshes for bullet "miss" impact raycasts (incl. floor/walls)
 *   laneSpawns     — candidate bot positions
 */
export class Range {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.bounds = { minX: -24.6, maxX: 24.6, minZ: -11.6, maxZ: 45.6 };
    this.boxes = []; // 3D AABB colliders {minX,maxX,minY,maxY,minZ,maxZ}
    this.colliderMeshes = [];
    this.solids = [];
    this.laneSpawns = [];

    // Props live in layers: 'base' (always shown), 'practice' (range drills) and
    // 'arena' (symmetrical 1v1). setLayout() swaps which non-base layer is active.
    this._curLayer = 'base';
    this._layer = {
      base: { boxes: [], solids: [], occ: [] },
      practice: { boxes: [], solids: [], occ: [] },
      arena: { boxes: [], solids: [], occ: [] },
    };
    this.practiceGroup = new THREE.Group();
    this.arenaGroup = new THREE.Group();
    this.group.add(this.practiceGroup);
    this.group.add(this.arenaGroup);
    this.layout = 'practice';

    // animated "life" (updated each frame via update())
    this._fans = [];
    this._flickers = [];
    this._beacons = [];
    this._lifeT = 0;

    // procedural textures (shared bump canvas, wrapped per-surface)
    const bump = bumpCanvas();
    this.mat = {
      floor: new THREE.MeshStandardMaterial({
        map: canvasTexture(concreteCanvas(), 12, 14),
        bumpMap: canvasTexture(bump, 12, 14, { srgb: false }),
        bumpScale: 0.5, roughness: 0.97, metalness: 0,
      }),
      wall: new THREE.MeshStandardMaterial({
        map: canvasTexture(plasterCanvas(), 8, 2),
        bumpMap: canvasTexture(bump, 8, 2, { srgb: false }),
        bumpScale: 0.3, roughness: 0.94, metalness: 0,
      }),
      ceiling: new THREE.MeshStandardMaterial({
        map: canvasTexture(plasterCanvas(), 10, 12), color: 0xc6bb9f, roughness: 0.96, metalness: 0,
      }),
      wood: new THREE.MeshStandardMaterial({
        map: canvasTexture(woodCanvas(), 10, 1), roughness: 0.82, metalness: 0,
      }),
      metal: new THREE.MeshStandardMaterial({
        map: canvasTexture(metalCanvas(), 3, 2), roughness: 0.42, metalness: 0.7, envMapIntensity: 1.2,
      }),
      crate: new THREE.MeshStandardMaterial({
        map: canvasTexture(crateCanvas(), 1, 1), roughness: 0.8, metalness: 0,
      }),
      accent: new THREE.MeshStandardMaterial({ color: 0x2dd4bf, roughness: 0.4, metalness: 0.3, emissive: 0x0c4f47, emissiveIntensity: 0.6, envMapIntensity: 1.2 }),
      line: new THREE.MeshBasicMaterial({ color: 0xe08a2a }),
    };

    // base structure — always present (lighting is owned by Game; see enter())
    this._buildShell();
    this._buildTrusses();
    this._buildPillars();
    this._buildLightFixtures();
    this._buildLife();
    // practice-range props (hidden in skirmish)
    this._curLayer = 'practice';
    this._buildFloorMarkings();
    this._buildStairs();
    this._buildProps();
    this._buildSpawnConsole();
    this._buildTargetZone();
    this._buildCrates();
    this._buildParkour();
    this._buildAccuracyTarget();
    // symmetrical 1v1 arena (hidden in practice)
    this._curLayer = 'arena';
    this._buildArena();
    this._curLayer = 'base';

    this.scoreboard = new Scoreboard(scene, new THREE.Vector3(0, 5.3, 30));
    this.setLayout('practice');
  }

  /** Apply this world's atmosphere (warm indoor) — called by Game on world swap. */
  enter(scene, lights) {
    scene.background = new THREE.Color(0xd8cbb0);
    scene.fog = new THREE.Fog(0xd8cbb0, 32, 85);
    if (lights) {
      lights.sun.color.set(0xfff2dd); lights.sun.intensity = 1.05;
      lights.sun.position.set(16, 18, 4); lights.sun.target.position.set(0, 0, 20);
      lights.hemi.color.set(0xfff0d8); lights.hemi.groundColor.set(0xb59a70); lights.hemi.intensity = 0.6;
      lights.amb.color.set(0x403828); lights.amb.intensity = 0.25;
    }
  }
  exit() {}

  /** Show one prop layer ('practice' | 'arena') over the base and recompute the
   *  active collision/occlusion/solid lists. Other systems read these via the
   *  world object each frame, so reassigning the arrays is safe. */
  setLayout(name) {
    this.layout = name;
    this.practiceGroup.visible = name === 'practice';
    this.arenaGroup.visible = name === 'arena';
    const L = this._layer;
    this.boxes = L.base.boxes.concat(L[name].boxes);
    this.solids = L.base.solids.concat(L[name].solids);
    this.colliderMeshes = L.base.occ.concat(L[name].occ);
  }

  _add(mesh, { collide = false, occlude = false, solid = false, penetrable = false } = {}, layer) {
    const lyr = layer || this._curLayer || 'base';
    const parent = lyr === 'practice' ? this.practiceGroup : lyr === 'arena' ? this.arenaGroup : this.group;
    parent.add(mesh);
    if (penetrable) mesh.userData.penetrable = true; // shootable-through light cover
    const L = this._layer[lyr];
    if (occlude) L.occ.push(mesh);
    if (solid) L.solids.push(mesh);
    if (collide) {
      mesh.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(mesh);
      L.boxes.push({
        minX: box.min.x, maxX: box.max.x,
        minY: box.min.y, maxY: box.max.y,
        minZ: box.min.z, maxZ: box.max.z,
      });
    }
    return mesh;
  }

  _box(w, h, d, x, y, z, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    return m;
  }

  _buildShell() {
    const minX = -25, maxX = 25, minZ = -12, maxZ = 46, ceil = 8;
    const w = maxX - minX, d = maxZ - minZ, cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;

    // floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.mat.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.receiveShadow = true;
    this._add(floor, { solid: true });

    // ceiling
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.mat.ceiling);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(cx, ceil, cz);
    this._add(ceiling);

    // walls
    const t = 0.4;
    const left = this._box(t, ceil, d, minX, ceil / 2, cz, this.mat.wall);
    const right = this._box(t, ceil, d, maxX, ceil / 2, cz, this.mat.wall);
    const back = this._box(w, ceil, t, cx, ceil / 2, minZ, this.mat.wall);
    const front = this._box(w, ceil, t, cx, ceil / 2, maxZ, this.mat.wall);
    for (const wmesh of [left, right, back, front]) {
      wmesh.receiveShadow = true;
      this._add(wmesh, { occlude: true, solid: true });
    }
  }

  _buildFloorMarkings() {
    // two orange lane dividers running downrange + a fire line at the spawn edge
    for (const x of [-6, 6]) {
      const strip = this._box(0.16, 0.02, 44, x, 0.012, 22, this.mat.line);
      this._add(strip);
    }
    const fireLine = this._box(40, 0.02, 0.2, 0, 0.012, 0.5, this.mat.line);
    this._add(fireLine);
  }

  _cyl(rt, rb, len, x, y, z, mat, seg = 16, axis = 'y') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, len, seg), mat);
    if (axis === 'z') m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z);
    return m;
  }

  _buildTrusses() {
    // wooden A-frame roof trusses (tie beam + angled rafters + king post)
    const ridgeY = 7.85, eaveY = 6.4, half = 22;
    const rafterLen = Math.hypot(half, ridgeY - eaveY);
    const ang = Math.atan2(ridgeY - eaveY, half);
    for (let z = -8; z <= 44; z += 6.5) {
      this._add(this._box(2 * half + 2, 0.22, 0.22, 0, eaveY, z, this.mat.wood)); // tie beam
      for (const dir of [-1, 1]) {
        const r = this._box(rafterLen, 0.2, 0.22, (dir * half) / 2, (ridgeY + eaveY) / 2, z, this.mat.wood);
        r.rotation.z = -dir * ang;
        this._add(r);
      }
      this._add(this._box(0.18, ridgeY - eaveY, 0.18, 0, (ridgeY + eaveY) / 2, z, this.mat.wood)); // king post
    }
    // ridge + side purlins (longitudinal)
    for (const [x, y] of [[0, ridgeY], [-13, eaveY + 0.5], [13, eaveY + 0.5]]) {
      this._add(this._box(0.22, 0.22, 58, x, y, 17, this.mat.wood));
    }
  }

  _buildPillars() {
    for (const x of [-22.5, 22.5]) {
      for (let z = -6; z <= 42; z += 12) {
        const col = this._cyl(0.45, 0.52, 6.6, x, 3.3, z, this.mat.wall);
        col.castShadow = true; col.receiveShadow = true;
        this._add(col, { collide: true, occlude: true, solid: true });
        this._add(this._box(1.15, 0.22, 1.15, x, 6.55, z, this.mat.wood)); // capital
        this._add(this._box(1.05, 0.18, 1.05, x, 0.09, z, this.mat.wood)); // base
      }
    }
  }

  _buildStairs() {
    // climbable staircase up the right side (each 0.3 step is auto-stepped)
    const steps = 8, sw = 2.4, sh = 0.3, sd = 0.55, x0 = 20.5, z0 = 7;
    for (let i = 0; i < steps; i++) {
      this._add(this._box(sw, sh * (i + 1), sd, x0, (sh * (i + 1)) / 2, z0 + i * sd, this.mat.metal), { collide: true, solid: true });
    }
    const ly = sh * steps;
    this._add(this._box(sw + 1.4, 0.26, 3.4, x0 - 0.4, ly + 0.13, z0 + steps * sd + 1.4, this.mat.metal), { collide: true, solid: true, occlude: true });
    // railing (outer side) — posts + sloped rail
    for (let i = 0; i <= steps; i += 2) {
      this._add(this._cyl(0.04, 0.04, 1.0, x0 + sw / 2 - 0.1, sh * (i + 1) + 0.5, z0 + i * sd, this.mat.metal, 8));
    }
    const rail = this._box(0.08, 0.08, steps * sd * 1.05, x0 + sw / 2 - 0.1, (ly / 2) + 0.6, z0 + (steps * sd) / 2, this.mat.metal);
    rail.rotation.x = Math.atan2(ly, steps * sd);
    this._add(rail);
  }

  _buildLightFixtures() {
    const housing = this.mat.metal;
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff4d8, emissive: 0xfff1d4, emissiveIntensity: 1.2, roughness: 0.5 });
    for (const z of [2, 14, 26, 38]) {
      this._add(this._box(2.4, 0.2, 0.8, 0, 6.95, z, housing));
      this._add(this._box(2.1, 0.06, 0.6, 0, 6.84, z, lightMat)); // glowing panel
    }
  }

  _buildProps() {
    const ringMat = this.mat.accent;
    // (right-side barrels removed — that lane is now the accuracy range)
    const positions = [[-6, -1.5], [6, -1.5], [-15, 13], [-15, 22], [-15, 31]];
    for (const [x, z] of positions) {
      const barrel = this._cyl(0.34, 0.36, 1.1, x, 0.55, z, this.mat.metal, 18);
      barrel.castShadow = true; barrel.receiveShadow = true;
      this._add(barrel, { collide: true, occlude: true, solid: true });
      this._add(this._cyl(0.37, 0.37, 0.06, x, 0.85, z, ringMat, 18)); // accent ring
      this._add(this._cyl(0.37, 0.37, 0.06, x, 0.3, z, ringMat, 18));
    }
  }

  _buildSpawnConsole() {
    // the "SKILLS TEST" console the player starts behind
    const desk = this._box(7, 1.1, 1.5, 0, 0.55, -3, this.mat.metal);
    desk.castShadow = true;
    this._add(desk, { collide: true, occlude: true, solid: true });
    const top = this._box(7.2, 0.08, 1.7, 0, 1.12, -3, this.mat.accent);
    this._add(top, { solid: true });

    // side counters
    for (const x of [-16, 16]) {
      const counter = this._box(6, 1.0, 1.2, x, 0.5, -5, this.mat.metal);
      this._add(counter, { collide: true, occlude: true, solid: true });
    }
  }

  _buildTargetZone() {
    // low raised platform at the back (visual; bots stand on top at y = 0.3)
    const platform = this._box(34, 0.3, 6, 0, 0.15, 40, this.mat.metal);
    platform.receiveShadow = true;
    this._add(platform, { collide: true, solid: true });

    // lane spawn candidates (3 lanes × a few distances), on the floor + platform
    for (const x of [-12, -6, 0, 6, 12]) {
      for (const z of [16, 24, 32]) this.laneSpawns.push(new THREE.Vector3(x, 0, z));
    }
    for (const x of [-12, -6, 0, 6, 12]) this.laneSpawns.push(new THREE.Vector3(x, 0.3, 39));
  }

  _buildCrates() {
    const crateDefs = [
      [-9, 20, 1], [9, 26, 1], [0, 30, 1],
      [-14, 28, 1], [14, 22, 1],
      [-9, 21, 1, 1], // stacked (4th value = stack on top)
      [9, 27, 1, 1],
    ];
    for (const [x, z, s, stack] of crateDefs) {
      const y = stack ? 1.5 : 0.5;
      const crate = this._box(s, 1, s, x, y, z, this.mat.crate);
      crate.castShadow = true;
      crate.receiveShadow = true;
      this._add(crate, { collide: true, occlude: true, solid: true, penetrable: true });
    }
  }

  _buildParkour() {
    // a jump/dash course on the left side (clear of the bot lanes)
    // ascending jump boxes -> a gap to dash over -> a high ledge for Updraft
    const c = this.mat.crate;
    const defs = [
      [-18, 7, 2, 0.6, 2],   // step 1 (jump up)
      [-18, 10.5, 2, 1.1, 2], // step 2
      [-18, 14, 2.4, 1.6, 2.4], // step 3 (launch pad)
      [-18, 19.5, 2.4, 1.6, 2.4], // landing across the gap (dash/long jump)
      [-20.5, 24, 3, 3.0, 3], // high ledge — reachable with Updraft
    ];
    for (const [x, z, w, top, d] of defs) {
      const m = this._box(w, top, d, x, top / 2, z, c);
      m.castShadow = true; m.receiveShadow = true;
      this._add(m, { collide: true, occlude: true, solid: true, penetrable: true });
    }
    // a teal pad marking the launch box
    this._add(this._box(2.2, 0.04, 2.2, -18, 1.62, 14, this.mat.accent), { solid: true });
  }

  /**
   * Symmetrical 1v1 arena, mirrored across x=0 and across the centre line z=17
   * so both fighters face an identical layout. Cover crates/walls/barrels plus
   * decorative planters and a centre accent ring for some life.
   */
  _buildArena() {
    const CZ = 17; // centre line
    const crate = this.mat.crate, metal = this.mat.metal, wall = this.mat.wall;
    const foliage = new THREE.MeshStandardMaterial({ color: 0x3f7d3a, roughness: 0.85, metalness: 0 });
    const planter = new THREE.MeshStandardMaterial({ color: 0x5a4634, roughness: 0.75, metalness: 0.1 });

    const cover = (x, z, w, h, d, mat) => {
      const m = this._box(w, h, d, x, h / 2, z, mat);
      m.castShadow = true; m.receiveShadow = true;
      this._add(m, { collide: true, solid: true, occlude: true, penetrable: true });
    };
    // place a cover piece + its mirrors across x=0 and z=CZ (4-fold symmetry)
    const sym = (x, z, w, h, d, mat = crate) => {
      const xs = x === 0 ? [0] : [x, -x];
      const zs = z === CZ ? [CZ] : [z, 2 * CZ - z];
      for (const sx of xs) for (const sz of zs) cover(sx, sz, w, h, d, mat);
    };

    // NOTE: keep the centre line clear of tall blockers — both fighters spawn
    // near x=0, so a tall centre pillar would eat every straight-on shot.
    sym(0, CZ, 2.4, 0.85, 1.8, metal);      // LOW centre block: shoot over it, crouch behind
    sym(7.5, 12, 1.5, 1.5, 1.5, crate);     // quadrant crates (off the centre lane)
    sym(13, 11, 1.0, 2.0, 4.6, wall);       // tall side walls pushed to the edges
    sym(4.5, 7.5, 1.9, 0.95, 1.9, crate);   // low near-spawn cover
    sym(11, 23, 1.4, 1.5, 1.4, crate);      // mid-field crates

    // barrels flanking the centre
    const barrel = (x, z) => {
      const b = this._cyl(0.34, 0.36, 1.1, x, 0.55, z, metal, 18);
      b.castShadow = true; b.receiveShadow = true;
      this._add(b, { collide: true, solid: true, occlude: true });
      this._add(this._cyl(0.37, 0.37, 0.06, x, 0.85, z, this.mat.accent, 18), { solid: true });
    };
    barrel(9, CZ); barrel(-9, CZ);

    // decorative planters with foliage (collidable base)
    const plant = (x, z) => {
      const base = this._box(0.95, 0.6, 0.95, x, 0.3, z, planter);
      base.castShadow = true; this._add(base, { collide: true, solid: true });
      const bush = new THREE.Mesh(new THREE.SphereGeometry(0.72, 12, 10), foliage);
      bush.position.set(x, 1.12, z); bush.castShadow = true;
      this._add(bush, { solid: true });
    };
    for (const [x, z] of [[14, 8], [14, 26]]) { plant(x, z); plant(-x, z); }

    // centre accent ring on the floor
    this._add(this._cyl(3.4, 3.4, 0.04, 0, 0.02, CZ, this.mat.accent, 40), { solid: true });
  }

  /** A scored accuracy bullseye on a stand, plus a distance ruler — like the
   *  Valorant range accuracy station. The disc face is tagged for the firing
   *  raycast (userData.accuracyTarget + scoring rings). Practice layer only. */
  _buildAccuracyTarget() {
    const metal = this.mat.metal;
    const cx = 17, cy = 1.75; // dedicated lane on the right, clear of the bot lanes
    const FIRE_Z = 0.5;
    this._targetCx = cx;
    this._targetFireZ = FIRE_Z;

    // movable station (disc + plate + legs + base) — parts at LOCAL coords so the
    // whole group can be slid downrange. Solid (shootable) but not collidable, so
    // there are no stale collision boxes when it moves.
    const station = new THREE.Group();
    this.practiceGroup.add(station);
    this._targetStation = station;
    const stationSolid = (mesh, occlude = false) => {
      station.add(mesh);
      this._layer.practice.solids.push(mesh);
      if (occlude) this._layer.practice.occ.push(mesh);
    };

    stationSolid(this._box(2.8, 0.22, 1.0, 0, 0.11, 0.16, metal));     // base
    stationSolid(this._box(0.18, cy, 0.18, -1.1, cy / 2, 0.21, metal)); // legs
    stationSolid(this._box(0.18, cy, 0.18, 1.1, cy / 2, 0.21, metal));
    const plate = this._box(2.9, 2.9, 0.22, 0, cy, 0.13, metal);
    plate.castShadow = true; plate.receiveShadow = true;
    stationSolid(plate, true);

    const tex = canvasTexture(accuracyTargetCanvas(), 1, 1);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.2, 48), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05 }));
    disc.position.set(0, cy, 0);
    disc.rotation.y = Math.PI; // face the firing line (-Z)
    disc.userData.accuracyTarget = true;
    disc.userData.center = new THREE.Vector3(cx, cy, 0); // x,y used for scoring (z ignored — only z moves)
    disc.userData.rings = [[0.12, 100], [0.30, 75], [0.55, 50], [0.85, 25], [1.2, 10]];
    stationSolid(disc);

    // distance control panel near the firing line (ruler board + shootable buttons),
    // so you can pick a range right where you stand (Valorant-style).
    const panelX = 13, panelZ = 2.5;
    const rtex = canvasTexture(rulerCanvas(), 1, 1);
    const board = this._box(0.55, 2.7, 0.08, panelX, 1.5, panelZ);
    board.material = new THREE.MeshStandardMaterial({ map: rtex, roughness: 0.8 });
    board.rotation.y = Math.PI;
    this._add(board, { collide: true, solid: true });
    this._add(this._box(0.12, 1.5, 0.12, panelX, 0.75, panelZ + 0.07, metal), { collide: true, solid: true });

    // shootable distance buttons (aligned with the ruler labels) — shoot to move the target
    this._rangeButtons = [];
    const dists = [5, 10, 20, 30, 40];
    const ys = [2.64, 2.29, 1.94, 1.595, 1.247];
    for (let i = 0; i < dists.length; i++) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x46e0d6, emissive: 0x123c39, emissiveIntensity: 0.6, roughness: 0.5, metalness: 0.3 });
      const btn = this._box(0.28, 0.28, 0.08, panelX - 0.5, ys[i], panelZ - 0.08, mat);
      btn.userData.rangeButton = dists[i];
      this._add(btn, { solid: true });
      this._rangeButtons.push({ mat, distance: dists[i] });
    }

    this.setTargetDistance(20); // default 20m + highlights the active button
  }

  /** Slide the accuracy target to a distance (metres from the firing line) and
   *  highlight the matching shootable button. */
  setTargetDistance(d) {
    if (this._targetStation) this._targetStation.position.set(this._targetCx, 0, this._targetFireZ + d);
    if (this._rangeButtons) {
      for (const b of this._rangeButtons) {
        const on = b.distance === d;
        b.mat.emissive.setHex(on ? 0x46e0d6 : 0x123c39);
        b.mat.emissiveIntensity = on ? 1.1 : 0.5;
      }
    }
    this._targetDistance = d;
  }

  /** Animated decoration: spinning ceiling fans, flickering wall lamps, pulsing
   *  accent beacons. Purely visual (added straight to the base group). */
  _buildLife() {
    const fanMat = this.mat.metal;
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.6, metalness: 0.4 });
    for (const z of [4, 16, 28]) {
      const fan = new THREE.Group();
      fan.position.set(0, 6.55, z);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), fanMat);
      rod.position.y = 0.25;
      fan.add(rod);
      fan.add(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 12), fanMat));
      const blades = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const a = i * (Math.PI / 2);
        const bm = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.04, 0.34), bladeMat);
        bm.position.set(Math.cos(a) * 0.95, 0, Math.sin(a) * 0.95);
        bm.rotation.y = a;
        bm.castShadow = true;
        blades.add(bm);
      }
      fan.add(blades);
      this.group.add(fan);
      this._fans.push({ blades, speed: 2.0 + Math.random() * 1.6 });
    }

    // flickering wall lamps (each its own material to flicker independently)
    for (const [x, z] of [[-24.4, 10], [24.4, 24], [-24.4, 34]]) {
      const mat = new THREE.MeshStandardMaterial({ color: 0xfff4d8, emissive: 0xffe6b0, emissiveIntensity: 1.0, roughness: 0.5 });
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.7), mat);
      lamp.position.set(x, 3.4, z);
      this.group.add(lamp);
      this._flickers.push({ mat, base: 1.0, rate: 0.5 });
    }

    // pulsing accent beacons up on the pillars
    for (const [x, z] of [[-22.5, 18], [22.5, 18], [-22.5, 6], [22.5, 30]]) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x46e0d6, emissive: 0x46e0d6, emissiveIntensity: 1.0, roughness: 0.4, metalness: 0.3 });
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), mat);
      beacon.position.set(x, 6.2, z);
      this.group.add(beacon);
      this._beacons.push({ mat, base: 1.2, freq: 2.2 + Math.random(), phase: Math.random() * 6.28 });
    }
  }

  /** Advance animated map life. Called each frame by Game. */
  update(dt) {
    this._lifeT += dt;
    for (const f of this._fans) f.blades.rotation.y += f.speed * dt;
    for (const fl of this._flickers) {
      if (Math.random() < fl.rate * dt) fl.mat.emissiveIntensity = 0.15 + Math.random() * 0.35;
      else fl.mat.emissiveIntensity += (fl.base - fl.mat.emissiveIntensity) * Math.min(1, dt * 6);
    }
    for (const b of this._beacons) {
      b.mat.emissiveIntensity = b.base * (0.45 + 0.55 * Math.sin(this._lifeT * b.freq + b.phase));
    }
  }
}

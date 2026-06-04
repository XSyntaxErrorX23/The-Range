import * as THREE from 'three';
import { damp } from '../util/math.js';

const easeOutBack = (k) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };

/**
 * A higher-poly practice "agent" dummy built from primitives, with pivoted
 * legs/arms/head for procedural animation (idle breathing, walk cycle, hit
 * flinch, overshoot rise, tumbling death). Invisible head/body/leg colliders
 * (object.visible=true, non-rendering material) drive hit detection; BotManager
 * gates raycasting via its targetList (alive bots only).
 */
export class Bot {
  constructor(scene, id) {
    this.id = id;
    this.alive = false;
    this.state = 'idle'; // idle | rising | alive | dead
    this.health = 100;
    this.maxHealth = 100;

    this.root = new THREE.Group();
    this.root.visible = false;
    scene.add(this.root);

    this.visual = new THREE.Group();
    this.root.add(this.visual);

    // per-bot materials (so flashing one doesn't affect others)
    this.bodyMat = new THREE.MeshStandardMaterial({ color: 0xc0494b, roughness: 0.65, metalness: 0.1, emissive: 0x000000 });
    this.headMat = new THREE.MeshStandardMaterial({ color: 0xe2b5a0, roughness: 0.55, emissive: 0x000000 });
    this.darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.7, metalness: 0.3 });
    this.visorMat = new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.25, metalness: 0.6, emissive: 0xff3a48, emissiveIntensity: 0.6 });

    this.parts = {};
    this._buildVisual();
    this.colliders = this._buildColliders();

    // animation state
    this.animTime = Math.random() * 10;
    this.riseDur = 0.4;
    this.riseT = 0;
    this.deathT = 0;
    this.deathAxis = 'x';
    this.deathDir = 1;
    this.flash = 0;
    this.flinch = 0;
    this.walkPhase = Math.random() * 6.28;

    // behaviour
    this.homeX = 0;
    this.phase = 0;
    this.strafeVel = 0; // signed strafe velocity (drives walk anim)
    this.strafeMax = 1;
    this.respawnTimer = 0;
    this.lifeTimer = 0; // popup mode
  }

  _mesh(geo, mat, x, y, z, cast = true) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (cast) m.castShadow = true;
    return m;
  }

  /** A limb as a pivot group (rotates about its top joint). */
  _limb(group, jointX, jointY, radTop, radBot, len, mat) {
    const g = new THREE.Group();
    g.position.set(jointX, jointY, 0);
    const m = this._mesh(new THREE.CylinderGeometry(radTop, radBot, len, 10), mat, 0, -len / 2, 0);
    g.add(m);
    group.add(g);
    return g;
  }

  _buildVisual() {
    const v = this.visual;
    const base = this._mesh(new THREE.CylinderGeometry(0.46, 0.52, 0.08, 24), this.darkMat, 0, 0.04, 0, false);
    base.receiveShadow = true;
    v.add(base);

    // legs (pivot at hips)
    this.parts.leftLeg = this._limb(v, -0.16, 0.92, 0.13, 0.1, 0.92, this.darkMat);
    this.parts.rightLeg = this._limb(v, 0.16, 0.92, 0.13, 0.1, 0.92, this.darkMat);
    // boots
    this.parts.leftLeg.add(this._mesh(new THREE.BoxGeometry(0.18, 0.1, 0.3), this.darkMat, 0, -0.9, 0.06));
    this.parts.rightLeg.add(this._mesh(new THREE.BoxGeometry(0.18, 0.1, 0.3), this.darkMat, 0, -0.9, 0.06));

    // pelvis + torso
    v.add(this._mesh(new THREE.BoxGeometry(0.42, 0.22, 0.32), this.darkMat, 0, 1.0, 0));
    const torso = this._mesh(new THREE.CapsuleGeometry(0.3, 0.5, 6, 16), this.bodyMat, 0, 1.42, 0);
    this.parts.torso = torso;
    v.add(torso);
    // chest plate
    v.add(this._mesh(new THREE.BoxGeometry(0.5, 0.42, 0.16), this.bodyMat, 0, 1.45, 0.22));
    // belt accent
    v.add(this._mesh(new THREE.BoxGeometry(0.46, 0.08, 0.34), this.visorMat, 0, 1.16, 0));

    // shoulders + arms (pivot at shoulders)
    v.add(this._mesh(new THREE.SphereGeometry(0.16, 12, 10), this.bodyMat, -0.4, 1.62, 0));
    v.add(this._mesh(new THREE.SphereGeometry(0.16, 12, 10), this.bodyMat, 0.4, 1.62, 0));
    this.parts.leftArm = this._limb(v, -0.42, 1.6, 0.11, 0.09, 0.72, this.bodyMat);
    this.parts.rightArm = this._limb(v, 0.42, 1.6, 0.11, 0.09, 0.72, this.bodyMat);
    // hands
    this.parts.leftArm.add(this._mesh(new THREE.SphereGeometry(0.1, 10, 8), this.darkMat, 0, -0.74, 0));
    this.parts.rightArm.add(this._mesh(new THREE.SphereGeometry(0.1, 10, 8), this.darkMat, 0, -0.74, 0));

    // neck + head (pivot at neck)
    v.add(this._mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.14, 10), this.darkMat, 0, 1.72, 0));
    const headG = new THREE.Group();
    headG.position.set(0, 1.8, 0);
    headG.add(this._mesh(new THREE.SphereGeometry(0.2, 20, 16), this.headMat, 0, 0, 0));
    // helmet shell
    const helmet = this._mesh(new THREE.SphereGeometry(0.225, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), this.darkMat, 0, 0.02, 0);
    headG.add(helmet);
    // glowing visor (curved box front)
    headG.add(this._mesh(new THREE.BoxGeometry(0.3, 0.09, 0.06), this.visorMat, 0, 0.0, 0.18));
    this.parts.head = headG;
    v.add(headG);
  }

  _collider(geo, y, zone) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false }));
    m.position.y = y;
    m.userData.hitZone = zone;
    m.userData.bot = this;
    this.root.add(m); // parented to root so it tracks strafing, stays upright
    return m;
  }

  _buildColliders() {
    return {
      head: this._collider(new THREE.SphereGeometry(0.26, 10, 8), 1.8, 'head'),
      body: this._collider(new THREE.BoxGeometry(0.82, 1.0, 0.46), 1.4, 'body'),
      leg: this._collider(new THREE.BoxGeometry(0.6, 0.95, 0.4), 0.55, 'leg'),
    };
  }

  colliderMeshes() {
    return [this.colliders.head, this.colliders.body, this.colliders.leg];
  }

  spawnAt(pos, { armor = 0, life = 0 } = {}) {
    this.root.position.copy(pos);
    this.homeX = pos.x;
    this.maxHealth = 100 + armor;
    this.health = this.maxHealth;
    this.alive = true;
    this.state = 'rising';
    this.riseT = this.riseDur;
    this.deathT = 0;
    this.flash = 0;
    this.flinch = 0;
    this.strafeVel = 0;
    this.lifeTimer = life;
    this.phase = (Math.abs(Math.sin(pos.x * 12.9 + pos.z * 4.7)) * 6.28);
    this.visual.rotation.set(0, 0, 0);
    this.visual.position.set(0, 0, 0);
    this.visual.scale.set(1, 1, 1);
    this._resetPose();
    this.root.visible = true;
  }

  _resetPose() {
    if (!this.parts.leftLeg) return;
    this.parts.leftLeg.rotation.set(0, 0, 0);
    this.parts.rightLeg.rotation.set(0, 0, 0);
    this.parts.leftArm.rotation.set(0, 0, 0);
    this.parts.rightArm.rotation.set(0, 0, 0);
    this.parts.torso.rotation.set(0, 0, 0);
    this.parts.torso.scale.set(1, 1, 1);
    this.parts.head.rotation.set(0, 0, 0);
  }

  hide() {
    this.alive = false;
    this.state = 'idle';
    this.root.visible = false;
  }

  takeDamage(dmg, zone, point) {
    if (!this.alive) return false;
    this.health -= dmg;
    this.flash = 0.09;
    this.flinch = 0.14;
    if (this.health <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  die() {
    this.alive = false;
    this.state = 'dead';
    this.deathT = 0.7;
    this.deathAxis = Math.random() < 0.7 ? 'x' : 'z';
    this.deathDir = Math.random() < 0.5 ? 1 : -1;
  }

  setStrafe(time, amp = 3, speed = 1.4) {
    if (this.state !== 'alive') return;
    const arg = time * speed + this.phase;
    this.root.position.x = this.homeX + Math.sin(arg) * amp;
    this.strafeVel = Math.cos(arg) * amp * speed; // signed velocity along the path
    this.strafeMax = amp * speed;
  }

  _animateAlive(dt) {
    const t = this.animTime;
    const p = this.parts;
    // breathing
    p.torso.scale.y = 1 + Math.sin(t * 2.2) * 0.025;
    // head idle scan
    p.head.rotation.y = Math.sin(t * 0.7) * 0.13;

    // walk cycle: amplitude scales with strafe speed (no turnaround twitch); the
    // phase always advances so legs never snap. inten 0 => idle.
    const inten = this.strafeMax > 0 ? Math.min(1, Math.abs(this.strafeVel) / this.strafeMax) : 0;
    this.walkPhase += dt * 10 * (0.25 + inten);
    const s = Math.sin(this.walkPhase);
    const amp = 0.55 * inten;
    const idle = Math.sin(t * 1.4) * 0.05 * (1 - inten);
    p.leftLeg.rotation.x = s * amp;
    p.rightLeg.rotation.x = -s * amp;
    p.leftArm.rotation.x = -s * amp * 0.8 - 0.05 + idle;
    p.rightArm.rotation.x = s * amp * 0.8 - 0.05 - idle;
    const dir = Math.sign(this.strafeVel) || 0;
    this.visual.rotation.z = damp(this.visual.rotation.z, -dir * 0.13 * inten, 10, dt);

    // hit flinch (lean back briefly)
    if (this.flinch > 0) {
      this.flinch = Math.max(0, this.flinch - dt);
      const f = this.flinch / 0.14;
      p.torso.rotation.x = -0.28 * f;
      p.head.rotation.x = -0.22 * f;
    } else {
      p.torso.rotation.x = damp(p.torso.rotation.x, 0, 12, dt);
      p.head.rotation.x = damp(p.head.rotation.x, 0, 12, dt);
    }
  }

  update(dt) {
    this.animTime += dt;

    // flash decay (emissive)
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt);
      const e = this.flash > 0 ? 0.9 : 0;
      this.bodyMat.emissive.setScalar(e);
      this.headMat.emissive.setScalar(e);
    }

    if (this.state === 'alive') {
      this._animateAlive(dt);
    } else if (this.state === 'rising') {
      this.riseT = Math.max(0, this.riseT - dt);
      const k = 1 - this.riseT / this.riseDur;
      const e = easeOutBack(Math.min(1, k));
      this.visual.scale.y = 0.12 + 0.88 * e;
      this.visual.position.y = -1.7 * (1 - Math.min(1, k));
      if (this.riseT <= 0) {
        this.visual.scale.y = 1;
        this.visual.position.y = 0;
        this.state = 'alive';
      }
    } else if (this.state === 'dead') {
      this.deathT = Math.max(0, this.deathT - dt);
      const t = 1 - this.deathT / 0.7;
      this.visual.rotation[this.deathAxis] = this.deathDir * t * 1.55;
      this.visual.position.y = -0.5 * t;
      // limbs splay as it falls
      this.parts.leftArm.rotation.x = -1.1 * t;
      this.parts.rightArm.rotation.x = 1.1 * t;
      this.parts.leftLeg.rotation.x = 0.5 * t;
      this.parts.rightLeg.rotation.x = -0.4 * t;
      if (t > 0.8) this.visual.scale.setScalar(1 - (t - 0.8) / 0.2); // shrink out at the end
      if (this.deathT <= 0) this.hide();
    }
  }
}

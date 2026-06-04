import * as THREE from 'three';
import { bus, EV } from '../core/events.js';

/**
 * Pooled visual effects: bullet tracers, muzzle flash, impact sparks, surface
 * decals and floating damage numbers. Everything is pooled and reused (never
 * allocated per shot) to avoid GC stutter during rapid fire.
 */
export class FXManager {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.dmgLayer = document.getElementById('damage-layer');

    this._tmp = new THREE.Vector3();
    this._proj = new THREE.Vector3();
    this._streak = new THREE.Vector3();
    this._sp = new THREE.Vector3();
    this._aux = new THREE.Vector3();

    this._initTracers(28);
    this._initImpacts(28);
    this._initDecals(48);
    this._initMuzzle();
    this._initDamageNumbers(28);

    this._wire();
  }

  // ---------- tracers ----------
  _initTracers(n) {
    this.tracers = [];
    const mat = new THREE.LineBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0 });
    for (let i = 0; i < n; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geo, mat.clone());
      line.visible = false;
      line.frustumCulled = false;
      this.scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    this._tracerI = 0;
  }

  tracer(from, to, color = 0xfff1c4) {
    const t = this.tracers[this._tracerI];
    this._tracerI = (this._tracerI + 1) % this.tracers.length;
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    t.line.material.color.setHex(color);
    t.line.material.opacity = 0.9;
    t.line.visible = true;
    t.life = 0.06;
  }

  /** Explosion: a bright central flash + a ring of sparks (bazooka blast). */
  explosion(point, radius = 4) {
    this.impact(point, 0xffd27a);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this._aux.set(point.x + Math.cos(a) * radius * 0.5, point.y + (Math.random() - 0.3) * radius * 0.4, point.z + Math.sin(a) * radius * 0.5);
      this.impact(this._aux, i % 2 ? 0xff7a2a : 0xffb030);
    }
  }

  // ---------- impact sparks ----------
  _initImpacts(n) {
    this.impacts = [];
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const geo = new THREE.PlaneGeometry(0.16, 0.16);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, mat.clone());
      m.visible = false;
      this.scene.add(m);
      this.impacts.push({ mesh: m, life: 0 });
    }
    this._impactI = 0;
  }

  impact(point, color = 0xffd27a) {
    const it = this.impacts[this._impactI];
    this._impactI = (this._impactI + 1) % this.impacts.length;
    it.mesh.position.copy(point);
    it.mesh.material.color.setHex(color);
    it.mesh.material.opacity = 1;
    it.mesh.scale.setScalar(1);
    it.mesh.visible = true;
    it.life = 0.18;
  }

  // ---------- decals (on walls) ----------
  _initDecals(n) {
    this.decals = [];
    const mat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
    const geo = new THREE.PlaneGeometry(0.12, 0.12);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      this.scene.add(m);
      this.decals.push(m);
    }
    this._decalI = 0;
  }

  /** Clear all persistent FX (decals + any live tracers/impacts). Called on world swap
   *  so bullet holes from one map don't bleed into the next. */
  reset() {
    for (const m of this.decals) m.visible = false;
    for (const t of this.tracers) { t.line.visible = false; t.life = 0; }
    for (const it of this.impacts) { it.mesh.visible = false; it.life = 0; }
  }

  decal(point, normal) {
    if (!normal) return;
    const m = this.decals[this._decalI];
    this._decalI = (this._decalI + 1) % this.decals.length;
    m.position.copy(point).addScaledVector(normal, 0.012);
    m.lookAt(this._tmp.copy(point).add(normal));
    m.visible = true;
  }

  /** Melee scuff: a short streak of decals along the surface, plus a steely spark. */
  scratch(point, normal) {
    if (!normal) return;
    // a tangent lying in the surface (any non-parallel vector crossed with the normal)
    this._aux.set(normal.y, normal.z, normal.x);
    this._streak.crossVectors(normal, this._aux).normalize();
    for (let i = -1; i <= 1; i++) {
      this._sp.copy(point).addScaledVector(this._streak, i * 0.05);
      this.decal(this._sp, normal);
    }
    this.impact(point, 0xcfd6da);
  }

  // ---------- muzzle flash ----------
  _initMuzzle() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe39a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
    this.muzzle = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), mat);
    this.muzzle.position.set(0.28, -0.2, -0.9);
    this.muzzle.visible = false;
    this.muzzle.renderOrder = 999;
    this.camera.add(this.muzzle);
    this._muzzleT = 0;
  }

  muzzleFlash() {
    this.muzzle.material.opacity = 0.9;
    this.muzzle.rotation.z = Math.random() * Math.PI;
    this.muzzle.scale.setScalar(0.8 + Math.random() * 0.6);
    this.muzzle.visible = true;
    this._muzzleT = 0.045;
  }

  muzzleWorld(out) {
    return this.camera.localToWorld(out.set(0.28, -0.2, -0.85));
  }

  // ---------- damage numbers (DOM) ----------
  _initDamageNumbers(n) {
    this.dmgNums = [];
    if (!this.dmgLayer) return;
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = 'dmgnum';
      el.style.display = 'none';
      this.dmgLayer.appendChild(el);
      this.dmgNums.push({ el, life: 0, x: 0, y: 0, world: new THREE.Vector3() });
    }
    this._dmgI = 0;
  }

  damageNumber(point, amount, head) {
    if (!this.dmgLayer) return;
    const d = this.dmgNums[this._dmgI];
    this._dmgI = (this._dmgI + 1) % this.dmgNums.length;
    d.world.copy(point);
    d.el.textContent = String(amount);
    d.el.className = 'dmgnum' + (head ? ' head' : '');
    d.el.style.display = 'block';
    d.life = 0.7;
  }

  /** Floating gold credit gain (zombie kills). */
  creditNumber(point, amount) {
    if (!this.dmgLayer) return;
    const d = this.dmgNums[this._dmgI];
    this._dmgI = (this._dmgI + 1) % this.dmgNums.length;
    d.world.copy(point);
    d.el.textContent = '+' + amount + '¤';
    d.el.className = 'dmgnum credit';
    d.el.style.display = 'block';
    d.life = 0.85;
  }

  /** Floating accuracy-target score (cyan; gold for a bullseye). */
  scoreNumber(point, score) {
    if (!this.dmgLayer) return;
    const d = this.dmgNums[this._dmgI];
    this._dmgI = (this._dmgI + 1) % this.dmgNums.length;
    d.world.copy(point);
    d.el.textContent = '+' + score;
    d.el.className = 'dmgnum score' + (score >= 100 ? ' bull' : '');
    d.el.style.display = 'block';
    d.life = 0.9;
  }

  // ---------- update ----------
  update(dt) {
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, (t.life / 0.06) * 0.9);
        if (t.life <= 0) t.line.visible = false;
      }
    }
    for (const it of this.impacts) {
      if (it.life > 0) {
        it.life -= dt;
        const k = it.life / 0.18;
        it.mesh.material.opacity = Math.max(0, k);
        it.mesh.scale.setScalar(1 + (1 - k) * 1.5);
        it.mesh.lookAt(this.camera.position);
        if (it.life <= 0) it.mesh.visible = false;
      }
    }
    if (this._muzzleT > 0) {
      this._muzzleT -= dt;
      this.muzzle.material.opacity = Math.max(0, (this._muzzleT / 0.045) * 0.9);
      if (this._muzzleT <= 0) this.muzzle.visible = false;
    }
    // damage numbers float up + fade, projected to screen each frame
    for (const d of this.dmgNums) {
      if (d.life > 0) {
        d.life -= dt;
        this._proj.copy(d.world).project(this.camera);
        if (this._proj.z > 1) { d.el.style.display = 'none'; d.life = 0; continue; }
        const x = (this._proj.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-this._proj.y * 0.5 + 0.5) * window.innerHeight;
        const age = 1 - d.life / 0.7;
        d.el.style.left = x + 'px';
        d.el.style.top = (y - age * 42) + 'px';
        d.el.style.opacity = String(Math.max(0, 1 - age));
        if (d.life <= 0) d.el.style.display = 'none';
      }
    }
  }

  _wire() {
    const from = new THREE.Vector3();
    bus.on(EV.COMBAT_FIRED, ({ weapon }) => { if (weapon.type !== 'melee' && weapon.category !== 'special') this.muzzleFlash(); });
    bus.on(EV.COMBAT_HIT, ({ point, damage, zone, from: shotFrom, color }) => {
      if (shotFrom) this.tracer(this.muzzleWorld(from), point, color);
      this.impact(point, zone === 'head' ? 0xff5566 : 0xffd27a);
      this.damageNumber(point, damage, zone === 'head');
    });
    bus.on(EV.COMBAT_MISS, ({ point, normal, from: shotFrom, color }) => {
      if (shotFrom) this.tracer(this.muzzleWorld(from), point, color);
      this.impact(point, 0xfff0c0);
      this.decal(point, normal);
    });
    bus.on(EV.COMBAT_SPLASH, ({ point, radius }) => this.explosion(point, radius));
    bus.on(EV.COMBAT_SLASH, ({ point, normal }) => this.scratch(point, normal));
    bus.on(EV.ENEMY_FIRED, ({ from: f, to }) => this.tracer(f, to)); // incoming shot tracer
    bus.on(EV.ACCURACY_SCORE, ({ score, point }) => this.scoreNumber(point, score));
    bus.on(EV.ZOMBIE_CREDIT, ({ amount, point }) => this.creditNumber(point, amount));
  }
}

import * as THREE from 'three';
import { bus, EV } from '../core/events.js';
import { deg2rad } from '../util/math.js';
import { sprayOffset, SPRAY_RESET } from './sprayPatterns.js';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const WORLD_RIGHT = new THREE.Vector3(1, 0, 0);

// Fraction of damage that passes through light cover (wallbang), by weapon class.
// Heavier guns penetrate better; shotgun pellets mostly get stopped.
const PEN_BY_CAT = { sniper: 0.8, mg: 0.6, rifle: 0.55, sidearm: 0.4, smg: 0.4, shotgun: 0.2, melee: 0, special: 0.5 };
function penMult(w) { return PEN_BY_CAT[w.category] ?? 0.4; }

/**
 * The act of shooting: fire-rate gating, spread cone, hitscan raycast with wall
 * occlusion, multi-pellet shotguns (damage aggregated per bot), recoil and
 * combat events. Reads weapon state from WeaponManager.
 */
export class FiringController {
  constructor({ input, cameraRig, weapons, bots, world, viewModel, player }) {
    this.input = input;
    this.cameraRig = cameraRig;
    this.weapons = weapons;
    this.bots = bots;
    this.world = world;
    this.viewModel = viewModel;
    this.player = player;

    this.cooldown = 0;
    this._burst = null; // in-progress alt-fire burst { id, left, timer }
    this._sprayIndex = 0; // shot index within the current automatic spray
    this._sprayTimer = 999; // time since last shot (resets the pattern)
    this.raycaster = new THREE.Raycaster();
    this._origin = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._jit = new THREE.Vector3();
    this._u = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._hits = new Map(); // bot -> aggregated hit info (reused per shot)
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    this._sprayTimer += dt;
    if (this.player && !this.player.alive) { this._burst = null; return; } // dead in skirmish

    const wm = this.weapons;
    const w = wm.weapon;

    // advance an in-progress alt-fire burst (keeps firing after the trigger edge)
    if (this._burst) { this._updateBurst(dt, w); return; }

    if (wm.isBusy()) return;

    // alt-fire (right-click): start a burst for weapons that define one (Classic)
    if (w.altFire && this.input.altPressed() && this.cooldown <= 0) {
      this._burst = { id: wm.currentId, left: w.altFire.rounds, timer: 0 };
      this._updateBurst(dt, w); // fire the first round immediately
      return;
    }

    const wantFire = w.automatic ? this.input.fireDown() : this.input.firePressed();
    if (!wantFire || this.cooldown > 0) return;

    if (w.type === 'melee') {
      this.cooldown = 60 / w.fireRate;
      this.viewModel.triggerSwing();
      bus.emit(EV.COMBAT_FIRED, { weapon: w });
      this._melee(w);
      return;
    }

    // ammo (Blade Storm reverts instead of reloading when empty)
    const infinite = wm.infiniteAmmoActive;
    if (!infinite && wm.ammo.mag <= 0) {
      if (w.id === 'blades') { wm.revertFromBlades(); return; }
      bus.emit('weapon:empty');
      wm.startReload();
      this.cooldown = 0.25;
      return;
    }

    this.cooldown = 60 / w.fireRate;
    wm.consumeRound();
    bus.emit(EV.COMBAT_FIRED, { weapon: w });

    this._hitscan(w);

    if (w.id === 'blades') {
      this.viewModel.triggerSwing();
      if (wm.ammo.mag <= 0) wm.revertFromBlades();
    } else {
      this.cameraRig.recoverLambda = Math.max(5, w.recoil.recoverPerSec * 60);
      if (w.automatic) {
        // continuous fire -> deterministic, learnable spray pattern
        if (this._sprayTimer > SPRAY_RESET) this._sprayIndex = 0;
        const sp = sprayOffset(w, this._sprayIndex++);
        this.cameraRig.addRecoil(sp.pitch, sp.yaw);
      } else {
        // tap weapons: mostly vertical kick with a touch of random yaw
        this.cameraRig.addRecoil(w.recoil.pitchPerShot, (Math.random() - 0.5) * w.recoil.yawJitter);
        this._sprayIndex = 0;
      }
      this._sprayTimer = 0;
      this.viewModel.triggerKick(1);
    }
  }

  _jitter(dir, halfAngle, out) {
    if (halfAngle <= 0) return out.copy(dir);
    const up = Math.abs(dir.y) < 0.99 ? WORLD_UP : WORLD_RIGHT;
    this._u.crossVectors(up, dir).normalize();
    this._v.crossVectors(dir, this._u);
    const ang = Math.random() * Math.PI * 2;
    const r = Math.tan(halfAngle) * Math.sqrt(Math.random());
    return out.copy(dir)
      .addScaledVector(this._u, Math.cos(ang) * r)
      .addScaledVector(this._v, Math.sin(ang) * r)
      .normalize();
  }

  /** Fire one round of an active alt-fire burst, then schedule the next. */
  _updateBurst(dt, w) {
    const wm = this.weapons;
    // cancel if the weapon changed or the player started reloading/swapping
    if (wm.currentId !== this._burst.id || wm.isBusy()) { this._burst = null; return; }

    this._burst.timer -= dt;
    if (this._burst.timer > 0) return;

    if (!wm.infiniteAmmoActive && wm.ammo.mag <= 0) {
      this._burst = null;
      bus.emit('weapon:empty');
      wm.startReload();
      this.cooldown = 0.25;
      return;
    }

    wm.consumeRound();
    bus.emit(EV.COMBAT_FIRED, { weapon: w });
    this._hitscan(w, w.altFire.spreadDeg);

    const rec = w.altFire.recoil;
    this.cameraRig.recoverLambda = Math.max(5, rec.recoverPerSec * 60);
    this.cameraRig.addRecoil(rec.pitchPerShot, (Math.random() - 0.5) * rec.yawJitter);
    this.viewModel.triggerKick(1);

    this._burst.left -= 1;
    if (this._burst.left <= 0) {
      this._burst = null;
      this.cooldown = w.altFire.cooldown;
    } else {
      this._burst.timer = w.altFire.interval;
    }
  }

  _hitscan(w, spreadDegOverride = null) {
    this.cameraRig.getAimRay(this._origin, this._dir); // base direction (no jitter)
    const spreadDeg = spreadDegOverride != null ? spreadDegOverride : (this.weapons.isADS ? w.adsSpreadDeg : w.spreadDeg);
    const spread = deg2rad(spreadDeg);
    const pellets = w.pellets || 1;
    this._hits.clear();

    // aggregate damage on a bot (zone multiplier + optional penetration multiplier)
    const hitBot = (bh, mult) => {
      const bot = bh.object.userData.bot;
      const zone = bh.object.userData.hitZone || 'body';
      if (!bot || !bot.alive) return;
      const zmult = zone === 'head' ? w.headshotMult : zone === 'leg' ? (w.legMult || 1) : 1;
      const dmg = Math.round(w.damage * zmult * mult * (this.damageMult || 1)); // damageMult: pickup boost
      const dead = bot.takeDamage(dmg, zone, bh.point);
      let agg = this._hits.get(bot);
      if (!agg) { agg = { dmg: 0, head: false, point: bh.point.clone(), dead: false }; this._hits.set(bot, agg); }
      agg.dmg += dmg;
      agg.head = agg.head || zone === 'head';
      agg.dead = agg.dead || dead;
      agg.point.copy(bh.point);
    };

    for (let i = 0; i < pellets; i++) {
      this._jitter(this._dir, spread, this._jit);
      this.raycaster.set(this._origin, this._jit);
      this.raycaster.near = 0.4;
      this.raycaster.far = w.range;
      const botHit = this.raycaster.intersectObjects(this.bots.targetList, false)[0] || null;
      const worldHit = this.raycaster.intersectObjects(this.world.solids, false)[0] || null;

      // direct hit — no cover, or the bot is in front of it
      if (botHit && (!worldHit || botHit.distance <= worldHit.distance)) {
        hitBot(botHit, 1);
        continue;
      }

      if (worldHit) {
        const ud = worldHit.object.userData || {};
        // distance buttons: register the range change, leave no impact/decal
        if (ud.rangeButton != null) { bus.emit(EV.RANGE_DISTANCE, { distance: ud.rangeButton }); continue; }
        // accuracy target: score it (spark only, no decal — it moves)
        let movable = false;
        // aim-trainer orb: stop the bullet here with a spark, no decal (AimTrainer scores it)
        if (ud.aimOrb) movable = true;
        if (ud.accuracyTarget) {
          movable = true;
          const r = Math.hypot(worldHit.point.x - ud.center.x, worldHit.point.y - ud.center.y);
          let score = 0;
          for (const [rr, sc] of ud.rings) { if (r <= rr) { score = sc; break; } }
          if (score > 0) bus.emit(EV.ACCURACY_SCORE, { score, point: worldHit.point.clone() });
        }
        // penetration: a bot behind LIGHT cover takes reduced damage (wallbang)
        if (botHit && ud.penetrable) hitBot(botHit, penMult(w));
        // entry/surface impact (world-space normal so decals sit on rotated faces)
        const wn = (!movable && worldHit.face) ? worldHit.face.normal.clone().transformDirection(worldHit.object.matrixWorld) : null;
        bus.emit(EV.COMBAT_MISS, { point: worldHit.point.clone(), normal: wn, from: this._origin.clone() });
      } else if (pellets === 1) {
        bus.emit(EV.COMBAT_MISS, { point: this._origin.clone().addScaledVector(this._jit, w.range), normal: null, from: this._origin.clone() });
      }
    }

    // aggregated hit feedback (one marker/number per bot)
    for (const [bot, a] of this._hits) {
      bus.emit(EV.COMBAT_HIT, { zone: a.head ? 'head' : 'body', damage: a.dmg, point: a.point.clone(), dead: a.dead, bot, from: this._origin.clone() });
      if (a.head) bus.emit(EV.COMBAT_HEADSHOT, { damage: a.dmg, point: a.point.clone() });
      if (a.dead) bus.emit(EV.COMBAT_KILL, { bot });
    }
  }

  _melee(w) {
    this.cameraRig.getAimRay(this._origin, this._dir);
    this.raycaster.set(this._origin, this._dir);
    this.raycaster.near = 0;
    this.raycaster.far = w.meleeRange;
    const botHit = this.raycaster.intersectObjects(this.bots.targetList, false)[0] || null;
    const worldHit = this.raycaster.intersectObjects(this.world.solids, false)[0] || null;

    // bot takes priority when it's the closer surface
    if (botHit && (!worldHit || botHit.distance <= worldHit.distance)) {
      const bot = botHit.object.userData.bot;
      const zone = botHit.object.userData.hitZone || 'body';
      if (!bot || !bot.alive) return;
      const mult = zone === 'head' ? w.headshotMult : zone === 'leg' ? (w.legMult || 1) : 1;
      const dmg = Math.round(w.damage * mult);
      const dead = bot.takeDamage(dmg, zone, botHit.point);
      bus.emit(EV.COMBAT_HIT, { zone, damage: dmg, point: botHit.point.clone(), dead, bot, from: null });
      if (zone === 'head') bus.emit(EV.COMBAT_HEADSHOT, { damage: dmg, point: botHit.point.clone() });
      if (dead) bus.emit(EV.COMBAT_KILL, { bot });
      return;
    }

    // hit a wall/box instead -> leave a scratch mark (world-space normal)
    if (worldHit) {
      bus.emit(EV.COMBAT_SLASH, {
        point: worldHit.point.clone(),
        normal: worldHit.face ? worldHit.face.normal.clone().transformDirection(worldHit.object.matrixWorld) : null,
      });
    }
  }
}

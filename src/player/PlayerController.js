import * as THREE from 'three';
import { clamp, damp } from '../util/math.js';

/**
 * Velocity-based movement with a Valorant-ish snappy ground feel:
 * high ground acceleration, strong exponential friction, no air-strafe speed
 * gain, fixed walk/run/crouch speeds. Frame-rate independent (runs at fixed dt).
 */
export class PlayerController {
  constructor(player, input, cameraRig, weapons) {
    this.player = player;
    this.input = input;
    this.cameraRig = cameraRig;
    this.weapons = weapons; // for ADS speed factor (set later, may be null)

    // tuning (metres / seconds)
    this.WALK_SPEED = 5.5;
    this.RUN_SPEED = 6.75;
    this.CROUCH_SPEED = 3.4;
    this.GROUND_ACCEL = 90;
    this.GROUND_FRICTION = 12;
    this.AIR_ACCEL = 8;
    this.GRAVITY = 22;
    this.JUMP_VELOCITY = 6.6;

    this._wish = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
  }

  update(dt) {
    const p = this.player;

    // dead (skirmish): no input, bleed to a stop, keep falling
    if (!p.alive) {
      p.velocity.x = 0;
      p.velocity.z = 0;
      p.velocity.y -= this.GRAVITY * dt;
      return;
    }

    const yaw = this.cameraRig.yaw;

    // movement basis from yaw only (horizontal)
    this._fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    this._right.set(Math.cos(yaw), 0, -Math.sin(yaw));

    // forward/strafe wish — analog (touch joystick) or digital (keys)
    const { f, s } = this.input.wishVector();

    this._wish.set(0, 0, 0)
      .addScaledVector(this._fwd, f)
      .addScaledVector(this._right, s);
    const wishLen = this._wish.length();
    // clamp to unit length (kills diagonal boost) but keep analog magnitudes < 1
    if (wishLen > 1) this._wish.multiplyScalar(1 / wishLen);

    // crouch
    p.crouching = this.input.isDown('CROUCH');
    const targetEye = p.crouching ? p.eyeCrouch : p.eyeStand;
    p.eyeHeight = damp(p.eyeHeight, targetEye, 14, dt);

    // target speed (walk/run/crouch, slowed while aiming)
    let target = p.crouching ? this.CROUCH_SPEED : (this.input.isDown('WALK') ? this.WALK_SPEED : this.RUN_SPEED);
    if (this.weapons && this.weapons.adsSpeedMult) target *= this.weapons.adsSpeedMult();

    // horizontal velocity
    let hx = p.velocity.x;
    let hz = p.velocity.z;
    const speed = Math.hypot(hx, hz);

    if (p.grounded) {
      if (wishLen > 1e-4) {
        hx += this._wish.x * this.GROUND_ACCEL * dt;
        hz += this._wish.z * this.GROUND_ACCEL * dt;
        const sp = Math.hypot(hx, hz);
        if (sp > target) { const k = target / sp; hx *= k; hz *= k; }
      } else {
        // friction (exponential — frame-rate independent)
        const decay = Math.exp(-this.GROUND_FRICTION * dt);
        hx *= decay; hz *= decay;
        if (Math.hypot(hx, hz) < 0.05) { hx = 0; hz = 0; }
      }
    } else {
      // air: minimal control, no speed gain beyond ground target
      if (wishLen > 1e-4) {
        hx += this._wish.x * this.AIR_ACCEL * dt;
        hz += this._wish.z * this.AIR_ACCEL * dt;
        const sp = Math.hypot(hx, hz);
        if (sp > Math.max(target, speed)) { const k = Math.max(target, speed) / sp; hx *= k; hz *= k; }
      }
    }
    p.velocity.x = hx;
    p.velocity.z = hz;

    // gravity
    p.velocity.y -= this.GRAVITY * dt;

    // jump
    if (p.grounded && !p.crouching && this.input.pressed('JUMP')) {
      p.velocity.y = this.JUMP_VELOCITY;
      p.grounded = false;
    }
    // NOTE: position is integrated in Game._step (after abilities can modify
    // velocity), then resolveCollision() corrects penetration.
  }
}

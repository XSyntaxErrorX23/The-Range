import * as THREE from 'three';
import { clamp, damp } from '../util/math.js';
import { bus, EV } from '../core/events.js';

const PITCH_LIMIT = Math.PI / 2 - 0.02;
const BASE_SENS = 0.0022; // rad per pixel at sensitivity = 1

/**
 * Custom first/third-person look rig. We own yaw/pitch explicitly (instead of
 * PointerLockControls) so weapon recoil can ride cleanly on top of the aim
 * without contaminating the mouse-driven base orientation.
 *
 * First-person is the default. `V` toggles third-person (over-the-shoulder,
 * damped follow, with wall occlusion). The combat aim ray always originates
 * from the player's eye along the look direction in BOTH modes.
 */
export class CameraRig {
  constructor(camera, input, player, settings) {
    this.camera = camera;
    this.input = input;
    this.player = player;
    this.settings = settings;
    this.world = null; // set via setWorld() for TP occlusion

    this.yaw = 0; // looking down -Z
    this.pitch = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.recoverLambda = 9;

    this.mode = 'first';
    this.tpDistance = 3.2;
    this.tpShoulder = 0.55;
    this.tpHeight = 0.25;

    this._dir = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._pivot = new THREE.Vector3();
    this._occRay = new THREE.Raycaster();
  }

  setWorld(world) { this.world = world; }

  /** Add a recoil impulse (radians). Pitch kicks the view up; yaw jitters. */
  addRecoil(pitch, yaw = 0) {
    this.recoilPitch += pitch;
    this.recoilYaw += yaw;
  }

  toggle() {
    this.mode = this.mode === 'first' ? 'third' : 'first';
    this.player.body.visible = this.mode === 'third';
    bus.emit(EV.CAMERA_MODE, this.mode);
  }

  /** Unit forward vector for an arbitrary yaw/pitch. */
  _forward(yaw, pitch, out) {
    const cp = Math.cos(pitch);
    return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
  }

  /** Aim ray for hitscan: from the eye, along the (recoiled) look direction. */
  getAimRay(outOrigin, outDir) {
    outOrigin.copy(this.player.eyePosition());
    const fy = this.yaw + this.recoilYaw;
    const fp = clamp(this.pitch + this.recoilPitch, -PITCH_LIMIT, PITCH_LIMIT);
    this._forward(fy, fp, outDir);
    return { origin: outOrigin, dir: outDir };
  }

  /**
   * Apply mouse-look from raw pixel deltas. Called ONCE per rendered frame (not
   * per fixed step) so flicks track the display rate exactly — applied before the
   * sim steps so the movement basis + aim ray use the fresh orientation.
   */
  applyLook(dx, dy) {
    const sens = BASE_SENS * (this.settings.sensitivity ?? 1);
    this.yaw -= dx * sens;
    this.pitch -= dy * sens;
    this.pitch = clamp(this.pitch, -PITCH_LIMIT, PITCH_LIMIT);
  }

  /** Decay recoil back to centre. Called per fixed step. */
  decayRecoil(dt) {
    this.recoilPitch = damp(this.recoilPitch, 0, this.recoverLambda, dt);
    this.recoilYaw = damp(this.recoilYaw, 0, this.recoverLambda, dt);
  }

  /**
   * Position the camera (FP eye / TP follow + occlusion) and orient it. Called
   * AFTER the player has moved this step so the camera tracks the new position.
   */
  updateTransform(dt) {
    // final orientation (base + recoil)
    const fy = this.yaw + this.recoilYaw;
    const fp = clamp(this.pitch + this.recoilPitch, -PITCH_LIMIT, PITCH_LIMIT);

    const eye = this.player.eyePosition();

    if (this.mode === 'first') {
      this.camera.position.copy(eye);
      this.camera.rotation.set(fp, fy, 0);
    } else {
      // third-person: position behind the look dir with a shoulder offset
      this._forward(fy, fp, this._dir);
      this._right.set(Math.cos(fy), 0, -Math.sin(fy));
      this._pivot.copy(eye);
      this._desired.copy(this._pivot)
        .addScaledVector(this._dir, -this.tpDistance)
        .addScaledVector(this._right, this.tpShoulder)
        .setY(this._pivot.y + this.tpHeight);

      // occlusion: pull camera in if a wall is between pivot and desired
      const toCam = this._desired.clone().sub(this._pivot);
      const dist = toCam.length();
      if (this.world && this.world.colliderMeshes && dist > 1e-4) {
        toCam.multiplyScalar(1 / dist);
        this._occRay.set(this._pivot, toCam);
        this._occRay.far = dist;
        const hit = this._occRay.intersectObjects(this.world.colliderMeshes, false)[0];
        if (hit) this._desired.copy(this._pivot).addScaledVector(toCam, Math.max(0.4, hit.distance - 0.2));
      }

      this.camera.position.copy(damp3(this.camera.position, this._desired, 14, dt));
      this.camera.rotation.set(fp, fy, 0);
    }

    // keep the visible body aligned (only shows in third-person)
    this.player.syncBody(this.yaw);
  }
}

// frame-rate-independent vector damp (mutates + returns `a`)
function damp3(a, b, lambda, dt) {
  const t = 1 - Math.exp(-lambda * dt);
  a.x += (b.x - a.x) * t;
  a.y += (b.y - a.y) * t;
  a.z += (b.z - a.z) * t;
  return a;
}

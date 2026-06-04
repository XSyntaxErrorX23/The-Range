/**
 * Deterministic spray patterns for automatic weapons. Instead of random yaw
 * jitter, each shot in a continuous spray follows a fixed, learnable shape:
 * strong vertical climb early, then an S-curve of horizontal drift. Scaled by
 * each weapon's own recoil values so per-gun tuning still applies. The pattern
 * resets after SPRAY_RESET seconds without firing (a fresh tap is accurate).
 */

// normalized horizontal drift (-1..1), a learnable up -> left -> right S-curve
const H = [
  0, 0.08, -0.1, 0.12, -0.06,
  -0.35, -0.55, -0.72, -0.85, -0.9, -0.82, -0.62,
  -0.3, 0.15, 0.5, 0.78, 0.92, 0.88, 0.7, 0.45,
  0.15, -0.2, 0.25, -0.3, 0.3,
];

// normalized vertical kick per shot: first bullet accurate, hard climb, then ease
function vKick(i) {
  if (i === 0) return 0.45;
  if (i < 4) return 1.3;
  if (i < 10) return 1.05;
  return 0.8;
}

export const SPRAY_RESET = 0.32; // seconds of no fire before the pattern resets

/** Returns the recoil impulse {pitch, yaw} (radians) for shot `i` of a spray. */
export function sprayOffset(weapon, i) {
  const r = weapon.recoil;
  const h = H[Math.min(i, H.length - 1)];
  return {
    pitch: r.pitchPerShot * vKick(i),
    yaw: (r.yawJitter || 0) * 3 * h,
  };
}

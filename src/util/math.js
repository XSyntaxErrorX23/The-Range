// Small math helpers. Scalars only (vector helpers live where THREE is imported).

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const lerp = (a, b, t) => a + (b - a) * t;

// Frame-rate-independent exponential approach toward `target`.
// `lambda` is the rate (higher = snappier). Equivalent to a critically-stable lerp.
export const damp = (current, target, lambda, dt) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

export const randRange = (lo, hi) => lo + Math.random() * (hi - lo);

export const randInt = (lo, hi) => Math.floor(randRange(lo, hi + 1));

export const deg2rad = (d) => (d * Math.PI) / 180;

export const rad2deg = (r) => (r * 180) / Math.PI;

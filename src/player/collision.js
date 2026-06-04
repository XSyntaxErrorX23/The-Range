const STEP = 0.45; // max ledge height auto-stepped (taller boxes must be jumped)

/**
 * 3D AABB collision for the range. Boxes (crates, platform, console, parkour)
 * can be:
 *   - walked into from the side (blocked) when too tall to step over
 *   - stepped onto when their top is within STEP of the feet
 *   - landed on / stood on (top becomes the ground height), including fast falls
 * Plus the floor (y = 0) and the room bounds.
 *
 * Runs after velocity is integrated into position; `player._prevY` is the feet
 * height from before integration (used to catch high-speed landings).
 */
export function resolveCollision(player, world) {
  const p = player.position;
  const r = player.radius;
  const h = player.crouching ? 1.2 : player.standHeight;
  const prevY = player._prevY != null ? player._prevY : p.y;

  // 1) support height FIRST — floor, or a box top the player center is over and
  //    either within stepping reach OR crossed downward this step (fast landing)
  let ground = 0;
  for (const b of world.boxes) {
    if (p.x < b.minX || p.x > b.maxX || p.z < b.minZ || p.z > b.maxZ) continue;
    const steppable = b.maxY <= p.y + STEP;
    const landedFromAbove = prevY >= b.maxY - 0.02 && p.y < b.maxY;
    if ((steppable || landedFromAbove) && b.maxY > ground) ground = b.maxY;
  }
  if (p.y <= ground + 0.02) {
    p.y = ground;
    if (player.velocity.y < 0) player.velocity.y = 0;
    player.grounded = true;
  } else {
    player.grounded = false;
  }

  // 2) horizontal blocking — boxes that overlap the body vertically and are too
  //    tall to step onto act as walls (circle-vs-AABB push-out in XZ)
  for (const b of world.boxes) {
    if (b.maxY <= p.y + STEP) continue; // low enough to stand on — not a wall
    if (b.minY >= p.y + h) continue;    // entirely above the head — no block
    const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
    const dx = p.x - cx, dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (r - d) / d;
        p.x += dx * push;
        p.z += dz * push;
      } else {
        const toMinX = p.x - b.minX, toMaxX = b.maxX - p.x;
        const toMinZ = p.z - b.minZ, toMaxZ = b.maxZ - p.z;
        const m = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);
        if (m === toMinX) p.x = b.minX - r;
        else if (m === toMaxX) p.x = b.maxX + r;
        else if (m === toMinZ) p.z = b.minZ - r;
        else p.z = b.maxZ + r;
      }
    }
  }

  // 3) room bounds
  const bd = world.bounds;
  if (p.x < bd.minX + r) { p.x = bd.minX + r; if (player.velocity.x < 0) player.velocity.x = 0; }
  if (p.x > bd.maxX - r) { p.x = bd.maxX - r; if (player.velocity.x > 0) player.velocity.x = 0; }
  if (p.z < bd.minZ + r) { p.z = bd.minZ + r; if (player.velocity.z < 0) player.velocity.z = 0; }
  if (p.z > bd.maxZ - r) { p.z = bd.maxZ - r; if (player.velocity.z > 0) player.velocity.z = 0; }
}

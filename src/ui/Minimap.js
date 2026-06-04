import * as THREE from 'three';

/**
 * Top-down radar minimap drawn to a small canvas in the HUD. North-up (downrange
 * = up). Shows cover boxes, enemies/bots as red dots, and the player as a cyan
 * arrow oriented to the look yaw. Cheap: redrawn each frame from live positions.
 * In team deathmatch, allies always show (blue) but enemies only appear when the
 * player has line-of-sight to them.
 */
export class Minimap {
  constructor(root, { player, cameraRig, world, bots }) {
    this.player = player;
    this.cameraRig = cameraRig;
    this.world = world;
    this.bots = bots;
    this._ray = new THREE.Raycaster();
    this._from = new THREE.Vector3();
    this._to = new THREE.Vector3();
    this._dir = new THREE.Vector3();

    this.size = 156; // logical px
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'minimap';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = this.size * dpr;
    this.canvas.height = this.size * dpr;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(dpr, dpr);
    root.appendChild(this.canvas);

    this.setWorld(world);
  }

  /** Re-point at a world and recompute scale from its bounds (used on world swap). */
  setWorld(world) {
    this.world = world;
    const b = world.bounds;
    this.cx = (b.minX + b.maxX) / 2;
    this.cz = (b.minZ + b.maxZ) / 2;
    this.scale = (this.size - 14) / Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
  }

  _map(x, z) {
    return [
      this.size / 2 + (x - this.cx) * this.scale,
      this.size / 2 - (z - this.cz) * this.scale, // +Z is up
    ];
  }

  _dot(p, r = 3.2) {
    const [mx, my] = this._map(p.x, p.z);
    this.ctx.beginPath();
    this.ctx.arc(mx, my, r, 0, Math.PI * 2);
    this.ctx.fill();
  }

  /** True if the player has an unobstructed forward line-of-sight to a point. */
  _canSee(p) {
    const pp = this.player.position;
    this._from.set(pp.x, pp.y + 1.7, pp.z);
    this._to.set(p.x, p.y + 1.4, p.z);
    this._dir.copy(this._to).sub(this._from);
    const dist = this._dir.length() || 1;
    this._dir.multiplyScalar(1 / dist);
    // must be in front of the player (not behind the back)
    const yaw = this.cameraRig.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const dl = Math.hypot(this._dir.x, this._dir.z) || 1;
    if ((fx * this._dir.x + fz * this._dir.z) / dl < -0.05) return false;
    // clear line of sight (no solid in the way)
    this._ray.set(this._from, this._dir);
    this._ray.near = 0.3; this._ray.far = dist - 0.6;
    return !this._ray.intersectObjects(this.world.solids, false)[0];
  }

  update() {
    const ctx = this.ctx, s = this.size;
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(8, 14, 18, 0.78)';
    ctx.fillRect(0, 0, s, s);

    // cover (tall boxes only)
    ctx.fillStyle = 'rgba(120, 150, 160, 0.32)';
    for (const box of this.world.boxes) {
      if (box.maxY <= 0.5) continue;
      const [x0, y0] = this._map(box.minX, box.maxZ);
      const [x1, y1] = this._map(box.maxX, box.minZ);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }

    if (this.bots.tdm) {
      // allies always visible (blue)
      ctx.fillStyle = '#4aa3ff';
      for (const b of this.bots.tdmAllyBots || []) if (b.alive) this._dot(b.root.position);
      // enemies only when the player has line-of-sight (red)
      ctx.fillStyle = '#ff4655';
      for (const b of this.bots.tdmEnemyBots || []) if (b.alive && this._canSee(b.root.position)) this._dot(b.root.position);
    } else {
      // enemies (practice dummies + skirmish opponent + zombies)
      ctx.fillStyle = '#ff4655';
      for (const bot of this.bots.pool) if (bot.alive) this._dot(bot.root.position);
      const e = this.bots.skirmishEnemyBot;
      if (e && e.alive) this._dot(e.root.position, 3.8);
      if (this.bots.zombieBots) {
        for (const z of this.bots.zombieBots) if (z.alive) this._dot(z.root.position, z.maxHealth > 400 ? 6 : 3.2);
      }
    }

    // player arrow (oriented to look yaw)
    const [px, py] = this._map(this.player.position.x, this.player.position.z);
    const yaw = this.cameraRig.yaw;
    const ang = Math.atan2(Math.cos(yaw), -Math.sin(yaw)); // world fwd -> canvas heading
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    ctx.fillStyle = '#46e0d6';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-4.5, -4.5);
    ctx.lineTo(-4.5, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(70, 224, 214, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, s - 1, s - 1);
  }
}

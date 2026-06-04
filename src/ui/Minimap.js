/**
 * Top-down radar minimap drawn to a small canvas in the HUD. North-up (downrange
 * = up). Shows cover boxes, enemies/bots as red dots, and the player as a cyan
 * arrow oriented to the look yaw. Cheap: redrawn each frame from live positions.
 */
export class Minimap {
  constructor(root, { player, cameraRig, world, bots }) {
    this.player = player;
    this.cameraRig = cameraRig;
    this.world = world;
    this.bots = bots;

    this.size = 156; // logical px
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'minimap';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = this.size * dpr;
    this.canvas.height = this.size * dpr;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(dpr, dpr);
    root.appendChild(this.canvas);

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

    // enemies (practice dummies + skirmish opponent)
    ctx.fillStyle = '#ff4655';
    for (const bot of this.bots.pool) if (bot.alive) this._dot(bot.root.position);
    const e = this.bots.skirmishEnemyBot;
    if (e && e.alive) this._dot(e.root.position, 3.8);

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

import { Bot } from './Bot.js';
import { bus, EV } from '../core/events.js';

const MAX_POOL = 10;

/**
 * Spawns/maintains practice bots in one of three modes:
 *  - static : up to maxActive standing dummies; respawn at a lane on death
 *  - strafe : same, but bots slide side-to-side
 *  - popup  : bots stay hidden, popping up briefly at random lanes (skills drill)
 *
 * Maintains `targetList` (collider meshes of alive bots) for the firing raycast.
 */
export class BotManager {
  constructor(scene, range, settings) {
    this.scene = scene;
    this.range = range;
    this.settings = settings;

    this.pool = [];
    for (let i = 0; i < MAX_POOL; i++) this.pool.push(new Bot(scene, i));

    this.targetList = [];
    this._dirty = true;

    this.mode = 'static';
    this.maxActive = 5;
    this.popupActive = 2;
    this.respawnDelay = 1.4;
    this.spawnCooldown = 0;
    this.time = 0;

    this.skirmish = false;        // skirmish mode -> no practice dummies
    this.skirmishEnemyBot = null; // the duel opponent's Bot (set by Skirmish)
    this.zombie = false;          // zombie mode -> no practice dummies
    this.zombieBots = [];         // live zombie Bots (kept in sync by ZombieSurvival)
    this.tdm = false;             // team deathmatch -> only enemy team is shootable
    this.tdmEnemyBots = [];       // enemy-team Bots (kept in sync by TeamDeathmatch)
    this.tdmAllyBots = [];        // ally-team Bots (for the minimap)
    this.suppressed = false;      // console toggle: temporarily clear the practice dummies

    // explosive splash (bazooka) damages every alive bot near the blast
    bus.on(EV.COMBAT_SPLASH, ({ point, radius, damage, mult }) => this._applySplash(point, radius, damage, mult || 1));
  }

  _applySplash(point, radius, damage, mult) {
    const hit = (bot) => {
      if (!bot || !bot.alive || bot.state !== 'alive') return;
      const d = bot.root.position.distanceTo(point);
      if (d > radius) return;
      const falloff = 1 - d / radius;          // full at centre -> 40% at the edge
      const dmg = Math.round(damage * mult * (0.4 + 0.6 * falloff));
      const dead = bot.takeDamage(dmg, 'body', bot.root.position);
      bus.emit(EV.COMBAT_HIT, { zone: 'body', damage: dmg, point: bot.root.position.clone(), dead, bot, from: null });
      if (dead) bus.emit(EV.COMBAT_KILL, { bot, weaponId: 'bazooka' });
    };
    for (const b of this.pool) hit(b);
    if (this.skirmishEnemyBot) hit(this.skirmishEnemyBot);
    for (const z of this.zombieBots) hit(z);
  }

  /** Console button: remove (hide + stop spawning) or restore the practice dummies. */
  setSuppressed(on) {
    this.suppressed = on;
    if (on) for (const b of this.pool) b.hide();
    this.spawnCooldown = 0;
    this._dirty = true;
  }

  setMode(mode) {
    this.mode = mode;
    this.skirmish = mode === 'skirmish';
    this.zombie = mode === 'zombie';
    this.aim = mode === 'aim'; // gridshot trainer owns its own orbs
    this.tdm = mode === 'tdm';
    for (const b of this.pool) b.hide();
    this.spawnCooldown = 0;
    this._dirty = true;
    bus.emit(EV.BOT_MODE, mode);
  }

  _rebuildTargets() {
    // only fully-risen bots are shootable (during the rise animation the visual
    // is still scaling up from the floor, so its colliders shouldn't count yet)
    this.targetList.length = 0;
    if (this.zombie) {
      for (const z of this.zombieBots) {
        if (z.alive && z.state === 'alive') this.targetList.push(...z.colliderMeshes());
      }
      return;
    }
    if (this.tdm) {
      for (const e of this.tdmEnemyBots) {
        if (e.alive && e.state === 'alive') this.targetList.push(...e.colliderMeshes());
      }
      return;
    }
    if (this.skirmish) {
      const e = this.skirmishEnemyBot;
      if (e && e.alive && e.state === 'alive') this.targetList.push(...e.colliderMeshes());
      return;
    }
    for (const b of this.pool) {
      if (b.alive && b.state === 'alive') this.targetList.push(...b.colliderMeshes());
    }
  }

  _freeBot() {
    return this.pool.find((b) => b.state === 'idle');
  }

  _occupiedPoints() {
    const pts = [];
    for (const b of this.pool) if (b.alive) pts.push(b.homeX + ',' + b.root.position.z);
    return pts;
  }

  _pickPoint() {
    const occupied = new Set();
    for (const b of this.pool) {
      if (b.alive || b.state === 'dead') occupied.add(`${b.homeX.toFixed(1)},${b.root.position.z.toFixed(1)}`);
    }
    const candidates = this.range.laneSpawns.filter(
      (p) => !occupied.has(`${p.x.toFixed(1)},${p.z.toFixed(1)}`)
    );
    const list = candidates.length ? candidates : this.range.laneSpawns;
    return list[Math.floor(Math.random() * list.length)];
  }

  _spawnOne() {
    const bot = this._freeBot();
    if (!bot) return;
    const pt = this._pickPoint();
    if (!pt) return;
    const armor = this.settings.botArmor ? 50 : 0;
    const life = this.mode === 'popup' ? 1.5 : 0;
    bot.spawnAt(pt.clone(), { armor, life });
    this._dirty = true;
  }

  update(dt) {
    this.time += dt;
    if (this.spawnCooldown > 0) this.spawnCooldown -= dt;

    let activeCount = 0;
    for (const bot of this.pool) {
      // move strafing bots BEFORE animating so the walk cycle reads current velocity
      if (this.mode === 'strafe' && bot.alive) bot.setStrafe(this.time);
      bot.update(dt);

      if (bot.alive) {
        activeCount++;
        if (this.mode === 'popup' && bot.lifeTimer > 0) {
          bot.lifeTimer -= dt;
          if (bot.lifeTimer <= 0) bot.hide();
        }
      }
    }

    if (!this.skirmish && !this.zombie && !this.aim && !this.tdm && !this.suppressed) {
      const target = this.mode === 'popup' ? this.popupActive : this.maxActive;
      if (activeCount < target && this.spawnCooldown <= 0) {
        this._spawnOne();
        this.spawnCooldown = this.mode === 'popup' ? 0.7 : this.respawnDelay;
      }
    }

    // small bot count — rebuild each frame so rising->alive transitions register
    this._rebuildTargets();
  }
}

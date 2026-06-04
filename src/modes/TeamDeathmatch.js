import * as THREE from 'three';
import { bus, EV } from '../core/events.js';
import { TeamBot } from '../enemies/TeamBot.js';

/**
 * 5v5 Team Deathmatch coordinator (Nuketown). The player + 4 ally bots fight 5
 * enemy bots; first team to KILL_TARGET kills wins. Bots target the nearest living
 * opponent (the player counts as an ally combatant). The player only damages the
 * enemy team (their colliders are the firing target list); bot-vs-bot and
 * bot-vs-player damage is probabilistic inside TeamBot. Deaths score the other
 * team and respawn at that team's house after a short delay.
 */
const ALLY_BOTS = 4;
const ENEMY_BOTS = 5;
const KILL_TARGET = 30;
const RESPAWN = 3.0;
const INVULN = 2.0;
const DEATH_FREEZE = 3.2; // a beat to read the combat report before respawning
const WEAPON_POOL = ['vandal', 'phantom', 'bulldog', 'spectre', 'stinger', 'guardian', 'sheriff'];
const ENEMY_NAMES = ['Reaper', 'Viper', 'Wraith', 'Spectre', 'Nova'];
const ALLY_NAMES = ['Hawk', 'Talon', 'Echo', 'Ranger'];

export class TeamDeathmatch {
  constructor({ scene, player, cameraRig, bots, settings, weapons }) {
    this.scene = scene; this.player = player; this.cameraRig = cameraRig;
    this.bots = bots; this.settings = settings; this.weapons = weapons;

    this.world = null;
    this.active = false;
    this.phase = 'idle'; // idle | live | ended
    this.allyBots = [];
    this.enemyBots = [];
    this.scores = { ally: 0, enemy: 0 };
    this._deathTimer = 0;
    this._invuln = 0;
    this._sig = '';
    this.onMatchEnd = () => {};

    // per-life combat report tracking (damage split by body zone)
    this._out = { head: 0, body: 0, leg: 0 };
    this._in = { head: 0, body: 0, leg: 0 };
    this._killsLife = 0;
    this._lastKiller = ''; this._lastKillerWeapon = ''; this._lastKillerWeaponId = 'rifle';

    // the player as a combatant — enemy bots target this like any other unit
    this._playerC = {
      isPlayer: true,
      team: 'ally',
      get name() { return settings.ign || 'You'; },
      get weaponId() { return weapons.currentId; },
      get alive() { return player.alive; },
      get pos() { return player.position; },
      eye: (out) => out.copy(player.eyePosition()),
      takeHit: (d, zone, attacker) => {
        if (this._invuln > 0 || !player.alive) return;
        this._in[zone] = (this._in[zone] || 0) + d;
        if (attacker) { this._lastKiller = attacker.name || 'Enemy'; this._lastKillerWeapon = attacker.weapon ? attacker.weapon.name : ''; this._lastKillerWeaponId = attacker.weaponId; }
        player.takeDamage(d, zone === 'head');
      },
    };

    bus.on(EV.PLAYER_DEAD, () => { if (this.active) this._onPlayerDead(); });
    // the player's outgoing damage / kills by zone (their shots carry a `from` origin)
    bus.on(EV.COMBAT_HIT, ({ bot, damage, from, zone }) => {
      if (!this.active || !from || !bot) return;
      const u = this.enemyBots.find((x) => x.tb.bot === bot);
      if (!u) return;
      this._out[zone] = (this._out[zone] || 0) + damage;
      u.tb._lastAttacker = this._playerC; // credit the player for the killfeed
    });
    bus.on(EV.COMBAT_KILL, ({ bot }) => {
      if (this.active && bot && this.enemyBots.some((u) => u.tb.bot === bot)) this._killsLife++;
    });
  }

  activate(world) {
    this.world = world;
    this.active = true;
    this.phase = 'live';
    this.scores = { ally: 0, enemy: 0 };
    this._deathTimer = 0;
    this._invuln = INVULN;
    this.weapons.setFiniteAmmo(true, 6); // finite ammo — manage your mags, refilled each life

    let id = 300;
    if (!this.allyBots.length) {
      for (let i = 0; i < ALLY_BOTS; i++) { const u = this._mkUnit(id++, 'ally'); u.tb.name = ALLY_NAMES[i] || `Ally ${i + 1}`; this.allyBots.push(u); }
      for (let i = 0; i < ENEMY_BOTS; i++) { const u = this._mkUnit(id++, 'enemy'); u.tb.name = ENEMY_NAMES[i] || `Enemy ${i + 1}`; this.enemyBots.push(u); }
    }
    for (const u of this._all()) { u.tb.world = world; this._respawnUnit(u, true); }
    this._spawnPlayer(true);
    this._syncTargets();
    bus.emit(EV.TDM_ANNOUNCE, { text: 'TEAM DEATHMATCH', sub: `First team to ${KILL_TARGET} kills` });
    this._emitState();
  }

  deactivate() {
    this.active = false;
    this.phase = 'idle';
    for (const u of this._all()) u.tb.hide();
    this.bots.tdmEnemyBots = [];
    this.bots.tdmAllyBots = [];
    this.weapons.setFiniteAmmo(false); // restore infinite reserves for other modes
    this.player.health = this.player.maxHealth;
    this.player.armor = 0;
    this.player.alive = true;
    this.player._emitHealth();
    bus.emit(EV.TDM_REPORT, { show: false });
    this._emitState();
  }

  rematch() { this.activate(this.world); }

  playerFrozen() { return this.active && (this.phase === 'ended' || !this.player.alive || this._deathTimer > 0); }

  _all() { return [...this.allyBots, ...this.enemyBots]; }
  _mkUnit(id, team) { return { tb: new TeamBot(this.scene, id, team), team, alivePrev: false, respawnT: 0 }; }

  update(dt) {
    if (!this.active) return;
    if (this._invuln > 0) this._invuln -= dt;

    const allyTb = this.allyBots.map((u) => u.tb);
    const enemyTb = this.enemyBots.map((u) => u.tb);
    const enemyOpp = [this._playerC, ...allyTb];
    for (const u of this._all()) {
      const opp = u.team === 'ally' ? enemyTb : enemyOpp;
      const mates = u.team === 'ally' ? allyTb : enemyTb;
      u.tb.update(dt, opp, mates);
    }

    // death detection + respawn for the bots
    for (const u of this._all()) {
      if (u.alivePrev && !u.tb.alive) {
        this.scores[u.team === 'ally' ? 'enemy' : 'ally']++;
        const k = u.tb._lastAttacker;
        bus.emit(EV.TDM_KILL, {
          killer: k ? (k.name || '?') : (u.team === 'ally' ? 'Enemy' : 'Ally'),
          killerTeam: k ? k.team : (u.team === 'ally' ? 'enemy' : 'ally'),
          victim: u.tb.name, victimTeam: u.team,
          weaponId: k ? k.weaponId : 'rifle',
        });
        u.tb._lastAttacker = null;
        u.respawnT = RESPAWN;
        this._emitState();
        if (this._checkWin()) return;
      }
      u.alivePrev = u.tb.alive;
      if (!u.tb.alive) { u.respawnT -= dt; if (u.respawnT <= 0) this._respawnUnit(u); }
    }

    // player respawn after the death freeze
    if (this._deathTimer > 0) { this._deathTimer -= dt; if (this._deathTimer <= 0) this._respawnPlayer(); }

    this._syncTargets();
    this._maybeEmit();
  }

  _onPlayerDead() {
    this.scores.enemy++;
    this._deathTimer = DEATH_FREEZE;
    bus.emit(EV.TDM_KILL, {
      killer: this._lastKiller || 'Enemy', killerTeam: 'enemy',
      victim: this._playerC.name, victimTeam: 'ally',
      weaponId: this._lastKillerWeaponId || 'rifle',
    });
    const sum = (z) => Math.round(z.head + z.body + z.leg);
    bus.emit(EV.TDM_REPORT, {
      show: true,
      killer: this._lastKiller || 'Enemy',
      killerWeapon: this._lastKillerWeapon || '',
      dmgOut: sum(this._out), dmgIn: sum(this._in),
      out: { head: Math.round(this._out.head), body: Math.round(this._out.body), leg: Math.round(this._out.leg) },
      in: { head: Math.round(this._in.head), body: Math.round(this._in.body), leg: Math.round(this._in.leg) },
      kills: this._killsLife,
    });
    this._emitState();
    this._checkWin();
  }

  _checkWin() {
    if (this.scores.ally >= KILL_TARGET || this.scores.enemy >= KILL_TARGET) {
      this.phase = 'ended';
      const win = this.scores.ally >= KILL_TARGET;
      bus.emit(EV.TDM_END, { win, ally: this.scores.ally, enemy: this.scores.enemy });
      this.onMatchEnd(win);
      return true;
    }
    return false;
  }

  _respawnUnit(u, initial = false) {
    const sp = initial
      ? this._houseSpawn(u.team)
      : this._safeSpawn(u.team);
    u.tb.setWeapon(WEAPON_POOL[Math.floor(Math.random() * WEAPON_POOL.length)]);
    u.tb.spawn(sp);
    u.alivePrev = true;
    u.respawnT = 0;
  }

  _houseSpawn(team) {
    const spawns = team === 'ally' ? this.world.allySpawns : this.world.enemySpawns;
    return spawns[Math.floor(Math.random() * spawns.length)];
  }

  /** A random map-wide spawn point, biased to the one farthest from living opponents. */
  _safeSpawn(team) {
    const opps = (team === 'ally' ? this.enemyBots.map((u) => u.tb) : [this._playerC, ...this.allyBots.map((u) => u.tb)])
      .filter((o) => o && o.alive);
    const pts = this.world.spawnPoints;
    let best = pts[Math.floor(Math.random() * pts.length)], bestD = -1;
    for (let i = 0; i < 7; i++) {
      const p = pts[Math.floor(Math.random() * pts.length)];
      let nd = Infinity;
      for (const o of opps) { const op = o.pos; const d = (op.x - p.x) ** 2 + (op.z - p.z) ** 2; if (d < nd) nd = d; }
      if (nd > bestD) { bestD = nd; best = p; }
    }
    return best;
  }

  _respawnPlayer() { this._spawnPlayer(false); this._invuln = INVULN; }

  _spawnPlayer(initial = false) {
    // fresh life: clear the combat-report tally and hide the panel
    this._out = { head: 0, body: 0, leg: 0 };
    this._in = { head: 0, body: 0, leg: 0 };
    this._killsLife = 0;
    this._lastKiller = ''; this._lastKillerWeapon = ''; this._lastKillerWeaponId = 'rifle';
    bus.emit(EV.TDM_REPORT, { show: false });
    this.weapons.setFiniteAmmo(true, 6); // full mags + reserves each life
    this.weapons.refillCurrent(6);
    const sp = initial ? (this.world.allySpawns[2] || this.world.allySpawns[0]) : this._safeSpawn('ally');
    this.player.spawnReset(new THREE.Vector3(sp.x, 0, sp.z));
    this.cameraRig.yaw = Math.atan2(sp.x, sp.z); // face the map centre
    this.cameraRig.pitch = 0;
    this.cameraRig.recoilPitch = 0;
    this.cameraRig.recoilYaw = 0;
  }

  _syncTargets() {
    this.bots.tdmEnemyBots = this.enemyBots.map((u) => u.tb.bot);
    this.bots.tdmAllyBots = this.allyBots.map((u) => u.tb.bot);
  }

  _maybeEmit() {
    const sig = `${this.phase}|${this.scores.ally}|${this.scores.enemy}`;
    if (sig !== this._sig) { this._sig = sig; this._emitState(); }
  }

  _emitState() {
    bus.emit(EV.TDM_STATE, { active: this.active && this.phase !== 'ended', ally: this.scores.ally, enemy: this.scores.enemy, target: KILL_TARGET });
  }
}

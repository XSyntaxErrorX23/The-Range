import * as THREE from 'three';
import { bus, EV } from '../core/events.js';
import { Zombie } from '../enemies/Zombie.js';
import { Pickups } from './Pickup.js';
import { WEAPONS } from '../weapons/weapons.config.js';

const PICKUP_TYPES = ['health', 'speed', 'damage', 'ammo'];
const PICKUP_INTERVAL = 10; // seconds between pickup spawns
const BOOST_TIME = 9;       // speed / damage boost duration

/**
 * Zombie Survival coordinator (parallels Skirmish). Owns the wave/boss loop,
 * 3 lives, credits and pickups on the Graveyard map.
 * Phases: idle | live | intermission | boss | ended
 *   - live: spawn + fight a wave; when it's cleared -> intermission (or boss)
 *   - intermission: short buy window between waves (player free to move + buy)
 *   - boss: after wave TOTAL_WAVES, fight one big zombie; kill it -> victory
 */

const TOTAL_WAVES = 5;
const INTERMISSION = 12;   // seconds between waves (buy window)
const SPAWN_INTERVAL = 0.8; // stagger zombie spawns
const DEATH_FREEZE = 1.6;  // pause after a life is lost
const INVULN = 2.2;        // grace period after respawn
const BOSS_INTRO = 4.5;    // cinematic entrance length
const MAX_ALIVE = 26;      // cap concurrent zombies (perf)
const START_CREDITS = 700;
const KILL_CREDIT = 40;   // gold per zombie -> pistol(1) -> smg(2) -> rifle(3)...
const BOSS_CREDIT = 600;
const WAVE_BONUS = 150;
const ARMOR_PRICE = 500;

export class ZombieSurvival {
  constructor({ scene, player, cameraRig, bots, settings, weapons, firing }) {
    this.scene = scene;
    this.player = player;
    this.cameraRig = cameraRig;
    this.bots = bots;
    this.settings = settings;
    this.weapons = weapons;
    this.firing = firing;
    this.pickups = new Pickups(scene);
    this._pickupTimer = 0;
    this._speedTimer = 0;
    this._dmgTimer = 0;

    this.world = null;
    this.active = false;
    this.phase = 'idle';
    this.wave = 0;
    this.lives = 3;
    this.credits = 0;

    this.zombies = [];
    this.boss = null;
    this.toSpawn = 0;
    this.spawnTimer = 0;
    this.timer = 0;       // intermission timer
    this._deathTimer = 0; // post-death freeze
    this._invuln = 0;     // post-respawn grace
    this._sig = '';       // last emitted state signature

    this.onMatchEnd = () => {};

    bus.on(EV.PLAYER_DEAD, () => { if (this.active) this._onPlayerDead(); });
    bus.on(EV.COMBAT_KILL, ({ bot }) => { if (this.active) this._onKill(bot); });
  }

  // ---- lifecycle ----
  activate(world) {
    this.world = world;
    this.active = true;
    this.lives = 3;
    this.credits = START_CREDITS;
    this.endless = false;
    this.boss = null;
    this._bossIntroT = 0;
    this._deathTimer = 0;
    this._invuln = INVULN;
    this._pickupTimer = 8;
    this._clearBoosts();
    this.weapons.setFiniteAmmo(true, 4); // bullets matter — buy more in the shop
    this.pickups.clear();
    for (const z of this.zombies) z.hide();
    this.bots.zombieBots = [];
    this._spawnPlayer();
    this._startWave(1);
  }

  deactivate() {
    this.active = false;
    this.phase = 'idle';
    this.boss = null;
    for (const z of this.zombies) z.hide();
    this.bots.zombieBots = [];
    this.pickups.clear();
    this._clearBoosts();
    this.weapons.setFiniteAmmo(false); // restore infinite reserves for other modes
    this.player.health = this.player.maxHealth;
    this.player.armor = 0;
    this.player.alive = true;
    this.player.speedBoost = 1;
    this.player._emitHealth();
    this._emitState();
  }

  rematch() { this.activate(this.world); }

  /** Buy/equip a weapon with credits. Returns true if purchased. */
  tryBuy(id) {
    const w = WEAPONS[id];
    if (!w) return false;
    const price = w.price || 0;
    if (this.credits < price) return false;
    this.credits -= price;
    this.weapons.setLoadout(id);
    this.weapons.refillCurrent(4); // a fresh purchase comes fully loaded
    this._emitState();
    return true;
  }

  /** Buy a full ammo refill for the equipped weapon. */
  buyAmmo() {
    const PRICE = 200;
    if (this.credits < PRICE) return false;
    this.credits -= PRICE;
    this.weapons.refillCurrent(4);
    this._emitState();
    return true;
  }

  /** Buy body armor (soaks ~2/3 of incoming damage). */
  buyArmor() {
    if (this.credits < ARMOR_PRICE || this.player.armor >= 50) return false;
    this.credits -= ARMOR_PRICE;
    this.player.armor = 50;
    this.player._emitHealth();
    this._emitState();
    return true;
  }

  /** True while the player should hold still (death pause / boss intro / over). */
  playerFrozen() {
    return this.active && (this.phase === 'ended' || this.phase === 'boss-intro' || !this.player.alive || this._deathTimer > 0);
  }

  /** Camera is taking over (boss cinematic entrance). */
  get cinematicActive() { return this.active && this.phase === 'boss-intro'; }

  setDifficulty() {} // (zombie mode ignores AI difficulty)

  startEndless() {
    this.endless = true;
    this.phase = 'intermission';
    this.timer = INTERMISSION;
    this.credits += BOSS_CREDIT;
    bus.emit(EV.ZOMBIE_ANNOUNCE, { text: 'ENDLESS', sub: 'The dead keep coming…' });
    this._emitState();
  }

  // ---- waves (scale uncapped for endless) ----
  _startWave(n) {
    this.wave = n;
    this.phase = 'live';
    this.toSpawn = Math.min(40, 6 + (n - 1) * 3);     // 6,9,12,15,18,21...
    this.spawnTimer = 0.4;
    this._waveHealth = 80 + (n - 1) * 30;             // 80,110,...
    this._waveSpeed = Math.min(5.4, 2.4 + (n - 1) * 0.25);
    this._waveDmg = 8 + (n - 1) * 2;
    bus.emit(EV.ZOMBIE_ANNOUNCE, { text: 'WAVE ' + n, sub: (n % 5 === 0) ? 'Boss wave' : '' });
    this._emitState();
  }

  _waveCleared() {
    this.credits += WAVE_BONUS;
    if (this.wave % 5 === 0) { this._startBoss(); return; } // boss every 5th wave
    this.phase = 'intermission';
    this.timer = INTERMISSION;
    bus.emit(EV.ZOMBIE_ANNOUNCE, { text: 'WAVE CLEARED', sub: `+${WAVE_BONUS}¤ · buy with [B]` });
    this._emitState();
  }

  _startBoss() {
    this.phase = 'boss-intro';
    this._bossIntroT = BOSS_INTRO;
    this._cineAng = Math.PI;
    const tier = this.wave / 5; // 1 at wave 5, 2 at wave 10...
    const sp = this.world.zombieSpawns[0];
    this.boss = this._spawnZombie(sp, { health: 1400 + (tier - 1) * 1000, speed: 1.9 + (tier - 1) * 0.2, dmg: 28 + (tier - 1) * 6, boss: true });
    bus.emit(EV.ZOMBIE_ANNOUNCE, { text: 'THE GRAVEKEEPER', sub: 'Final boss' });
    this._emitState();
  }

  _onBossDead() {
    if (!this.endless && this.wave === TOTAL_WAVES) { this._victory(); return; }
    this.phase = 'intermission';
    this.timer = INTERMISSION;
    bus.emit(EV.ZOMBIE_ANNOUNCE, { text: 'BOSS DOWN', sub: 'Brace for more…' });
    this._emitState();
  }

  _victory() {
    this.phase = 'ended';
    bus.emit(EV.ZOMBIE_END, { win: true, wave: this.wave });
    this.onMatchEnd(true);
  }

  /** Orbit the camera around the boss during its entrance. */
  updateCinematicCamera(camera, dt) {
    if (!this.boss) return;
    this._cineAng += dt * 0.45;
    const bp = this.boss.bot.root.position;
    const R = 10;
    camera.position.set(bp.x + Math.cos(this._cineAng) * R, bp.y + 4.5, bp.z + Math.sin(this._cineAng) * R);
    camera.lookAt(bp.x, bp.y + 3.4, bp.z);
  }

  update(dt) {
    if (!this.active) return;
    if (this._invuln > 0) this._invuln -= dt;
    this._updateBoosts(dt);

    // boss cinematic entrance: only the boss rises; the rest is paused
    if (this.phase === 'boss-intro') {
      this._bossIntroT -= dt;
      if (this.boss) this.boss.bot.update(dt);
      this._syncTargets();
      if (this._bossIntroT <= 0) { this.phase = 'boss'; bus.emit(EV.ZOMBIE_ANNOUNCE, { text: 'KILL IT', sub: '' }); }
      this._maybeEmit();
      return;
    }

    for (const z of this.zombies) z.update(dt);
    this._syncTargets();

    // pickups float + collect; spawn periodically while fighting
    this.pickups.update(dt, this.player.position, (type) => this._collect(type));
    if ((this.phase === 'live' || this.phase === 'boss') && this.pickups.active.length < 3) {
      this._pickupTimer -= dt;
      if (this._pickupTimer <= 0) {
        this._pickupTimer = PICKUP_INTERVAL;
        const spots = this.world.pickupSpots;
        const pos = spots[Math.floor(Math.random() * spots.length)];
        this.pickups.spawn(PICKUP_TYPES[Math.floor(Math.random() * PICKUP_TYPES.length)], pos);
      }
    }

    if (this._deathTimer > 0) {
      this._deathTimer -= dt;
      if (this._deathTimer <= 0) this._respawn();
    } else if (this.phase === 'live') {
      this._spawnTick(dt);
      if (this.toSpawn <= 0 && this._aliveCount() === 0) this._waveCleared();
    } else if (this.phase === 'intermission') {
      this.timer -= dt;
      if (this.timer <= 0) this._startWave(this.wave + 1);
    } else if (this.phase === 'boss') {
      if (this.boss && !this.boss.alive) { this._onBossDead(); }
    }

    this._maybeEmit();
  }

  _spawnTick(dt) {
    if (this.toSpawn <= 0) return;
    if (this._aliveCount() >= MAX_ALIVE) return; // cap concurrent zombies
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = SPAWN_INTERVAL;
    const sp = this.world.zombieSpawns[Math.floor(Math.random() * this.world.zombieSpawns.length)];
    this._spawnZombie(sp, { health: this._waveHealth, speed: this._waveSpeed, dmg: this._waveDmg });
    this.toSpawn--;
  }

  // ---- player death / lives ----
  _onPlayerDead() {
    this.lives = Math.max(0, this.lives - 1);
    this._emitState();
    if (this.lives <= 0) { this._lose(); return; }
    this._deathTimer = DEATH_FREEZE;
    bus.emit(EV.ZOMBIE_ANNOUNCE, { text: 'DOWN!', sub: `${this.lives} ${this.lives === 1 ? 'life' : 'lives'} left` });
  }

  _respawn() {
    this._spawnPlayer();
    this._invuln = INVULN;
  }

  _lose() {
    this.phase = 'ended';
    bus.emit(EV.ZOMBIE_END, { win: false, wave: this.wave });
    this.onMatchEnd(false);
  }

  _onKill(bot) {
    const z = this.zombies.find((z) => z.bot === bot);
    if (!z) return;
    const amount = z.isBoss ? BOSS_CREDIT : KILL_CREDIT;
    this.credits += amount;
    const p = bot.root.position;
    bus.emit(EV.ZOMBIE_CREDIT, { amount, point: new THREE.Vector3(p.x, p.y + (z.isBoss ? 4 : 1.7), p.z) });
  }

  // ---- pickups / boosts ----
  _collect(type) {
    if (type === 'health') {
      this.player.health = Math.min(this.player.maxHealth, this.player.health + 45);
      this.player._emitHealth();
    } else if (type === 'speed') {
      this.player.speedBoost = 1.5; this._speedTimer = BOOST_TIME;
    } else if (type === 'damage') {
      if (this.firing) this.firing.damageMult = 2; this._dmgTimer = BOOST_TIME;
    } else if (type === 'ammo') {
      this.weapons.refillCurrent(2);
    }
    bus.emit(EV.PICKUP, { type });
    this._emitState();
  }

  _updateBoosts(dt) {
    if (this._speedTimer > 0) { this._speedTimer -= dt; if (this._speedTimer <= 0) this.player.speedBoost = 1; }
    if (this._dmgTimer > 0) { this._dmgTimer -= dt; if (this._dmgTimer <= 0 && this.firing) this.firing.damageMult = 1; }
  }

  _clearBoosts() {
    this._speedTimer = 0; this._dmgTimer = 0;
    this.player.speedBoost = 1;
    if (this.firing) this.firing.damageMult = 1;
  }

  // ---- helpers ----
  _spawnPlayer() {
    const p = this.world.playerSpawn;
    this.player.spawnReset(new THREE.Vector3(p.x, p.y, p.z));
    this.cameraRig.yaw = Math.PI; // face +Z into the yard
    this.cameraRig.pitch = 0;
    this.cameraRig.recoilPitch = 0;
    this.cameraRig.recoilYaw = 0;
  }

  _spawnZombie(pos, opts = {}) {
    const wantBoss = !!opts.boss;
    let z = this.zombies.find((z) => !z.alive && z.bot.state === 'idle' && z._isBossModel === wantBoss);
    if (!z) {
      z = new Zombie(this.scene, this.world, this.player, {
        onDamagePlayer: (d) => { if (this._invuln <= 0 && this.player.alive) this.player.takeDamage(d, false); },
      });
      this.zombies.push(z);
    }
    z.world = this.world;
    z.spawn(pos, opts);
    this._syncTargets();
    return z;
  }

  _syncTargets() {
    this.bots.zombieBots = this.zombies.filter((z) => z.alive).map((z) => z.bot);
  }

  _aliveCount() {
    let n = 0;
    for (const z of this.zombies) if (z.alive) n++;
    return n;
  }

  _zombiesLeft() { return this._aliveCount() + Math.max(0, this.toSpawn); }

  _maybeEmit() {
    const bossHp = this.boss ? this.boss.bot.health : 0;
    const sig = `${this.phase}|${this.wave}|${this._zombiesLeft()}|${this.lives}|${this.credits}|${Math.round(bossHp)}`;
    if (sig !== this._sig) { this._sig = sig; this._emitState(); }
  }

  _emitState() {
    const onBoss = (this.phase === 'boss' || this.phase === 'boss-intro') && this.boss;
    bus.emit(EV.ZOMBIE_STATE, {
      active: this.active,
      phase: this.phase,
      wave: this.wave,
      totalWaves: TOTAL_WAVES,
      zombiesLeft: this._zombiesLeft(),
      lives: this.lives,
      credits: this.credits,
      intermission: this.phase === 'intermission' ? Math.ceil(this.timer) : 0,
      boss: !!onBoss,
      bossHealth: onBoss ? this.boss.bot.health : 0,
      bossMax: onBoss ? this.boss.bot.maxHealth : 1,
    });
  }
}

import * as THREE from 'three';
import { bus, EV } from '../core/events.js';
import { EnemyAgent } from '../enemies/EnemyAgent.js';

/**
 * 1v1 skirmish coordinator. Owns one EnemyAgent and runs a round loop:
 *   countdown -> live -> (someone dies) -> respawn -> ... -> first to TARGET -> ended.
 * Emits SKIRMISH_STATE/ANNOUNCE/END for the HUD + result overlay. Only active
 * while the bot mode is 'skirmish'; otherwise it stays dormant.
 */

const TARGET = 5;
const COUNTDOWN = 1.4;
const RESPAWN_DELAY = 2.2;
const ENEMY_WEAPONS = ['vandal', 'phantom', 'bulldog', 'spectre', 'sheriff', 'guardian', 'stinger', 'marshal'];

export class Skirmish {
  constructor({ scene, world, player, cameraRig, bots, settings, weapons }) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.cameraRig = cameraRig;
    this.bots = bots;
    this.settings = settings;
    this.weapons = weapons;
    this._savedLoadout = null;

    this.enemy = null;
    this.active = false;
    this.phase = 'idle'; // idle | countdown | live | respawn | ended
    this.timer = 0;
    this.playerScore = 0;
    this.enemyScore = 0;
    this.scored = false;
    this._lastEhp = 0;

    this.onMatchEnd = () => {}; // Game wires: exit lock + show result
  }

  _ensureEnemy() {
    if (!this.enemy) {
      this.enemy = new EnemyAgent(this.scene, this.world, this.player, {
        difficulty: this.settings.aiDifficulty,
        onDamagePlayer: (dmg, head) => this.player.takeDamage(dmg, head),
      });
    }
    // Always (re)register with the firing target list — deactivate() nulls it,
    // so returning to skirmish after another mode would otherwise leave it empty.
    this.bots.skirmishEnemyBot = this.enemy.bot;
  }

  activate() {
    this._ensureEnemy();
    // remember the player's chosen loadout so we can restore it on exit
    this._savedLoadout = { primaryId: this.weapons.primaryId, sidearmId: this.weapons.sidearmId };
    this.active = true;
    this.playerScore = 0;
    this.enemyScore = 0;
    this.startRound();
  }

  deactivate() {
    this.active = false;
    this.phase = 'idle';
    if (this.enemy) this.enemy.hide();
    this.bots.skirmishEnemyBot = null;
    // restore the player's pre-skirmish loadout
    if (this._savedLoadout) {
      this.weapons.primaryId = this._savedLoadout.primaryId;
      this.weapons.sidearmId = this._savedLoadout.sidearmId;
      this.weapons.equip(this._savedLoadout.primaryId);
      this._savedLoadout = null;
    }
    // restore the player to full health for range modes
    this.player.health = this.player.maxHealth;
    this.player.armor = 0;
    this.player.alive = true;
    this.player._emitHealth();
    this._emitState();
  }

  setDifficulty(d) { if (this.enemy) this.enemy.setDifficulty(d); }

  rematch() {
    this.playerScore = 0;
    this.enemyScore = 0;
    this.startRound();
  }

  startRound() {
    this.scored = false;
    // both reset to facing positions around the arena's centre each round
    this.player.spawnReset(new THREE.Vector3((Math.random() - 0.5) * 6, 0, 5));
    this.cameraRig.yaw = Math.PI; // face downrange (+Z) toward the enemy
    this.cameraRig.pitch = 0;
    this.cameraRig.recoilPitch = 0;
    this.cameraRig.recoilYaw = 0;
    // both fighters get the SAME random weapon each round (equal footing)
    const wid = ENEMY_WEAPONS[Math.floor(Math.random() * ENEMY_WEAPONS.length)];
    this.enemy.setWeapon(wid);
    this.enemy.spawn(new THREE.Vector3((Math.random() - 0.5) * 10, 0, 29));
    this._lastEhp = this.enemy.bot.health;
    // hand the player the same gun, equipped + topped up
    this.weapons.setLoadout(wid);
    this.weapons.ammo.mag = this.weapons.weapon.magSize;
    this.weapons._emitAmmo();

    this.phase = 'countdown';
    this.timer = COUNTDOWN;
    const round = this.playerScore + this.enemyScore + 1;
    bus.emit(EV.SKIRMISH_ANNOUNCE, { text: 'ROUND ' + round, sub: 'ENEMY · ' + this.enemy.weapon.name.toUpperCase() });
    this._emitState();
  }

  /** True while the player should not move/shoot (countdown, respawn, dead, ended). */
  playerFrozen() {
    return this.active && (this.phase !== 'live' || !this.player.alive);
  }

  update(dt) {
    if (!this.active) return;

    if (this.phase === 'countdown') {
      this.timer -= dt;
      this.enemy.bot.update(dt); // rise animation
      if (this.timer <= 0) { this.phase = 'live'; bus.emit(EV.SKIRMISH_ANNOUNCE, { text: 'FIGHT', sub: '' }); }
      return;
    }
    if (this.phase === 'respawn') {
      this.timer -= dt;
      this.enemy.bot.update(dt); // death animation
      if (this.timer <= 0) this.startRound();
      return;
    }
    if (this.phase !== 'live') return;

    this.enemy.update(dt);

    // live enemy HP -> HUD bar
    if (this.enemy.bot.health !== this._lastEhp) {
      this._lastEhp = this.enemy.bot.health;
      this._emitState();
    }

    if (this.scored) return;
    if (!this.player.alive) this._roundOver(false);
    else if (!this.enemy.bot.alive) this._roundOver(true);
  }

  _roundOver(playerWon) {
    this.scored = true;
    if (playerWon) this.playerScore++; else this.enemyScore++;
    this._emitState();
    bus.emit(EV.SKIRMISH_ANNOUNCE, {
      text: playerWon ? 'ENEMY DOWN' : 'YOU DIED',
      sub: `${this.playerScore} — ${this.enemyScore}`,
    });

    if (this.playerScore >= TARGET || this.enemyScore >= TARGET) {
      this.phase = 'ended';
      const win = this.playerScore > this.enemyScore;
      bus.emit(EV.SKIRMISH_END, { win, playerScore: this.playerScore, enemyScore: this.enemyScore });
      this.onMatchEnd(win);
    } else {
      this.phase = 'respawn';
      this.timer = RESPAWN_DELAY;
    }
  }

  _emitState() {
    bus.emit(EV.SKIRMISH_STATE, {
      active: this.active,
      playerScore: this.playerScore,
      enemyScore: this.enemyScore,
      target: TARGET,
      enemyName: this.enemy ? this.enemy.weapon.name : '',
      enemyHealth: this.enemy ? this.enemy.bot.health : 0,
      enemyMax: this.enemy ? this.enemy.bot.maxHealth : 100,
    });
  }
}

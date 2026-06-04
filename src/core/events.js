// Tiny synchronous event bus used to decouple gameplay systems from UI/FX/audio.
// Combat emits events; HUD, FXManager, AudioManager, ScoreManager subscribe.

class EventBus {
  constructor() {
    this._map = new Map(); // event -> Set<fn>
  }

  on(event, fn) {
    let set = this._map.get(event);
    if (!set) {
      set = new Set();
      this._map.set(event, set);
    }
    set.add(fn);
    return () => this.off(event, fn); // returns unsubscribe
  }

  off(event, fn) {
    const set = this._map.get(event);
    if (set) set.delete(fn);
  }

  emit(event, payload) {
    const set = this._map.get(event);
    if (!set) return;
    // copy to allow handlers to unsubscribe during emit
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[events] handler for "${event}" threw:`, err);
      }
    }
  }
}

// Canonical event names (documentation + typo guard).
export const EV = {
  LOCK_CHANGE: 'pointerlock:change', // { locked: boolean }
  WEAPON_SWITCHED: 'weapon:switched', // { slot, id, name, weapon }
  WEAPON_AMMO: 'weapon:ammo', // { mag, reserve, infinite, reloading }
  WEAPON_RELOAD: 'weapon:reload', // { reloading, progress }
  ADS_CHANGED: 'ads:changed', // { isADS, weaponId }
  COMBAT_FIRED: 'combat:fired', // { weapon, origin, dir }
  COMBAT_HIT: 'combat:hit', // { zone, damage, point, dead, bot }
  COMBAT_HEADSHOT: 'combat:headshot', // { damage, point }
  COMBAT_KILL: 'combat:kill', // { bot }
  COMBAT_MISS: 'combat:miss', // { point, normal }
  COMBAT_SLASH: 'combat:slash', // melee hit a surface — { point, normal }
  COMBAT_SPLASH: 'combat:splash', // explosive area damage (bazooka) — { point, radius, damage, mult }
  ACCURACY_SCORE: 'accuracy:score', // shot the range accuracy target — { score, point }
  RANGE_DISTANCE: 'range:distance', // shot a distance button — { distance }
  RANGE_DRONES_TOGGLE: 'range:dronestoggle', // shot the console button to remove/restore the bullseye drones
  RANGE_BOTS_TOGGLE: 'range:botstoggle', // shot the console button to remove/restore the practice dummies
  ZOMBIE_STATE: 'zombie:state', // { active, wave, totalWaves, zombiesLeft, lives, credits, boss, bossHealth, bossMax }
  ZOMBIE_ANNOUNCE: 'zombie:announce', // { text, sub }
  ZOMBIE_END: 'zombie:end', // { win, wave }
  ZOMBIE_ATTACK: 'zombie:attack', // a zombie bit the player — { boss }
  ZOMBIE_CREDIT: 'zombie:credit', // gold earned from a kill — { amount, point }
  PICKUP: 'pickup:collected', // { type, point }
  PLAYER_HEALTH: 'player:health', // { health, armor, max }
  PLAYER_DEAD: 'player:dead', // { byHead }
  ENEMY_FIRED: 'enemy:fired', // skirmish AI shot — { from, to, hit }
  SKIRMISH_STATE: 'skirmish:state', // { active, playerScore, enemyScore, target, enemyName, enemyHealth, enemyMax }
  SKIRMISH_ANNOUNCE: 'skirmish:announce', // { text, sub }
  SKIRMISH_END: 'skirmish:end', // { win, playerScore, enemyScore }
  AIM_STATE: 'aim:state', // gridshot trainer — { active, time, score, shots, hits, acc, streak }
  AIM_ANNOUNCE: 'aim:announce', // { text, sub }
  AIM_END: 'aim:end', // { score, acc, best, kps }
  TDM_STATE: 'tdm:state', // 5v5 team deathmatch — { active, ally, enemy, target }
  TDM_ANNOUNCE: 'tdm:announce', // { text, sub }
  TDM_END: 'tdm:end', // { win, ally, enemy }
  TDM_REPORT: 'tdm:report', // death combat report — { show, killer, killerWeapon, dmgOut, dmgIn, kills }
  TDM_KILL: 'tdm:kill', // killfeed entry — { killer, killerTeam, victim, victimTeam, weaponId, head }
  CAMERA_MODE: 'camera:modechanged', // 'first' | 'third'
  SCORE_UPDATE: 'score:update', // ScoreManager state
  RANGE_SETTINGS: 'range:settings', // Settings snapshot
  BOT_MODE: 'bot:mode', // mode string
};

export const bus = new EventBus();

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
  PLAYER_HEALTH: 'player:health', // { health, armor, max }
  PLAYER_DEAD: 'player:dead', // { byHead }
  ENEMY_FIRED: 'enemy:fired', // skirmish AI shot — { from, to, hit }
  SKIRMISH_STATE: 'skirmish:state', // { active, playerScore, enemyScore, target, enemyName, enemyHealth, enemyMax }
  SKIRMISH_ANNOUNCE: 'skirmish:announce', // { text, sub }
  SKIRMISH_END: 'skirmish:end', // { win, playerScore, enemyScore }
  CAMERA_MODE: 'camera:modechanged', // 'first' | 'third'
  SCORE_UPDATE: 'score:update', // ScoreManager state
  RANGE_SETTINGS: 'range:settings', // Settings snapshot
  BOT_MODE: 'bot:mode', // mode string
};

export const bus = new EventBus();

import { bus, EV } from '../core/events.js';

const KEY = 'valorange.settings.v1';

const DEFAULTS = {
  sensitivity: 1.0, // mouse multiplier
  fov: 90,
  view: 'first', // 'first' | 'third'
  volume: 0.7,
  botArmor: false,
  infiniteAmmo: true, // matches the reference "Infinite Ammo ENABLED"
  crosshairColor: '#46e0d6',
  crosshairGap: 6,
  botMode: 'static', // static | strafe | popup | skirmish | zombie
  aiDifficulty: 'hard', // skirmish opponent: easy | medium | hard
  ign: 'Agent', // in-game name (shown in killfeed)
  seenWelcome: false, // onboarding shown once
};

/**
 * Persisted user settings (localStorage). `onChange(cb)` lets systems react
 * live; `set(key, value)` persists + notifies.
 */
export class Settings {
  constructor() {
    Object.assign(this, DEFAULTS);
    this._load();
    this._cbs = new Set();
  }

  _load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Object.assign(this, DEFAULTS, JSON.parse(raw));
    } catch (_) { /* ignore */ }
  }

  _save() {
    try {
      const out = {};
      for (const k of Object.keys(DEFAULTS)) out[k] = this[k];
      localStorage.setItem(KEY, JSON.stringify(out));
    } catch (_) { /* ignore */ }
  }

  onChange(cb) { this._cbs.add(cb); return () => this._cbs.delete(cb); }

  set(key, value) {
    if (!(key in DEFAULTS)) return;
    this[key] = value;
    this._save();
    for (const cb of this._cbs) cb(key, value, this);
    bus.emit(EV.RANGE_SETTINGS, this.snapshot());
  }

  snapshot() {
    const out = {};
    for (const k of Object.keys(DEFAULTS)) out[k] = this[k];
    return out;
  }
}

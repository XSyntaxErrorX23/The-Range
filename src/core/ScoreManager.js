import { bus, EV } from './events.js';

const STATS_KEY = 'valorange.stats.v1';
const DEFAULT_LIFETIME = {
  kills: 0, deaths: 0, shots: 0, hits: 0, headshots: 0,
  bestStreak: 0, wins: 0, losses: 0, matches: 0,
};

/**
 * Tracks shooting stats and the kill score. Maintains a per-session tally plus a
 * persisted lifetime tally (localStorage). Updates the in-world scoreboard and
 * emits SCORE_UPDATE for the HUD.
 */
export class ScoreManager {
  constructor(scoreboard) {
    this.scoreboard = scoreboard;
    this.lifetime = this._loadLifetime();
    this.reset();
    this._wire();
    window.addEventListener('beforeunload', () => this._saveLifetime());
  }

  reset() {
    this.shots = 0;
    this.hits = 0;
    this.headshots = 0;
    this.kills = 0;
    this.deaths = 0;
    this.streak = 0;
    this.best = 0;
    this._emit();
    if (this.scoreboard) this.scoreboard.setValues(this.kills, this.best);
  }

  get accuracy() {
    return this.shots > 0 ? Math.round((this.hits / this.shots) * 100) : 0;
  }

  _loadLifetime() {
    try {
      return { ...DEFAULT_LIFETIME, ...JSON.parse(localStorage.getItem(STATS_KEY) || '{}') };
    } catch (_) {
      return { ...DEFAULT_LIFETIME };
    }
  }

  _saveLifetime() {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(this.lifetime)); } catch (_) { /* ignore */ }
  }

  resetLifetime() {
    this.lifetime = { ...DEFAULT_LIFETIME };
    this._saveLifetime();
  }

  getStats() {
    const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
    const L = this.lifetime;
    return {
      session: {
        kills: this.kills, deaths: this.deaths, streak: this.streak, best: this.best,
        shots: this.shots, hits: this.hits, headshots: this.headshots,
        accuracy: this.accuracy, hsPct: pct(this.headshots, this.hits),
      },
      lifetime: {
        ...L, accuracy: pct(L.hits, L.shots), hsPct: pct(L.headshots, L.hits),
      },
    };
  }

  _wire() {
    bus.on(EV.COMBAT_FIRED, ({ weapon }) => {
      if (weapon.type !== 'melee') { this.shots++; this.lifetime.shots++; }
      this._emit();
    });
    bus.on(EV.COMBAT_HIT, () => { this.hits++; this.lifetime.hits++; this._emit(); });
    bus.on(EV.COMBAT_HEADSHOT, () => { this.headshots++; this.lifetime.headshots++; });
    bus.on(EV.COMBAT_KILL, () => {
      this.kills++;
      this.streak++;
      this.best = Math.max(this.best, this.kills);
      this.lifetime.kills++;
      this.lifetime.bestStreak = Math.max(this.lifetime.bestStreak, this.streak);
      if (this.scoreboard) this.scoreboard.setValues(this.kills, this.best);
      this._saveLifetime();
      this._emit();
    });
    bus.on(EV.PLAYER_DEAD, () => {
      this.deaths++;
      this.lifetime.deaths++;
      this.streak = 0;
      this._saveLifetime();
      this._emit();
    });
    bus.on(EV.SKIRMISH_END, ({ win }) => {
      this.lifetime.matches++;
      if (win) this.lifetime.wins++; else this.lifetime.losses++;
      this._saveLifetime();
    });
  }

  _emit() {
    bus.emit(EV.SCORE_UPDATE, {
      shots: this.shots,
      hits: this.hits,
      headshots: this.headshots,
      kills: this.kills,
      deaths: this.deaths,
      streak: this.streak,
      best: this.best,
      accuracy: this.accuracy,
    });
  }
}

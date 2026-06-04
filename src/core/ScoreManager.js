import { bus, EV } from './events.js';

/**
 * Tracks shooting stats and the kill score; updates the in-world scoreboard and
 * emits SCORE_UPDATE for the HUD.
 */
export class ScoreManager {
  constructor(scoreboard) {
    this.scoreboard = scoreboard;
    this.reset();
    this._wire();
  }

  reset() {
    this.shots = 0;
    this.hits = 0;
    this.headshots = 0;
    this.kills = 0;
    this.streak = 0;
    this.best = 0;
    this._emit();
    if (this.scoreboard) this.scoreboard.setValues(this.kills, this.best);
  }

  get accuracy() {
    return this.shots > 0 ? Math.round((this.hits / this.shots) * 100) : 0;
  }

  _wire() {
    bus.on(EV.COMBAT_FIRED, ({ weapon }) => {
      if (weapon.type !== 'melee') this.shots++;
      this._emit();
    });
    bus.on(EV.COMBAT_HIT, () => { this.hits++; this._emit(); });
    bus.on(EV.COMBAT_HEADSHOT, () => { this.headshots++; });
    bus.on(EV.COMBAT_KILL, () => {
      this.kills++;
      this.streak++;
      this.best = Math.max(this.best, this.kills);
      if (this.scoreboard) this.scoreboard.setValues(this.kills, this.best);
      this._emit();
    });
  }

  _emit() {
    bus.emit(EV.SCORE_UPDATE, {
      shots: this.shots,
      hits: this.hits,
      headshots: this.headshots,
      kills: this.kills,
      streak: this.streak,
      best: this.best,
      accuracy: this.accuracy,
    });
  }
}

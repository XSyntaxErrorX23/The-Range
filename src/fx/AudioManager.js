import { bus, EV } from '../core/events.js';

/**
 * WebAudio-synthesized SFX — no audio files. The AudioContext is created and
 * resumed from a user gesture (the Start screen click). One master gain is
 * driven by the volume setting. Sounds are short, filtered and pooled-by-design
 * (each is a few throwaway nodes that auto-disconnect on end).
 */
export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this._wire();
  }

  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.settings.volume ?? 0.7;
      this.master.connect(this.ctx.destination);
      // muffled bus for incoming enemy fire (quieter + low-passed for "distance")
      this.distant = this.ctx.createGain();
      this.distant.gain.value = 0.5;
      const dlp = this.ctx.createBiquadFilter();
      dlp.type = 'lowpass';
      dlp.frequency.value = 1500;
      this.distant.connect(dlp).connect(this.master);
      this.noiseBuffer = this._makeNoise(1.0);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    if (this.master) this.master.gain.value = v;
  }

  _makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _noiseBurst(dur, filterType, freq, peak, dest) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.value = freq;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g).connect(dest || this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
    src.onended = () => { src.disconnect(); filt.disconnect(); g.disconnect(); };
    return { filt, g };
  }

  _tone(type, freq, dur, peak, slideTo, dest) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(dest || this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = () => { osc.disconnect(); g.disconnect(); };
  }

  // weapon is the full weapon object (has .category). dest/scale let enemy fire
  // route through the muffled "distant" bus.
  gunshot(weapon, dest = this.master, scale = 1) {
    if (!this.ctx) return;
    const c = weapon && weapon.category;
    const click = (f, p) => this._tone('square', f, 0.014, p * scale, f * 0.5, dest); // mechanical transient
    switch (c) {
      case 'sidearm': click(1300, 0.09); this._noiseBurst(0.12, 'lowpass', 1900, 0.5 * scale, dest); this._tone('square', 180, 0.08, 0.18 * scale, 90, dest); break;
      case 'smg': click(1500, 0.07); this._noiseBurst(0.06, 'lowpass', 2700, 0.34 * scale, dest); this._tone('square', 240, 0.05, 0.12 * scale, 120, dest); break;
      case 'shotgun': click(850, 0.1); this._noiseBurst(0.28, 'lowpass', 1100, 0.62 * scale, dest); this._tone('sawtooth', 100, 0.24, 0.28 * scale, 50, dest); break;
      case 'rifle': click(1400, 0.1); this._noiseBurst(0.14, 'lowpass', 2100, 0.5 * scale, dest); this._tone('sawtooth', 150, 0.11, 0.22 * scale, 68, dest); break;
      case 'sniper': click(1100, 0.12); this._noiseBurst(0.34, 'lowpass', 900, 0.62 * scale, dest); this._tone('sawtooth', 85, 0.32, 0.3 * scale, 42, dest); this._tone('sine', 2600, 0.04, 0.06 * scale, 1500, dest); break;
      case 'mg': click(1300, 0.09); this._noiseBurst(0.1, 'lowpass', 1700, 0.46 * scale, dest); this._tone('sawtooth', 130, 0.09, 0.22 * scale, 76, dest); break;
      case 'special': this._tone('triangle', 1500, 0.1, 0.13 * scale, 600, dest); this._tone('sine', 2200, 0.07, 0.06 * scale, 0, dest); break;
      case 'melee': this._tone('triangle', 1200, 0.12, 0.14 * scale, 400, dest); break;
      default: this._noiseBurst(0.1, 'lowpass', 2000, 0.4 * scale, dest);
    }
  }

  /** Incoming enemy fire — same gun timbre, routed through the muffled bus. */
  enemyFire(weapon) { this.gunshot(weapon, this.distant, 0.9); }

  /** A soft footstep thud. */
  footstep() {
    if (!this.ctx) return;
    this._noiseBurst(0.05, 'lowpass', 360, 0.07);
  }

  // ability cues
  dash() { if (this.ctx) { this._noiseBurst(0.22, 'bandpass', 1400, 0.22); this._tone('sine', 320, 0.22, 0.1, 760); } }
  updraft() { if (this.ctx) { this._noiseBurst(0.2, 'bandpass', 900, 0.18); this._tone('sine', 280, 0.3, 0.12, 920); } }
  smoke() { if (this.ctx) this._noiseBurst(0.4, 'lowpass', 600, 0.28); }
  blade() { if (this.ctx) { this._tone('triangle', 900, 0.14, 0.13, 1900); this._tone('sine', 2400, 0.1, 0.07); } }

  reload() {
    if (!this.ctx) return;
    this._tone('square', 300, 0.05, 0.1, 200);                              // mag release
    setTimeout(() => { if (this.ctx) this._noiseBurst(0.05, 'lowpass', 1200, 0.12); }, 150); // mag out
    setTimeout(() => { if (this.ctx) this._tone('square', 260, 0.06, 0.12, 170); }, 330);     // mag in
    setTimeout(() => { if (this.ctx) this._tone('square', 540, 0.04, 0.1, 360); }, 470);      // charging handle
  }

  empty() { if (this.ctx) this._tone('square', 900, 0.04, 0.08, 700); }
  inspect() { if (this.ctx) { this._noiseBurst(0.12, 'bandpass', 800, 0.05); this._tone('square', 230, 0.05, 0.05, 300); } }
  hit() { if (this.ctx) this._tone('sine', 760, 0.07, 0.12, 600); }
  headshot() { if (this.ctx) { this._tone('sine', 1180, 0.09, 0.16, 880); this._tone('triangle', 1760, 0.07, 0.08); } }
  kill() { if (this.ctx) { this._tone('sine', 520, 0.16, 0.18, 320); this._tone('square', 780, 0.1, 0.08, 520); } }
  ui() { if (this.ctx) this._tone('sine', 660, 0.04, 0.06, 880); }

  _wire() {
    bus.on(EV.COMBAT_FIRED, ({ weapon }) => this.gunshot(weapon));
    bus.on(EV.COMBAT_HIT, () => this.hit());
    bus.on(EV.COMBAT_HEADSHOT, () => this.headshot());
    bus.on(EV.COMBAT_KILL, () => this.kill());
    bus.on('weapon:empty', () => this.empty());
    bus.on(EV.WEAPON_RELOAD, ({ reloading, progress }) => { if (reloading && progress === 0) this.reload(); });
    bus.on(EV.ENEMY_FIRED, ({ weapon }) => this.enemyFire(weapon));
    bus.on(EV.ACCURACY_SCORE, ({ score }) => {
      if (this.ctx) this._tone('sine', 500 + score * 6, 0.07, 0.12, 700 + score * 8);
    });
  }
}

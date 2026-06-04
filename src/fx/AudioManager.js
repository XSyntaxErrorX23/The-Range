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

  _tone(type, freq, dur, peak, slideTo) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = () => { osc.disconnect(); g.disconnect(); };
  }

  // weapon is the full weapon object (has .category)
  gunshot(weapon) {
    if (!this.ctx) return;
    const c = weapon && weapon.category;
    switch (c) {
      case 'sidearm': this._noiseBurst(0.12, 'lowpass', 1800, 0.5); this._tone('square', 180, 0.08, 0.18, 90); break;
      case 'smg': this._noiseBurst(0.07, 'lowpass', 2600, 0.35); this._tone('square', 240, 0.05, 0.12, 120); break;
      case 'shotgun': this._noiseBurst(0.26, 'lowpass', 1100, 0.6); this._tone('sawtooth', 110, 0.22, 0.26, 55); break;
      case 'rifle': this._noiseBurst(0.14, 'lowpass', 2000, 0.5); this._tone('sawtooth', 160, 0.10, 0.2, 70); break;
      case 'sniper': this._noiseBurst(0.32, 'lowpass', 900, 0.6); this._tone('sawtooth', 90, 0.3, 0.28, 45); break;
      case 'mg': this._noiseBurst(0.1, 'lowpass', 1700, 0.45); this._tone('sawtooth', 140, 0.08, 0.2, 80); break;
      case 'special': this._tone('triangle', 1500, 0.1, 0.13, 600); this._tone('sine', 2200, 0.07, 0.06); break;
      case 'melee': this._tone('triangle', 1200, 0.12, 0.14, 400); break;
      default: this._noiseBurst(0.1, 'lowpass', 2000, 0.4);
    }
  }

  // ability cues
  dash() { if (this.ctx) { this._noiseBurst(0.22, 'bandpass', 1400, 0.22); this._tone('sine', 320, 0.22, 0.1, 760); } }
  updraft() { if (this.ctx) { this._noiseBurst(0.2, 'bandpass', 900, 0.18); this._tone('sine', 280, 0.3, 0.12, 920); } }
  smoke() { if (this.ctx) this._noiseBurst(0.4, 'lowpass', 600, 0.28); }
  blade() { if (this.ctx) { this._tone('triangle', 900, 0.14, 0.13, 1900); this._tone('sine', 2400, 0.1, 0.07); } }

  reload() {
    if (!this.ctx) return;
    this._tone('square', 320, 0.05, 0.1, 220);
    setTimeout(() => this._tone('square', 260, 0.06, 0.1, 180), 180);
  }

  empty() { if (this.ctx) this._tone('square', 900, 0.04, 0.08, 700); }
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
  }
}

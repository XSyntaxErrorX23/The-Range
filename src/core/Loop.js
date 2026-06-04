import * as THREE from 'three';

/**
 * Fixed-timestep loop with an accumulator, driven by one requestAnimationFrame.
 * Movement/physics run at a deterministic 120 Hz so feel is identical on 60 Hz
 * and 144 Hz displays. The frame delta is clamped to avoid the "spiral of death"
 * after a tab blur / alt-tab.
 */
export class Loop {
  constructor({ step, render, frame }) {
    this.step = step; // (dt) => void   — fixed-step simulation
    this.render = render; // (alpha) => void — once per RAF
    this.frame = frame; // (frameTime) => void — once per RAF, before steps (input/look)
    this.clock = new THREE.Clock(false);
    this.fixedDt = 1 / 120;
    this.maxFrame = 0.1; // clamp: at most 0.1s of catch-up per frame
    this.accumulator = 0;
    this.running = false; // simulation advancing?
    this._raf = null;
    this._frame = this._frame.bind(this);
  }

  start() {
    this.clock.start();
    if (this._raf == null) this._raf = requestAnimationFrame(this._frame);
  }

  stop() {
    if (this._raf != null) cancelAnimationFrame(this._raf);
    this._raf = null;
    this.clock.stop();
  }

  /** Resume simulation; flush accumulated real-time so we don't lurch. */
  resume() {
    this.running = true;
    this.clock.getDelta(); // discard the gap accrued while paused
    this.accumulator = 0;
  }

  pause() {
    this.running = false;
  }

  _frame() {
    this._raf = requestAnimationFrame(this._frame);
    let frameTime = this.clock.getDelta();
    if (frameTime > this.maxFrame) frameTime = this.maxFrame;

    if (this.running) {
      if (this.frame) this.frame(frameTime); // input + mouse-look at display rate
      this.accumulator += frameTime;
      while (this.accumulator >= this.fixedDt) {
        this.step(this.fixedDt);
        this.accumulator -= this.fixedDt;
      }
    }

    const alpha = this.accumulator / this.fixedDt;
    this.render(alpha, frameTime); // frameTime lets menus animate while paused
  }
}

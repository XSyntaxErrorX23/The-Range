import { BINDINGS, MOUSE } from './bindings.js';
import { bus, EV } from '../core/events.js';

/**
 * Centralized input: keyboard + mouse state, per-frame edges, mouse-look
 * deltas, and the pointer-lock lifecycle (request on click, browser-owned Esc
 * to exit). Look is custom (not PointerLockControls) so recoil can ride cleanly
 * on top of yaw/pitch elsewhere.
 */
export class Input {
  constructor(domElement) {
    this.dom = domElement;

    this.keys = new Set(); // currently held KeyboardEvent.code
    this._prevKeys = new Set();
    this._justPressed = new Set();
    this._justReleased = new Set();

    this.mouse = { left: false, right: false, middle: false };
    this._prevMouse = { left: false, right: false, middle: false };
    this._mouseJustPressed = { left: false, right: false, middle: false };

    // accumulated mouse-look delta since last frame consume
    this.mouseDX = 0;
    this.mouseDY = 0;

    // accumulated wheel ticks (sign = direction); consumed per frame
    this._wheel = 0;

    this.locked = false;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onContext = (e) => e.preventDefault();
    this._onBlur = () => this._clearAll();
    this._onLockChange = this._onLockChange.bind(this);

    this._attach();
  }

  _attach() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('wheel', this._onWheel, { passive: true });
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('contextmenu', this._onContext);
    document.addEventListener('pointerlockchange', this._onLockChange);
    document.addEventListener('pointerlockerror', () =>
      console.warn('[input] pointer lock error (gesture/cooldown?)')
    );
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('contextmenu', this._onContext);
    document.removeEventListener('pointerlockchange', this._onLockChange);
  }

  // ---- pointer lock ----
  requestLock() {
    // Must be called from a user gesture (e.g. overlay click).
    if (this.dom.requestPointerLock) this.dom.requestPointerLock();
  }

  exitLock() {
    if (document.exitPointerLock) document.exitPointerLock();
  }

  _onLockChange() {
    this.locked = document.pointerLockElement === this.dom;
    // Clear all state on BOTH transitions so the click/keys that grabbed (or
    // released) the lock can't leak a justPressed edge (e.g. an instant shot).
    this._clearAll();
    this._prevKeys = new Set();
    this._prevMouse.left = this._prevMouse.right = this._prevMouse.middle = false;
    this._justPressed.clear();
    this._justReleased.clear();
    bus.emit(EV.LOCK_CHANGE, { locked: this.locked });
  }

  /** Re-baseline edges to currently-held inputs (used when resuming the sim
   *  without a lock change, e.g. after the weapon picker). Prevents held keys /
   *  buffered wheel from firing spurious one-shot actions next frame. */
  resetEdges() {
    this._prevKeys = new Set(this.keys);
    this._mouseJustPressed.left = this._mouseJustPressed.right = this._mouseJustPressed.middle = false;
    this._prevMouse.left = this.mouse.left;
    this._prevMouse.right = this.mouse.right;
    this._prevMouse.middle = this.mouse.middle;
    this._justPressed.clear();
    this._justReleased.clear();
    this._wheel = 0;
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  // ---- raw event handlers ----
  _onKeyDown(e) {
    // ignore typing in form fields (IGN entry, settings inputs)
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.repeat) return; // ignore OS auto-repeat for edge detection
    this.keys.add(e.code);
    // Prevent page scroll on space / arrows while playing
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  }

  _onKeyUp(e) {
    this.keys.delete(e.code);
  }

  _onMouseDown(e) {
    if (e.button === 0) this.mouse.left = true;
    else if (e.button === 2) this.mouse.right = true;
    else if (e.button === 1) this.mouse.middle = true;
  }

  _onMouseUp(e) {
    if (e.button === 0) this.mouse.left = false;
    else if (e.button === 2) this.mouse.right = false;
    else if (e.button === 1) this.mouse.middle = false;
  }

  _onMouseMove(e) {
    if (!this.locked) return;
    this.mouseDX += e.movementX || 0;
    this.mouseDY += e.movementY || 0;
  }

  _onWheel(e) {
    if (!this.locked) return;
    this._wheel += Math.sign(e.deltaY);
  }

  _clearAll() {
    this.keys.clear();
    this.mouse.left = this.mouse.right = this.mouse.middle = false;
    this.mouseDX = this.mouseDY = 0;
    this._wheel = 0;
  }

  // ---- frame lifecycle ----
  beginFrame() {
    this._justPressed.clear();
    this._justReleased.clear();
    for (const code of this.keys) if (!this._prevKeys.has(code)) this._justPressed.add(code);
    for (const code of this._prevKeys) if (!this.keys.has(code)) this._justReleased.add(code);
    this._prevKeys = new Set(this.keys);

    this._mouseJustPressed.left = this.mouse.left && !this._prevMouse.left;
    this._mouseJustPressed.right = this.mouse.right && !this._prevMouse.right;
    this._mouseJustPressed.middle = this.mouse.middle && !this._prevMouse.middle;
    this._prevMouse.left = this.mouse.left;
    this._prevMouse.right = this.mouse.right;
    this._prevMouse.middle = this.mouse.middle;
  }

  endFrame() {
    // mouse-look deltas are consumed by the camera each frame
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  // ---- query API (by action name) ----
  _codes(action) {
    return BINDINGS[action] || [];
  }

  isDown(action) {
    for (const c of this._codes(action)) if (this.keys.has(c)) return true;
    return false;
  }

  pressed(action) {
    for (const c of this._codes(action)) if (this._justPressed.has(c)) return true;
    return false;
  }

  released(action) {
    for (const c of this._codes(action)) if (this._justReleased.has(c)) return true;
    return false;
  }

  // mouse helpers
  fireDown() { return this.mouse.left; }
  firePressed() { return this._mouseJustPressed.left; }
  adsDown() { return this.mouse.right; }

  consumeWheel() {
    const w = this._wheel;
    this._wheel = 0;
    return w;
  }
}

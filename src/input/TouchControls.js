/**
 * On-screen touch controls for mobile. Builds a DOM overlay (left movement
 * joystick, full-screen look pad, action buttons) and feeds the shared `Input`
 * instance — movement as an analog axis, look as mouse-delta, fire/ADS as mouse
 * buttons, and everything else (slots, reload, jump, abilities, buy, view) as
 * synthetic key-holds so the existing game systems handle them unchanged.
 *
 * Multi-touch via Pointer Events: each finger is tracked by pointerId, so the
 * joystick, look drag and buttons all work simultaneously.
 */

const LOOK_FACTOR = 1.4; // pixels of drag -> mouse-delta (scales with sensitivity)

// Action buttons: [cssClass, label, spec]. spec drives press/release behaviour.
const BUTTONS = [
  ['tc-fire', 'FIRE', { fire: true }],
  ['tc-ads', 'ADS', { ads: true }],
  ['tc-jump', 'JUMP', { key: 'Space' }],
  ['tc-reload', '⟳', { key: 'KeyR' }],
  ['tc-crouch', 'CRCH', { keyToggle: 'ControlLeft' }],
  ['tc-slot tc-slot1', '1', { key: 'Digit1' }],
  ['tc-slot tc-slot2', '2', { key: 'Digit2' }],
  ['tc-slot tc-slot3', '3', { key: 'Digit3' }],
  ['tc-abil tc-abil-c', 'C', { key: 'KeyC' }],
  ['tc-abil tc-abil-q', 'Q', { key: 'KeyQ' }],
  ['tc-abil tc-abil-e', 'E', { key: 'KeyE' }],
  ['tc-abil tc-abil-x', 'X', { key: 'KeyX' }],
  ['tc-top tc-buy', 'BUY', { key: 'KeyB' }],
  ['tc-top tc-view', 'VIEW', { key: 'KeyV' }],
  ['tc-top tc-pause', '❚❚', { pause: true }],
];

export class TouchControls {
  constructor(input) {
    this.input = input;
    this._moveId = null;
    this._lookId = null;
    this._lx = 0; this._ly = 0;
    this._mc = { x: 0, y: 0, r: 1 }; // joystick centre + radius (px)
    this._toggles = new Map(); // spec -> bool state for toggle buttons

    this._build();
    this.hide();
  }

  _el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.textContent = html;
    return e;
  }

  _build() {
    this.root = this._el('div', 'tc-root');
    this.root.id = 'touch-ui';

    // full-screen look pad (lowest layer; buttons/joystick sit on top)
    this.look = this._el('div', 'tc-look');
    this.look.addEventListener('pointerdown', (e) => {
      if (this._lookId !== null) return;
      e.preventDefault();
      this._lookId = e.pointerId;
      this._lx = e.clientX; this._ly = e.clientY;
      this.look.setPointerCapture(e.pointerId);
    });
    this.look.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._lookId) return;
      const dx = e.clientX - this._lx, dy = e.clientY - this._ly;
      this._lx = e.clientX; this._ly = e.clientY;
      this.input.addLook(dx * LOOK_FACTOR, dy * LOOK_FACTOR);
    });
    const endLook = (e) => { if (e.pointerId === this._lookId) this._lookId = null; };
    this.look.addEventListener('pointerup', endLook);
    this.look.addEventListener('pointercancel', endLook);
    this.root.appendChild(this.look);

    // movement joystick (bottom-left)
    this.moveBase = this._el('div', 'tc-move');
    this.moveThumb = this._el('div', 'tc-move-thumb');
    this.moveBase.appendChild(this.moveThumb);
    this.moveBase.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this._moveId = e.pointerId;
      const r = this.moveBase.getBoundingClientRect();
      this._mc = { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
      this.moveBase.setPointerCapture(e.pointerId);
      this._updateMove(e);
    });
    this.moveBase.addEventListener('pointermove', (e) => {
      if (e.pointerId === this._moveId) this._updateMove(e);
    });
    const endMove = (e) => { if (e.pointerId === this._moveId) { this._moveId = null; this._resetMove(); } };
    this.moveBase.addEventListener('pointerup', endMove);
    this.moveBase.addEventListener('pointercancel', endMove);
    this.root.appendChild(this.moveBase);

    // action buttons
    this.buttons = [];
    for (const [cls, label, spec] of BUTTONS) {
      const b = this._el('div', 'tc-btn ' + cls, label);
      const press = (e) => {
        e.preventDefault();
        e.stopPropagation();
        b.setPointerCapture(e.pointerId);
        this._press(spec, b);
      };
      const release = (e) => { e.preventDefault(); this._release(spec, b); };
      b.addEventListener('pointerdown', press);
      b.addEventListener('pointerup', release);
      b.addEventListener('pointercancel', release);
      this.buttons.push({ b, spec });
      this.root.appendChild(b);
    }

    document.body.appendChild(this.root);
  }

  _updateMove(e) {
    const dx = e.clientX - this._mc.x;
    const dy = e.clientY - this._mc.y;
    const mag = Math.hypot(dx, dy) || 1;
    const ux = dx / mag, uy = dy / mag;
    const clamped = Math.min(mag, this._mc.r);
    this.moveThumb.style.transform = `translate(${ux * clamped}px, ${uy * clamped}px)`;
    const k = clamped / this._mc.r;
    // screen-up (negative y) = forward; screen-right (positive x) = strafe right
    this.input.setMove(ux * k, -uy * k);
  }

  _resetMove() {
    this.moveThumb.style.transform = 'translate(0px, 0px)';
    this.input.setMove(0, 0);
  }

  _press(spec, b) {
    if (spec.fire) { this.input.setFire(true); b.classList.add('active'); return; }
    if (spec.ads) { this.input.setADS(true); b.classList.add('active'); return; } // hold to aim / alt-fire edge
    if (spec.keyToggle) {
      const on = !this._toggles.get(spec);
      this._toggles.set(spec, on);
      if (on) this.input.holdKey(spec.keyToggle); else this.input.unholdKey(spec.keyToggle);
      b.classList.toggle('active', on);
      return;
    }
    if (spec.pause) { this.input.exitLock(); return; }
    if (spec.key) { this.input.holdKey(spec.key); b.classList.add('active'); }
  }

  _release(spec, b) {
    if (spec.fire) { this.input.setFire(false); b.classList.remove('active'); return; }
    if (spec.ads) { this.input.setADS(false); b.classList.remove('active'); return; }
    if (spec.keyToggle || spec.pause) return; // these flip on press only
    if (spec.key) { this.input.unholdKey(spec.key); b.classList.remove('active'); }
  }

  /** Clear any held/toggled state and visuals (used when hiding for a menu/pause). */
  _resetAll() {
    this._moveId = null;
    this._lookId = null;
    this._resetMove();
    for (const { b, spec } of this.buttons) {
      b.classList.remove('active');
      if (spec.keyToggle) this.input.unholdKey(spec.keyToggle);
    }
    this._toggles.clear();
    this.input.setFire(false);
    this.input.setADS(false);
  }

  show() { this.root.classList.add('show'); }
  hide() { this._resetAll(); this.root.classList.remove('show'); }
}

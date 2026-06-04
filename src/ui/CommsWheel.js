/**
 * Radio comms wheel. Hold ` to open; mouse movement aims a selector around 8
 * wedges; release ` to send the highlighted comm (or nothing if centred). The
 * view doesn't rotate while it's open — Game routes the look deltas here instead.
 */

const NS = 'http://www.w3.org/2000/svg';

const COMMS = [
  { id: 'nice', text: 'Nice!' },
  { id: 'thanks', text: 'Thanks!' },
  { id: 'sorry', text: 'My bad' },
  { id: 'backup', text: 'Need backup' },
  { id: 'spotted', text: 'Enemy spotted' },
  { id: 'pushing', text: 'Pushing in' },
  { id: 'fallback', text: 'Fall back' },
  { id: 'gg', text: 'Good game' },
];

const N = COMMS.length;
const STEP = (Math.PI * 2) / N;
const SIZE = 300;
const C = SIZE / 2;
const RO = 145, RI = 60, GAP = 0.025; // wedge outer/inner radius, gap between wedges
const RADIUS = 103; // label ring
const DEADZONE = 24; // px before a wedge is selected
const AIM_SENS = 0.5; // mouse px -> selector px

function sectorPath(a1, a2) {
  const p = (r, a) => `${(C + r * Math.cos(a)).toFixed(2)} ${(C + r * Math.sin(a)).toFixed(2)}`;
  return `M ${p(RO, a1)} A ${RO} ${RO} 0 0 1 ${p(RO, a2)} L ${p(RI, a2)} A ${RI} ${RI} 0 0 0 ${p(RI, a1)} Z`;
}

export class CommsWheel {
  constructor(root) {
    this.active = false;
    this.aimX = 0;
    this.aimY = 0;
    this.index = -1;

    this.el = document.createElement('div');
    this.el.id = 'radio';
    this.wheel = document.createElement('div');
    this.wheel.className = 'radio-wheel';

    // wedge segments (SVG)
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
    svg.setAttribute('class', 'radio-svg');
    this.sectors = COMMS.map((_, i) => {
      const mid = i * STEP - Math.PI / 2;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', sectorPath(mid - STEP / 2 + GAP, mid + STEP / 2 - GAP));
      path.setAttribute('class', 'radio-sector');
      svg.appendChild(path);
      return path;
    });
    this.wheel.appendChild(svg);

    // label chips on the ring
    this.items = COMMS.map((c, i) => {
      const a = i * STEP - Math.PI / 2;
      const it = document.createElement('div');
      it.className = 'radio-item';
      it.style.left = `${C + Math.cos(a) * RADIUS}px`;
      it.style.top = `${C + Math.sin(a) * RADIUS}px`;
      it.textContent = c.text;
      this.wheel.appendChild(it);
      return it;
    });

    // center hub (shows the highlighted comm)
    this.hub = document.createElement('div');
    this.hub.className = 'radio-hub';
    this.hubLabel = document.createElement('span');
    this.hubLabel.className = 'rh-label';
    this.hub.appendChild(this.hubLabel);
    this.wheel.appendChild(this.hub);

    this.dot = document.createElement('div');
    this.dot.className = 'radio-dot';
    this.wheel.appendChild(this.dot);

    this.el.appendChild(this.wheel);
    root.appendChild(this.el);
  }

  open() {
    this.active = true;
    this.aimX = 0;
    this.aimY = 0;
    this.index = -1;
    this._render();
    this.el.classList.add('show');
  }

  addAim(dx, dy) {
    this.aimX += dx * AIM_SENS;
    this.aimY += dy * AIM_SENS;
    const mag = Math.hypot(this.aimX, this.aimY);
    if (mag > RADIUS) { this.aimX *= RADIUS / mag; this.aimY *= RADIUS / mag; }
    if (mag < DEADZONE) {
      this.index = -1;
    } else {
      const ang = Math.atan2(this.aimY, this.aimX);
      this.index = ((Math.round((ang + Math.PI / 2) / STEP) % N) + N) % N;
    }
    this._render();
  }

  _render() {
    for (let i = 0; i < N; i++) {
      this.sectors[i].classList.toggle('sel', i === this.index);
      this.items[i].classList.toggle('sel', i === this.index);
    }
    this.hubLabel.textContent = this.index >= 0 ? COMMS[this.index].text : 'RADIO';
    this.hub.classList.toggle('armed', this.index >= 0);
    this.dot.style.transform = `translate(${this.aimX}px, ${this.aimY}px)`;
  }

  /** Close the wheel; returns the selected comm ({id,text}) or null. */
  commit() {
    this.active = false;
    this.el.classList.remove('show');
    const c = this.index >= 0 ? COMMS[this.index] : null;
    this.index = -1;
    return c;
  }
}

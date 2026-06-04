import { bus, EV } from '../core/events.js';
import { VERSION } from '../version.js';
import { modelKeyFor } from '../weapons/weapons.config.js';

const ABILITIES = [
  { key: 'cloud', label: 'C' },
  { key: 'updraft', label: 'Q' },
  { key: 'dash', label: 'E' },
  { key: 'ult', label: 'X' },
];

const WEAPON_ICONS = {
  pistol: '<svg viewBox="0 0 64 32"><path d="M4 10h40v8H30l-2 8h-8l1-8H4z"/></svg>',
  smg: '<svg viewBox="0 0 64 32"><path d="M2 10h48v6H40l-1 10h-7l-1-10H22v6h-8v-6H2z"/></svg>',
  rifle: '<svg viewBox="0 0 64 32"><path d="M2 12h58v5H44l-1 9h-6l-1-9H20v5h-6v-5H2z"/></svg>',
  sniper: '<svg viewBox="0 0 64 32"><path d="M2 13h60v4H46l-1 9h-5l-1-9H18v4h-5v-4H2z M24 7h14v3H24z"/></svg>',
  knife: '<svg viewBox="0 0 64 32"><path d="M8 20l34-12 6 3-30 16-6-2z M14 25l6 3"/></svg>',
};

const SLOT_DEF = [
  { slot: 1, key: '1', id: 'rifle', name: 'RIFLE' },
  { slot: 2, key: '2', id: 'pistol', name: 'CLASSIC' },
  { slot: 3, key: '3', id: 'knife', name: 'KNIFE' },
];

const BASE_GAP = { pistol: 6, smg: 7, shotgun: 9, rifle: 6, sniper: 4, mg: 8, knife: 3 };

/**
 * DOM/CSS HUD. Pure presentation: builds its elements once and reacts to bus
 * events. `update(dt)` only handles crosshair bloom decay.
 */
export class HUD {
  constructor(root, settings) {
    this.root = root;
    this.settings = settings;
    this.bloom = 0;
    this.baseGap = settings.crosshairGap;
    this.weaponId = 'rifle';
    this._lastHitHead = false;
    this._build();
    this._applyCrosshairStyle();
    this._wire();
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  _el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  _build() {
    this.root.innerHTML = '';

    // crosshair
    this.crosshair = this._el('div');
    this.crosshair.id = 'crosshair';
    this.crosshair.innerHTML =
      '<div class="ch-line ch-top"></div><div class="ch-line ch-bottom"></div>' +
      '<div class="ch-line ch-left"></div><div class="ch-line ch-right"></div>' +
      '<div class="ch-dot"></div>';
    this.root.appendChild(this.crosshair);

    // hitmarker
    this.hitmarker = this._el('div');
    this.hitmarker.id = 'hitmarker';
    this.hitmarker.innerHTML = '<div class="hm hm1"></div><div class="hm hm2"></div><div class="hm hm3"></div><div class="hm hm4"></div>';
    this.root.appendChild(this.hitmarker);

    // damage layer
    this.dmgLayer = this._el('div'); this.dmgLayer.id = 'damage-layer';
    this.root.appendChild(this.dmgLayer);

    // top score bar
    this.scorebar = this._el('div'); this.scorebar.id = 'scorebar';
    this.scorebar.innerHTML =
      '<div class="sb-block"><span class="sb-num cyan" id="sb-score">00</span><span class="sb-label">Score</span></div>' +
      '<div class="sb-block"><span class="sb-num" id="sb-streak">0</span><span class="sb-label">Streak</span></div>' +
      '<div class="sb-block"><span class="sb-num" id="sb-acc">0%</span><span class="sb-label">Accuracy</span></div>';
    this.root.appendChild(this.scorebar);

    // top-left range panel
    this.rangepanel = this._el('div'); this.rangepanel.id = 'rangepanel';
    this.rangepanel.innerHTML =
      '<h3>SHOOTING RANGE</h3>' +
      '<div class="rp-row"><span>Challenge</span><span class="rp-val" id="rp-mode">STATIC</span></div>' +
      '<div class="rp-row"><span>Bot Armor</span><span class="rp-val" id="rp-armor">DISABLED</span></div>' +
      '<div class="rp-row"><span>Infinite Ammo</span><span class="rp-val" id="rp-ammo">ENABLED</span></div>' +
      '<div class="rp-hint">Press [F2] to change settings</div>';
    this.root.appendChild(this.rangepanel);

    // killfeed
    this.killfeed = this._el('div'); this.killfeed.id = 'killfeed';
    this.root.appendChild(this.killfeed);

    // bottom bar: health / weapon bar / ammo
    this.bottombar = this._el('div'); this.bottombar.id = 'bottombar';
    this.health = this._el('div'); this.health.id = 'health';
    this.health.innerHTML =
      '<span class="pname" id="pname">Agent</span>' +
      '<span class="hp-line"><span class="hp-num" id="hp">100</span><span class="hp-shield">◆◆</span></span>';
    this.bottombar.appendChild(this.health);

    this.weaponbar = this._el('div'); this.weaponbar.id = 'weaponbar';
    for (const s of SLOT_DEF) {
      const slot = this._el('div', 'wslot');
      slot.dataset.slot = s.slot;
      slot.innerHTML = `<span class="wkey">${s.key}</span>${WEAPON_ICONS[s.id]}<span class="wname">${s.name}</span>`;
      this.weaponbar.appendChild(slot);
    }
    this.bottombar.appendChild(this.weaponbar);

    this.ammo = this._el('div'); this.ammo.id = 'ammo';
    this.ammo.innerHTML = '<span class="ammo-mag" id="ammo-mag">25</span><span class="ammo-sep">|</span><span class="ammo-res" id="ammo-res">∞</span><div class="reload-bar"><div id="reload-fill"></div></div>';
    this.bottombar.appendChild(this.ammo);
    this.root.appendChild(this.bottombar);

    // abilities (Jett) — bottom strip
    this.abilities = this._el('div'); this.abilities.id = 'abilities';
    for (const a of ABILITIES) {
      const el = this._el('div', 'abil');
      el.dataset.abil = a.key;
      el.innerHTML = `<span class="abil-key">${a.label}</span><span class="abil-count" data-count="${a.key}">0</span>`;
      this.abilities.appendChild(el);
    }
    this.root.appendChild(this.abilities);

    // view-mode indicator
    this.viewmode = this._el('div'); this.viewmode.id = 'viewmode';
    this.viewmode.innerHTML = 'VIEW <b>1ST</b> · [V]';
    this.root.appendChild(this.viewmode);

    // version badge
    this.versionTag = this._el('div'); this.versionTag.id = 'version';
    this.versionTag.textContent = 'THE RANGE v' + VERSION;
    this.root.appendChild(this.versionTag);

    // sniper scope
    this.scope = this._el('div'); this.scope.id = 'scope';
    this.scope.innerHTML = '<div class="scope-ring"></div><div class="scope-cross-h"></div><div class="scope-cross-v"></div><div class="scope-dot"></div>';
    this.root.appendChild(this.scope);

    // skirmish: duel scoreboard + enemy health bar (hidden outside skirmish)
    this.duelbar = this._el('div'); this.duelbar.id = 'duelbar';
    this.duelbar.innerHTML =
      '<span class="du-side">YOU</span><span class="du-score" id="du-p">0</span>' +
      '<span class="du-dash">—</span>' +
      '<span class="du-score enemy" id="du-e">0</span><span class="du-side">ENEMY</span>' +
      '<span class="du-target" id="du-target"></span>';
    this.root.appendChild(this.duelbar);

    this.enemyhp = this._el('div'); this.enemyhp.id = 'enemyhp';
    this.enemyhp.innerHTML = '<span class="eh-name" id="eh-name">ENEMY</span><div class="eh-bar"><div id="eh-fill"></div></div>';
    this.root.appendChild(this.enemyhp);

    // damage feedback + round announcements
    this.hurt = this._el('div'); this.hurt.id = 'hurt';
    this.root.appendChild(this.hurt);
    this.announce = this._el('div'); this.announce.id = 'announce';
    this.root.appendChild(this.announce);
    this.commsfeed = this._el('div'); this.commsfeed.id = 'commsfeed';
    this.root.appendChild(this.commsfeed);
    this._lastHealth = 100;
  }

  showComms(name, text) {
    const ign = (name || 'Agent').replace(/[<>&]/g, '');
    this.commsfeed.innerHTML = `<span class="cf-name">${ign}</span> ${text}`;
    this._flash(this.commsfeed);
  }

  setHealth({ health, armor }) {
    const hp = document.getElementById('hp');
    if (hp) hp.textContent = String(Math.max(0, Math.round(health)));
    const shield = this.health.querySelector('.hp-shield');
    if (shield) shield.textContent = armor > 0 ? '◆◆' : '';
    if (health < this._lastHealth) this._flash(this.hurt);
    this._lastHealth = health;
  }

  setSkirmish(s) {
    this.duelbar.classList.toggle('show', s.active);
    this.enemyhp.classList.toggle('show', s.active);
    if (!s.active) return;
    document.getElementById('du-p').textContent = String(s.playerScore);
    document.getElementById('du-e').textContent = String(s.enemyScore);
    document.getElementById('du-target').textContent = 'FIRST TO ' + s.target;
    document.getElementById('eh-name').textContent = 'ENEMY · ' + (s.enemyName || 'BOT').toUpperCase();
    const fill = document.getElementById('eh-fill');
    if (fill) fill.style.width = Math.max(0, Math.round(100 * s.enemyHealth / (s.enemyMax || 100))) + '%';
  }

  announceShow(text, sub) {
    this.announce.innerHTML = `<div class="an-main">${text}</div>` + (sub ? `<div class="an-sub">${sub}</div>` : '');
    this._flash(this.announce);
  }

  _flash(el) {
    el.classList.remove('show');
    void el.offsetWidth; // reflow to restart the animation
    el.classList.add('show');
  }

  _applyCrosshairStyle() {
    const r = document.documentElement.style;
    r.setProperty('--cross-color', this.settings.crosshairColor);
    this._setGap(this.baseGap);
  }

  _setGap(px) {
    document.documentElement.style.setProperty('--gap', px + 'px');
  }

  setActiveSlot(slot) {
    for (const el of this.weaponbar.children) {
      el.classList.toggle('active', Number(el.dataset.slot) === slot);
    }
  }

  setSlotNames(primaryName, sidearmName) {
    for (const el of this.weaponbar.children) {
      const s = Number(el.dataset.slot);
      const name = s === 1 ? primaryName : s === 2 ? sidearmName : null;
      if (name) { const n = el.querySelector('.wname'); if (n) n.textContent = name.toUpperCase(); }
    }
  }

  setAmmo({ mag, reserve, infinite, reloading }) {
    const magEl = document.getElementById('ammo-mag');
    const resEl = document.getElementById('ammo-res');
    if (mag == null) {
      magEl.textContent = '∞';
      resEl.textContent = '';
    } else {
      magEl.textContent = infinite ? String(mag) : String(mag);
      resEl.textContent = reserve === Infinity ? '∞' : String(reserve);
    }
    this.ammo.classList.toggle('empty', mag === 0 && !infinite);
    this.ammo.classList.toggle('reloading', !!reloading);
  }

  setReloadProgress(p) {
    const fill = document.getElementById('reload-fill');
    if (fill) fill.style.width = Math.round(p * 100) + '%';
  }

  setScore(s) {
    document.getElementById('sb-score').textContent = String(s.kills).padStart(2, '0');
    document.getElementById('sb-streak').textContent = String(s.streak);
    document.getElementById('sb-acc').textContent = s.accuracy + '%';
  }

  setRangePanel(snap) {
    document.getElementById('rp-mode').textContent = snap.botMode.toUpperCase();
    document.getElementById('rp-armor').textContent = snap.botArmor ? 'ENABLED' : 'DISABLED';
    document.getElementById('rp-ammo').textContent = snap.infiniteAmmo ? 'ENABLED' : 'DISABLED';
    document.documentElement.style.setProperty('--cross-color', snap.crosshairColor);
    this.baseGap = snap.crosshairGap;
    this._setGap(this.baseGap + this.bloom);
    const pn = document.getElementById('pname');
    if (pn) pn.textContent = (snap.ign || 'Agent').replace(/[<>&]/g, '');
  }

  hitmarkerShow(kind) {
    const el = this.hitmarker;
    el.classList.remove('show', 'head', 'kill');
    void el.offsetWidth; // reflow to restart the animation
    el.classList.add('show');
    if (kind === 'head') el.classList.add('head');
    if (kind === 'kill') el.classList.add('kill');
  }

  killfeedAdd(name, head) {
    const row = this._el('div', 'killrow');
    const ign = (name || 'Agent').replace(/[<>&]/g, '');
    row.innerHTML = `<span class="kf-name">${ign}</span> <span class="kf-arrow ${head ? 'kf-head' : ''}">${head ? '◈' : '▸'}</span> BOT`;
    this.killfeed.appendChild(row);
    setTimeout(() => row.classList.add('fade'), 2300);
    setTimeout(() => row.remove(), 2900);
  }

  setViewMode(mode) {
    this.viewmode.innerHTML = `VIEW <b>${mode === 'first' ? '1ST' : '3RD'}</b> · [V]`;
  }

  setAbilities(state) {
    for (const a of ABILITIES) {
      const s = state[a.key];
      if (!s) continue;
      const slot = this.abilities.querySelector(`.abil[data-abil="${a.key}"]`);
      const cnt = this.abilities.querySelector(`.abil-count[data-count="${a.key}"]`);
      if (cnt) cnt.textContent = String(s.count);
      if (slot) slot.classList.toggle('ready', s.ready);
    }
  }

  setWeaponCrosshair(id, scopedADS) {
    this.weaponId = id;
    this.baseGap = BASE_GAP[modelKeyFor(id)] ?? this.settings.crosshairGap;
    this._setGap(this.baseGap + this.bloom);
    // scoped sniper: hide crosshair, show scope
    this.crosshair.classList.toggle('hidden', scopedADS);
    this.scope.classList.toggle('show', scopedADS);
  }

  update(dt) {
    if (this.bloom > 0) {
      this.bloom = Math.max(0, this.bloom - dt * 60);
      this._setGap(this.baseGap + this.bloom);
    }
  }

  _wire() {
    bus.on(EV.WEAPON_SWITCHED, ({ slot, id, primaryName, sidearmName }) => {
      this.setSlotNames(primaryName, sidearmName);
      this.setActiveSlot(slot);
      this.setWeaponCrosshair(id, false);
    });
    bus.on('abilities:update', (state) => this.setAbilities(state));
    bus.on(EV.WEAPON_AMMO, (a) => this.setAmmo(a));
    bus.on(EV.WEAPON_RELOAD, ({ reloading, progress }) => {
      this.ammo.classList.toggle('reloading', reloading);
      this.setReloadProgress(progress || 0);
    });
    bus.on(EV.ADS_CHANGED, ({ isADS, scoped, weaponId }) => {
      this.setWeaponCrosshair(weaponId, isADS && scoped);
    });
    bus.on(EV.COMBAT_FIRED, ({ weapon }) => {
      const noBloom = weapon.type === 'melee' || weapon.category === 'special';
      this.bloom = Math.min(14, this.bloom + (noBloom ? 0 : 5));
    });
    bus.on(EV.COMBAT_HIT, ({ zone, dead }) => {
      this._lastHitHead = zone === 'head';
      this.hitmarkerShow(dead ? 'kill' : zone === 'head' ? 'head' : 'body');
    });
    bus.on(EV.COMBAT_KILL, () => this.killfeedAdd(this.settings.ign, this._lastHitHead));
    bus.on(EV.SCORE_UPDATE, (s) => this.setScore(s));
    bus.on(EV.CAMERA_MODE, (mode) => this.setViewMode(mode));
    bus.on(EV.RANGE_SETTINGS, (snap) => this.setRangePanel(snap));
    bus.on(EV.PLAYER_HEALTH, (h) => this.setHealth(h));
    bus.on(EV.SKIRMISH_STATE, (s) => this.setSkirmish(s));
    bus.on(EV.SKIRMISH_ANNOUNCE, (a) => this.announceShow(a.text, a.sub));
  }
}

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
  shotgun: '<svg viewBox="0 0 64 32"><path d="M2 12h54v6H22v8h-7v-8H2z M40 13h18v3H40z"/></svg>',
  mg: '<svg viewBox="0 0 64 32"><path d="M2 11h58v8H24v7h-9v-7H2z M6 19h12v6H6z"/></svg>',
  heavy: '<svg viewBox="0 0 64 32"><path d="M2 12h52v8H2z M54 13h8v6h-8z M14 20h10v6H14z"/></svg>',
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

  /** Screen blind while the camera is inside a smoke (0..1). */
  setSmoke(amount) {
    this.smokescreen.style.opacity = String(Math.min(0.94, amount));
  }

  _el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  _build() {
    this.root.innerHTML = '';

    // smoke blind (behind everything else in the HUD layer; fills the view inside a smoke)
    this.smokescreen = this._el('div'); this.smokescreen.id = 'smokescreen';
    this.root.appendChild(this.smokescreen);

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

    // zombie survival status bar (hidden outside zombie mode)
    this.zombiebar = this._el('div'); this.zombiebar.id = 'zombiebar';
    this.zombiebar.innerHTML =
      '<span class="zb-wave" id="zb-wave">WAVE 1/5</span>' +
      '<span class="zb-sub" id="zb-sub"></span>' +
      '<span class="zb-lives" id="zb-lives">◆◆◆</span>' +
      '<span class="zb-credits" id="zb-credits">¤ 0</span>';
    this.root.appendChild(this.zombiebar);

    // team deathmatch scoreboard
    this.tdmbar = this._el('div'); this.tdmbar.id = 'tdmbar';
    this.tdmbar.innerHTML =
      '<span class="td-side ally">ALLIES</span><span class="td-score ally" id="td-a">0</span>' +
      '<span class="du-dash">—</span>' +
      '<span class="td-score enemy" id="td-e">0</span><span class="td-side enemy">ENEMIES</span>' +
      '<span class="td-target" id="td-target"></span>';
    this.root.appendChild(this.tdmbar);

    // aim trainer (gridshot) status bar
    this.aimbar = this._el('div'); this.aimbar.id = 'aimbar';
    this.aimbar.innerHTML =
      '<span class="ab-time" id="ab-time">0:60</span>' +
      '<span class="ab-stat">SCORE <b id="ab-score">0</b></span>' +
      '<span class="ab-stat">ACC <b id="ab-acc">100%</b></span>' +
      '<span class="ab-stat">STREAK <b id="ab-streak">0</b></span>';
    this.root.appendChild(this.aimbar);

    // death combat report (TDM) — skeleton figure shows hit zones
    const body = (p) =>
      `<svg viewBox="0 0 24 40" class="cr-body">` +
      `<circle class="z-head" cx="12" cy="5" r="4"/>` +
      `<rect class="z-body" x="6.5" y="10" width="11" height="14" rx="2.5"/>` +
      `<rect class="z-legs" x="7.6" y="24" width="3.4" height="13" rx="1.4"/>` +
      `<rect class="z-legs" x="13" y="24" width="3.4" height="13" rx="1.4"/>` +
      `</svg>` +
      `<div class="cr-zones"><span>HEAD <b class="z-head-n">0</b></span><span>BODY <b class="z-body-n">0</b></span><span>LEGS <b class="z-legs-n">0</b></span></div>`;
    this.combatreport = this._el('div'); this.combatreport.id = 'combatreport';
    this.combatreport.innerHTML =
      '<div class="cr-killed">ELIMINATED BY <span id="cr-killer">ENEMY</span><span id="cr-weap" class="cr-weap"></span></div>' +
      '<div class="cr-title">COMBAT REPORT</div>' +
      '<div class="cr-cols">' +
        `<div class="cr-col out" id="cr-out-col"><div class="cr-h">OUTGOING</div>${body('o')}<div class="cr-big" id="cr-out">0</div><div class="cr-sub">total dmg</div></div>` +
        '<div class="cr-col mid"><div class="cr-h">KILLS</div><div class="cr-big cyan" id="cr-kills">0</div></div>' +
        `<div class="cr-col in" id="cr-in-col"><div class="cr-h">INCOMING</div>${body('i')}<div class="cr-big red" id="cr-in">0</div><div class="cr-sub">total dmg</div></div>` +
      '</div>';
    this.root.appendChild(this.combatreport);

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

  /** Clear all mode status bars — called on every mode switch so none linger. */
  hideModeBars() {
    this.aimbar.classList.remove('show');
    this.zombiebar.classList.remove('show');
    this.duelbar.classList.remove('show');
    this.tdmbar.classList.remove('show');
    this.enemyhp.classList.remove('show');
    if (this.combatreport) this.combatreport.classList.remove('show');
    this.rangepanel.style.display = '';
  }

  setCombatReport(r) {
    this.combatreport.classList.toggle('show', !!r.show);
    if (!r.show) return;
    document.getElementById('cr-killer').textContent = (r.killer || 'ENEMY').toUpperCase();
    document.getElementById('cr-weap').textContent = r.killerWeapon ? ' · ' + r.killerWeapon : '';
    document.getElementById('cr-out').textContent = String(r.dmgOut || 0);
    document.getElementById('cr-kills').textContent = String(r.kills || 0);
    document.getElementById('cr-in').textContent = String(r.dmgIn || 0);
    this._fillBody(document.getElementById('cr-out-col'), r.out || {});
    this._fillBody(document.getElementById('cr-in-col'), r.in || {});
  }

  /** Colour the skeleton zones that took damage + fill their numbers. */
  _fillBody(col, z) {
    if (!col) return;
    for (const [key, val] of [['head', z.head || 0], ['body', z.body || 0], ['legs', z.leg || 0]]) {
      for (const el of col.querySelectorAll('.z-' + key)) el.classList.toggle('hit', val > 0);
      const n = col.querySelector('.z-' + key + '-n');
      if (n) n.textContent = String(val);
    }
  }

  setTDM(s) {
    this.tdmbar.classList.toggle('show', !!s.active);
    this.rangepanel.style.display = s.active ? 'none' : '';
    if (!s.active) return;
    document.getElementById('td-a').textContent = String(s.ally);
    document.getElementById('td-e').textContent = String(s.enemy);
    document.getElementById('td-target').textContent = 'FIRST TO ' + s.target;
  }

  setAim(s) {
    this.aimbar.classList.toggle('show', !!s.active);
    this.rangepanel.style.display = s.active ? 'none' : '';
    if (!s.active) return;
    const t = Math.max(0, s.time | 0);
    document.getElementById('ab-time').textContent = `0:${String(t).padStart(2, '0')}`;
    document.getElementById('ab-time').classList.toggle('low', !s.countdown && t <= 10);
    document.getElementById('ab-score').textContent = String(s.score);
    document.getElementById('ab-acc').textContent = s.acc + '%';
    document.getElementById('ab-streak').textContent = String(s.streak);
  }

  setZombie(s) {
    this.zombiebar.classList.toggle('show', !!s.active);
    this.enemyhp.classList.toggle('show', !!(s.active && s.boss));
    this.rangepanel.style.display = s.active ? 'none' : ''; // declutter in zombie mode
    if (!s.active) return;
    document.getElementById('zb-wave').textContent = s.boss ? 'BOSS' : `WAVE ${s.wave}/${s.totalWaves}`;
    document.getElementById('zb-sub').textContent = s.intermission ? `NEXT WAVE ${s.intermission}s` : `${s.zombiesLeft} LEFT`;
    document.getElementById('zb-lives').textContent = '◆'.repeat(Math.max(0, s.lives)) + '◇'.repeat(Math.max(0, 3 - s.lives));
    document.getElementById('zb-credits').textContent = '¤ ' + s.credits;
    if (s.boss) {
      document.getElementById('eh-name').textContent = 'THE GRAVEKEEPER';
      const fill = document.getElementById('eh-fill');
      if (fill) fill.style.width = Math.max(0, Math.round(100 * s.bossHealth / (s.bossMax || 1))) + '%';
    }
  }

  showPickup(type) {
    const labels = { health: '+45 HP', speed: 'SPEED BOOST', damage: '2× DAMAGE', ammo: 'AMMO REFILLED' };
    this.commsfeed.innerHTML = `<span class="cf-name">PICKUP</span> ${labels[type] || type}`;
    this._flash(this.commsfeed);
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
    const s = this.settings;
    const r = document.documentElement.style;
    r.setProperty('--cross-color', s.crosshairColor);
    r.setProperty('--cross-len', (s.crosshairLength ?? 8) + 'px');
    r.setProperty('--cross-thick', (s.crosshairThickness ?? 2) + 'px');
    r.setProperty('--cross-dot', (s.crosshairDotSize ?? 3) + 'px');
    r.setProperty('--cross-shadow', s.crosshairOutline ? '0 0 2px rgba(0,0,0,0.95), 0 0 1px rgba(0,0,0,1)' : 'none');
    if (this.crosshair) this.crosshair.classList.toggle('no-dot', !s.crosshairDot);
    this.baseGap = s.crosshairGap;
    this._setGap(this.baseGap + (this.bloom || 0));
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
    this._botMode = snap.botMode;
    if (this.aimbar && snap.botMode !== 'aim') this.aimbar.classList.remove('show'); // never linger outside aim mode
    document.getElementById('rp-mode').textContent = snap.botMode.toUpperCase();
    document.getElementById('rp-armor').textContent = snap.botArmor ? 'ENABLED' : 'DISABLED';
    document.getElementById('rp-ammo').textContent = snap.infiniteAmmo ? 'ENABLED' : 'DISABLED';
    this._applyCrosshairStyle();
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

  killfeedAdd(name, head, weaponId, victim = 'BOT') {
    this.killfeedEntry({ killer: name, killerTeam: 'ally', victim, victimTeam: 'enemy', weaponId, head });
  }

  killfeedEntry({ killer, killerTeam, victim, victimTeam, weaponId, head }) {
    const esc = (s) => (s || '?').replace(/[<>&]/g, '');
    const cls = (t) => (t === 'enemy' ? 'kf-enemy' : 'kf-ally');
    const icon = WEAPON_ICONS[modelKeyFor(weaponId)] || WEAPON_ICONS.rifle;
    const row = this._el('div', 'killrow');
    row.classList.add(killerTeam === 'enemy' ? 'kf-row-enemy' : 'kf-row-ally');
    row.innerHTML =
      `<span class="kf-name ${cls(killerTeam)}">${esc(killer)}</span>` +
      `<span class="kf-gun ${head ? 'kf-head' : ''}">${icon}</span>` +
      (head ? '<span class="kf-hs">◈</span>' : '') +
      `<span class="kf-victim ${cls(victimTeam)}">${esc(victim)}</span>`;
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
    // editor gap is the baseline (rifle); other weapons keep their relative offset
    const off = (BASE_GAP[modelKeyFor(id)] ?? BASE_GAP.rifle) - BASE_GAP.rifle;
    this.baseGap = Math.max(0, this.settings.crosshairGap + off);
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
      const noBloom = weapon.type === 'melee' || weapon.category === 'special' || !this.settings.crosshairDynamic;
      this.bloom = Math.min(14, this.bloom + (noBloom ? 0 : 5));
    });
    bus.on(EV.COMBAT_HIT, ({ zone, dead }) => {
      this._lastHitHead = zone === 'head';
      this.hitmarkerShow(dead ? 'kill' : zone === 'head' ? 'head' : 'body');
    });
    bus.on(EV.COMBAT_KILL, ({ weaponId }) => { if (this._botMode !== 'tdm') this.killfeedAdd(this.settings.ign, this._lastHitHead, weaponId); });
    bus.on(EV.TDM_KILL, (e) => this.killfeedEntry(e));
    bus.on(EV.SCORE_UPDATE, (s) => this.setScore(s));
    bus.on(EV.CAMERA_MODE, (mode) => this.setViewMode(mode));
    bus.on(EV.RANGE_SETTINGS, (snap) => this.setRangePanel(snap));
    bus.on(EV.PLAYER_HEALTH, (h) => this.setHealth(h));
    bus.on(EV.SKIRMISH_STATE, (s) => this.setSkirmish(s));
    bus.on(EV.SKIRMISH_ANNOUNCE, (a) => this.announceShow(a.text, a.sub));
    bus.on(EV.ZOMBIE_STATE, (s) => this.setZombie(s));
    bus.on(EV.ZOMBIE_ANNOUNCE, (a) => this.announceShow(a.text, a.sub));
    bus.on(EV.AIM_STATE, (s) => this.setAim(s));
    bus.on(EV.AIM_ANNOUNCE, (a) => this.announceShow(a.text, a.sub));
    bus.on(EV.TDM_STATE, (s) => this.setTDM(s));
    bus.on(EV.TDM_ANNOUNCE, (a) => this.announceShow(a.text, a.sub));
    bus.on(EV.TDM_REPORT, (r) => this.setCombatReport(r));
    bus.on(EV.PICKUP, ({ type }) => this.showPickup(type));
  }
}

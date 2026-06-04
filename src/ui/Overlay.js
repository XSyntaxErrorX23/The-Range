import { CATEGORIES, WEAPONS, modelKeyFor } from '../weapons/weapons.config.js';
import { VERSION, PATCH_NOTES } from '../version.js';

const BUY_ICON = {
  pistol: '<svg viewBox="0 0 64 32"><path d="M4 10h40v8H30l-2 8h-8l1-8H4z"/></svg>',
  smg: '<svg viewBox="0 0 64 32"><path d="M2 10h48v6H40l-1 10h-7l-1-10H22v6h-8v-6H2z"/></svg>',
  shotgun: '<svg viewBox="0 0 64 32"><path d="M2 12h54v6H22v8h-7v-8H2z M40 13h18v3H40z"/></svg>',
  rifle: '<svg viewBox="0 0 64 32"><path d="M2 12h58v5H44l-1 9h-6l-1-9H20v5h-6v-5H2z"/></svg>',
  sniper: '<svg viewBox="0 0 64 32"><path d="M2 13h60v4H46l-1 9h-5l-1-9H18v4h-5v-4H2z M24 7h14v3H24z"/></svg>',
  mg: '<svg viewBox="0 0 64 32"><path d="M2 11h58v8H24v7h-9v-7H2z M6 19h12v6H6z"/></svg>',
  heavy: '<svg viewBox="0 0 64 32"><path d="M2 12h52v8H2z M54 13h8v6h-8z M14 20h10v6H14z M2 9h20v3H2z"/></svg>',
};

// Mode card icons (stroke SVGs, inherit colour via currentColor)
const MODE_ICONS = {
  practice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7.5" r="3.2"/><path d="M5.5 20.5c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5"/></svg>',
  skirmish: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" y1="14" x2="9" y2="18"/><line x1="7" y1="17" x2="4" y2="20"/><line x1="3" y1="19" x2="5" y2="21"/></svg>',
  zombie: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><path d="M8 20v2h8v-2"/><path d="m12.5 17-.5-1-.5 1h1z"/><path d="M16 20a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20"/></svg>',
  aim: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  tdm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
};

const CONTROLS = [
  ['WASD', 'Move'], ['Shift', 'Walk'], ['Ctrl', 'Crouch'], ['Space', 'Jump'],
  ['Mouse', 'Look'], ['LMB', 'Fire'], ['RMB', 'Aim (ADS) / Classic burst'], ['R', 'Reload'],
  ['1 / 2 / 3', 'Primary / Pistol / Knife'], ['Y', 'Inspect weapon'], ['B', 'Armory (buy menu)'], ['Wheel', 'Cycle weapons'],
  ['C', 'Cloudburst (smoke)'], ['Q', 'Updraft'], ['E', 'Tailwind (dash)'], ['X', 'Blade Storm'],
  ['V', 'Toggle 1st/3rd person'], ['`', 'Radio comms'], ['F2', 'Range settings'], ['Esc', 'Pause'],
];

/**
 * Menu/overlay layer: Start (click-to-play), Pause, Settings, Weapon Picker and
 * Controls help. Pointer-lock-aware — Game distinguishes "a menu is open" from
 * an Esc-pause via anyOpen().
 *
 * Game wires callbacks: onPlay, onResume, onPickPrimary, onReset.
 */
export class Overlay {
  constructor(rootEl, settings, audio) {
    this.root = rootEl;
    this.settings = settings;
    this.audio = audio;
    this.current = null;

    this.onPlay = () => {};
    this.onResume = () => {};
    this.onBuy = () => {};
    this.getLoadout = () => ({});
    this.onReset = () => {};
    this.onRematch = () => {};
    this.onExitSkirmish = () => {};
    this.onContinue = () => {};
    this.onMainMenu = () => {};
    this.heavyUnlocked = false; // heavy ordnance column shows only in zombie endless
    this.getStats = () => ({ session: {}, lifetime: {} });
    this.onResetLifetime = () => {};
    this.getCredits = () => null; // null => free buying (non-zombie modes)
    this.onBuyAmmo = () => {};
    this.onBuyArmor = () => {};

    this._build();
    this._buyKeyHandler = this._buyKeyHandler.bind(this);
    this._pauseKeyHandler = this._pauseKeyHandler.bind(this);
    this._pauseEscReady = false;
  }

  anyOpen() { return this.current != null; }

  _modal(id) {
    const m = document.createElement('div');
    m.className = 'modal';
    m.id = id;
    this.root.appendChild(m);
    return m;
  }

  _btn(label, cls, onClick) {
    const b = document.createElement('button');
    b.className = 'btn ' + (cls || '');
    b.textContent = label;
    b.addEventListener('click', () => { this.audio && this.audio.ui(); onClick(); });
    return b;
  }

  _build() {
    // ---- welcome / start ----
    this.start = this._modal('m-start');
    const sp = document.createElement('div'); sp.className = 'panel welcome';
    const returning = this.settings.seenWelcome;
    sp.innerHTML =
      `<div class="version-badge">v${VERSION}</div>` +
      '<h1>THE <span class="accent">RANGE</span></h1>' +
      `<div class="subtitle">${returning ? 'Welcome back, agent' : 'Practice · Skills Test'}</div>`;

    // mode selector (Practice / Skirmish / Zombie)
    this._practiceMode = ['skirmish', 'zombie', 'aim', 'tdm'].includes(this.settings.botMode) ? 'static' : this.settings.botMode;
    this.modeRow = this._el('div', 'mode-row');
    const mkMode = (key, title, desc) => {
      const b = document.createElement('button');
      b.className = 'mode-btn';
      b.dataset.mode = key;
      b.innerHTML = `<span class="mode-icon">${MODE_ICONS[key] || ''}</span>` +
        `<span class="mode-title">${title}</span><span class="mode-desc">${desc}</span>`;
      b.addEventListener('click', () => { this.audio && this.audio.ui(); this._selectMode(key); });
      return b;
    };
    this.modeRow.appendChild(mkMode('practice', 'PRACTICE RANGE', 'Drills & dummies'));
    this.modeRow.appendChild(mkMode('skirmish', 'SKIRMISH 1V1', 'Duel a bot · first to 5'));
    this.modeRow.appendChild(mkMode('zombie', 'ZOMBIE SURVIVAL', 'Waves · boss · survive'));
    this.modeRow.appendChild(mkMode('aim', 'AIM TRAINER', 'Gridshot · 60s flick drill'));
    this.modeRow.appendChild(mkMode('tdm', 'TEAM DEATHMATCH', '5v5 · Nuketown'));
    sp.appendChild(this.modeRow);

    // IGN entry
    const ignRow = this._el('div', 'ign-row');
    ignRow.appendChild(this._el('label', null, 'IGN'));
    this.ignInput = document.createElement('input');
    this.ignInput.type = 'text';
    this.ignInput.maxLength = 16;
    this.ignInput.placeholder = 'Agent';
    this.ignInput.value = this.settings.ign || '';
    this.ignInput.spellcheck = false;
    this.ignInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._play(); });
    ignRow.appendChild(this.ignInput);
    sp.appendChild(ignRow);

    const playBtn = this._btn('ENTER THE RANGE', 'big', () => this._play());
    sp.appendChild(playBtn);
    sp.appendChild(document.createElement('br'));
    sp.appendChild(this._btn('PATCH NOTES', 'secondary', () => this.openPatchNotes()));

    const cg = document.createElement('div'); cg.className = 'controls-grid';
    cg.innerHTML = CONTROLS.map(([k, d]) => `<div class="k">${k}</div><div class="d">${d}</div>`).join('');
    sp.appendChild(cg);
    sp.appendChild(this._el('div', 'hint', 'Clicking locks the mouse. Press Esc to pause.'));
    this.start.appendChild(sp);

    // ---- patch notes ----
    this.patchnotes = this._modal('m-patch');
    const pn = document.createElement('div'); pn.className = 'panel patchnotes';
    pn.innerHTML = `<h2>PATCH NOTES <span class="version-badge inline">v${VERSION}</span></h2>`;
    const list = this._el('div', 'patch-list');
    list.innerHTML = PATCH_NOTES.map((p) =>
      `<div class="patch-entry"><div class="patch-head"><span class="pv">v${p.version}</span>` +
      `<span class="pt">${p.title}</span><span class="pd">${p.date}</span></div>` +
      `<ul>${p.notes.map((n) => `<li>${n}</li>`).join('')}</ul></div>`
    ).join('');
    pn.appendChild(list);
    pn.appendChild(this._btn('BACK', 'secondary', () => this.showStart()));
    this.patchnotes.appendChild(pn);

    // ---- pause ----
    this.pause = this._modal('m-pause');
    const pp = document.createElement('div'); pp.className = 'panel';
    pp.innerHTML = '<h2>PAUSED</h2>';
    pp.appendChild(this._btn('RESUME', 'big', () => this.onResume()));
    pp.appendChild(document.createElement('br'));
    pp.appendChild(this._btn('SETTINGS', 'secondary', () => this.openSettings()));
    pp.appendChild(this._btn('STATS', 'secondary', () => this.openStats()));
    pp.appendChild(this._btn('CONTROLS', 'secondary', () => this.openControls()));
    pp.appendChild(this._btn('MAIN MENU', 'secondary', () => this.onMainMenu()));
    pp.appendChild(this._btn('RESET STATS', 'secondary', () => { this.onReset(); }));
    this.pause.appendChild(pp);

    // ---- stats ----
    this.statsModal = this._modal('m-stats');
    this.statsPanel = document.createElement('div'); this.statsPanel.className = 'panel stats-panel';
    this.statsModal.appendChild(this.statsPanel);

    // ---- settings ----
    this.settingsModal = this._modal('m-settings');
    this.settingsPanel = document.createElement('div'); this.settingsPanel.className = 'panel';
    this.settingsModal.appendChild(this.settingsPanel);
    this._buildSettings();

    // ---- crosshair editor ----
    this.crosshairModal = this._modal('m-crosshair');
    this.crosshairPanel = document.createElement('div'); this.crosshairPanel.className = 'panel';
    this.crosshairModal.appendChild(this.crosshairPanel);

    // ---- controls help ----
    this.controls = this._modal('m-controls');
    const cp = document.createElement('div'); cp.className = 'panel';
    cp.innerHTML = '<h2>CONTROLS</h2>';
    const cg2 = document.createElement('div'); cg2.className = 'controls-grid';
    cg2.innerHTML = CONTROLS.map(([k, d]) => `<div class="k">${k}</div><div class="d">${d}</div>`).join('');
    cp.appendChild(cg2);
    cp.appendChild(this._btn('BACK', 'secondary', () => this.showPause()));
    this.controls.appendChild(cp);

    // ---- skirmish result ----
    this.result = this._modal('m-result');
    const rp = document.createElement('div'); rp.className = 'panel';
    this.resultTitle = this._el('h1', 'result-title', 'VICTORY');
    this.resultScore = this._el('div', 'result-score', '0 — 0');
    rp.appendChild(this.resultTitle);
    rp.appendChild(this.resultScore);
    rp.appendChild(document.createElement('br'));
    this.resultContinue = this._btn('CONTINUE — ENDLESS', 'big', () => this.showNewContent());
    this.resultContinue.style.display = 'none';
    rp.appendChild(this.resultContinue);
    rp.appendChild(this._btn('REMATCH', 'big', () => this.onRematch()));
    rp.appendChild(document.createElement('br'));
    rp.appendChild(this._btn('EXIT TO RANGE', 'secondary', () => this.onExitSkirmish()));
    this.result.appendChild(rp);

    // ---- endless "new content" briefing (shown when continuing past wave 5) ----
    this.newContent = this._modal('m-newcontent');
    const ncp = this._el('div', 'panel newcontent');
    ncp.innerHTML =
      '<h2>ENDLESS UNLOCKED</h2>' +
      '<p class="nc-lead">The Gravekeeper has fallen — but the dead keep rising. New horrors crawl from the graves, and new firepower is yours to claim.</p>' +
      '<div class="nc-list">' +
        '<div class="nc-item nc-foe"><b>Brute Zombie</b><span>A hulking tank — massive health, crushing hits.</span></div>' +
        '<div class="nc-item nc-foe"><b>Flying Zombie</b><span>Swoops in from above — fast and fragile.</span></div>' +
        '<div class="nc-item nc-gun"><b>Ion Repeater</b><span>Rapid energy laser — melt the horde.</span></div>' +
        '<div class="nc-item nc-gun"><b>Grave Launcher</b><span>Rocket launcher — explosive area blast.</span></div>' +
      '</div>' +
      '<p class="nc-foot">The new weapons are now in the Armory — open it with [B].</p>';
    ncp.appendChild(this._btn('BRING IT ON', 'big', () => this.onContinue()));
    this.newContent.appendChild(ncp);

    // ---- buy menu (Armory) ----
    this.buymenu = this._modal('m-buy');
    const bp = document.createElement('div'); bp.className = 'panel buymenu';
    bp.innerHTML = '<h2>ARMORY <span id="buy-credits" class="buy-credits"></span></h2>';
    const cols = this._el('div', 'buy-cols');
    for (const cat of CATEGORIES) {
      const col = this._el('div', 'buy-col');
      if (cat.key === 'heavy') col.classList.add('buy-col-heavy'); // hidden until endless
      col.appendChild(this._el('div', 'buy-cat', cat.label));
      for (const id of cat.ids) {
        const w = WEAPONS[id];
        const cell = this._el('div', 'buy-cell');
        cell.dataset.id = id;
        cell.innerHTML = `${BUY_ICON[modelKeyFor(id)] || ''}<div class="bw-name">${w.name}</div><div class="bw-price">¤ ${w.price}</div>`;
        cell.addEventListener('click', () => this._buy(id));
        col.appendChild(cell);
      }
      cols.appendChild(col);
    }
    bp.appendChild(cols);
    this.buyAmmoBtn = this._btn('REFILL AMMO  ¤ 200', 'secondary', () => { this.onBuyAmmo(); this._refreshBuyHighlights(); });
    this.buyAmmoBtn.style.display = 'none';
    bp.appendChild(this.buyAmmoBtn);
    this.buyArmorBtn = this._btn('BUY ARMOR  ¤ 500', 'secondary', () => { this.onBuyArmor(); this._refreshBuyHighlights(); });
    this.buyArmorBtn.style.display = 'none';
    bp.appendChild(this.buyArmorBtn);
    bp.appendChild(this._el('div', 'hint', 'Click a weapon to equip · [B] or Esc to close'));
    bp.appendChild(this._btn('CLOSE', 'big', () => this._closeBuy()));
    this.buymenu.appendChild(bp);
  }

  _buildSettings() {
    const s = this.settings;
    const p = this.settingsPanel;
    p.innerHTML = '<h2>SETTINGS</h2>';

    p.appendChild(this._slider('Mouse Sensitivity', 0.2, 3, 0.05, s.sensitivity, (v) => { s.set('sensitivity', v); }, (v) => v.toFixed(2)));
    p.appendChild(this._slider('Field of View', 70, 110, 1, s.fov, (v) => { s.set('fov', v); }, (v) => v + '°'));
    p.appendChild(this._slider('Volume', 0, 1, 0.05, s.volume, (v) => { s.set('volume', v); }, (v) => Math.round(v * 100) + '%'));

    p.appendChild(this._select('View', [['first', 'First person'], ['third', 'Third person']], s.view, (v) => s.set('view', v)));
    p.appendChild(this._select('Bot Mode', [['static', 'Static'], ['strafe', 'Strafing'], ['popup', 'Pop-up drill'], ['skirmish', 'Skirmish (1v1)'], ['zombie', 'Zombie Survival'], ['aim', 'Aim Trainer'], ['tdm', 'Team Deathmatch (5v5)']], s.botMode, (v) => s.set('botMode', v)));
    p.appendChild(this._select('AI Difficulty', [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']], s.aiDifficulty, (v) => s.set('aiDifficulty', v)));
    p.appendChild(this._select('Scope Mode (snipers)', [['hold', 'Hold'], ['toggle', 'Toggle']], s.scopeMode, (v) => s.set('scopeMode', v)));
    p.appendChild(this._select('ADS Mode (rifles)', [['hold', 'Hold'], ['toggle', 'Toggle']], s.adsMode, (v) => s.set('adsMode', v)));
    p.appendChild(this._toggle('Bot Armor', s.botArmor, (v) => s.set('botArmor', v)));
    p.appendChild(this._toggle('Infinite Ammo', s.infiniteAmmo, (v) => s.set('infiniteAmmo', v)));

    p.appendChild(this._btn('CROSSHAIR EDITOR', 'secondary', () => this.openCrosshair()));

    const ignRow = this._el('div', 'set-row');
    ignRow.appendChild(this._el('label', null, 'IGN (Name)'));
    const ti = document.createElement('input');
    ti.type = 'text'; ti.maxLength = 16; ti.value = s.ign; ti.spellcheck = false; ti.className = 'ign-field';
    ti.addEventListener('change', () => s.set('ign', (ti.value || '').trim().slice(0, 16) || 'Agent'));
    ignRow.appendChild(ti);
    p.appendChild(ignRow);

    p.appendChild(this._btn('BACK', 'secondary', () => this.showPause()));
  }

  _buildCrosshair() {
    const s = this.settings;
    const p = this.crosshairPanel;
    p.innerHTML = '<h2>CROSSHAIR EDITOR</h2>';

    // live preview box
    const wrap = this._el('div', 'ch-preview-wrap');
    this.chPreview = this._el('div'); this.chPreview.id = 'ch-preview';
    this.chPreview.innerHTML =
      '<div class="ch-line ch-top"></div><div class="ch-line ch-bottom"></div>' +
      '<div class="ch-line ch-left"></div><div class="ch-line ch-right"></div>' +
      '<div class="ch-dot"></div>';
    wrap.appendChild(this.chPreview);
    p.appendChild(wrap);

    // controls — each persists + refreshes the preview & code
    const upd = () => { this._renderCrosshairPreview(); this._refreshCrosshairCode(); };
    p.appendChild(this._slider('Gap', 0, 20, 1, s.crosshairGap, (v) => { s.set('crosshairGap', v); upd(); }, (v) => String(v)));
    p.appendChild(this._slider('Length', 0, 30, 1, s.crosshairLength, (v) => { s.set('crosshairLength', v); upd(); }, (v) => String(v)));
    p.appendChild(this._slider('Thickness', 1, 8, 1, s.crosshairThickness, (v) => { s.set('crosshairThickness', v); upd(); }, (v) => String(v)));
    p.appendChild(this._toggle('Center Dot', s.crosshairDot, (v) => { s.set('crosshairDot', v); upd(); }));
    p.appendChild(this._slider('Dot Size', 1, 8, 1, s.crosshairDotSize, (v) => { s.set('crosshairDotSize', v); upd(); }, (v) => String(v)));
    p.appendChild(this._toggle('Outline', s.crosshairOutline, (v) => { s.set('crosshairOutline', v); upd(); }));
    p.appendChild(this._toggle('Dynamic (expand when firing)', s.crosshairDynamic, (v) => { s.set('crosshairDynamic', v); }));

    const color = this._el('div', 'set-row');
    color.appendChild(this._el('label', null, 'Color'));
    const ci = document.createElement('input'); ci.type = 'color'; ci.value = s.crosshairColor;
    ci.addEventListener('input', () => { s.set('crosshairColor', ci.value); upd(); });
    color.appendChild(ci);
    p.appendChild(color);

    // import / export code
    const codeRow = this._el('div', 'set-row ch-code');
    codeRow.appendChild(this._el('label', null, 'Code'));
    this.chCodeInput = document.createElement('input');
    this.chCodeInput.type = 'text'; this.chCodeInput.spellcheck = false; this.chCodeInput.className = 'ign-field';
    codeRow.appendChild(this.chCodeInput);
    p.appendChild(codeRow);

    const btns = this._el('div', 'ch-code-btns');
    btns.appendChild(this._btn('COPY', 'secondary', () => {
      try { navigator.clipboard && navigator.clipboard.writeText(this.chCodeInput.value); } catch (_) {}
      this.chCodeInput.select && this.chCodeInput.select();
    }));
    btns.appendChild(this._btn('IMPORT', 'secondary', () => {
      const ok = this._applyCrosshairCode(this.chCodeInput.value);
      if (ok) this._buildCrosshair(); // rebuild controls from imported values
      else { this.chCodeInput.classList.add('bad'); setTimeout(() => this.chCodeInput.classList.remove('bad'), 600); }
    }));
    btns.appendChild(this._btn('RESET', 'secondary', () => {
      s.set('crosshairColor', '#46e0d6'); s.set('crosshairGap', 6); s.set('crosshairLength', 8);
      s.set('crosshairThickness', 2); s.set('crosshairDot', true); s.set('crosshairDotSize', 3); s.set('crosshairOutline', true);
      s.set('crosshairDynamic', true);
      this._buildCrosshair();
    }));
    p.appendChild(btns);

    p.appendChild(this._btn('BACK', 'secondary', () => this.openSettings()));

    this._renderCrosshairPreview();
    this._refreshCrosshairCode();
  }

  _renderCrosshairPreview() {
    const s = this.settings, el = this.chPreview;
    if (!el) return;
    el.style.setProperty('--cross-color', s.crosshairColor);
    el.style.setProperty('--cross-len', s.crosshairLength + 'px');
    el.style.setProperty('--cross-thick', s.crosshairThickness + 'px');
    el.style.setProperty('--cross-dot', s.crosshairDotSize + 'px');
    el.style.setProperty('--gap', s.crosshairGap + 'px');
    el.style.setProperty('--cross-shadow', s.crosshairOutline ? '0 0 2px rgba(0,0,0,0.95), 0 0 1px rgba(0,0,0,1)' : 'none');
    el.classList.toggle('no-dot', !s.crosshairDot);
  }

  /** Compact, shareable crosshair code (Valorant-style). */
  _crosshairCode() {
    const s = this.settings;
    const hex = (s.crosshairColor || '#46e0d6').replace('#', '').toLowerCase();
    return ['RNG1', hex, s.crosshairGap, s.crosshairLength, s.crosshairThickness,
      s.crosshairDot ? 1 : 0, s.crosshairDotSize, s.crosshairOutline ? 1 : 0,
      s.crosshairDynamic ? 1 : 0].join('-');
  }

  _refreshCrosshairCode() { if (this.chCodeInput) this.chCodeInput.value = this._crosshairCode(); }

  _applyCrosshairCode(code) {
    const parts = (code || '').trim().split('-');
    if (parts[0] !== 'RNG1' || parts.length < 8) return false;
    const [, hex, gap, len, th, dot, ds, out, dyn] = parts;
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return false;
    const num = (v, lo, hi, d) => { const n = parseFloat(v); return isNaN(n) ? d : Math.max(lo, Math.min(hi, Math.round(n))); };
    const s = this.settings;
    s.set('crosshairColor', '#' + hex.toLowerCase());
    s.set('crosshairGap', num(gap, 0, 20, 6));
    s.set('crosshairLength', num(len, 0, 30, 8));
    s.set('crosshairThickness', num(th, 1, 8, 2));
    s.set('crosshairDot', dot === '1');
    s.set('crosshairDotSize', num(ds, 1, 8, 3));
    s.set('crosshairOutline', out === '1');
    s.set('crosshairDynamic', dyn === undefined ? true : dyn === '1');
    return true;
  }

  _el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  _slider(label, min, max, step, value, onInput, fmt) {
    const row = this._el('div', 'set-row');
    row.appendChild(this._el('label', null, label));
    const input = document.createElement('input');
    input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = value;
    const val = this._el('span', 'val', fmt(value));
    input.addEventListener('input', () => { const v = parseFloat(input.value); val.textContent = fmt(v); onInput(v); });
    row.appendChild(input); row.appendChild(val);
    return row;
  }

  _select(label, options, value, onChange) {
    const row = this._el('div', 'set-row');
    row.appendChild(this._el('label', null, label));
    const sel = document.createElement('select');
    for (const [v, t] of options) { const o = document.createElement('option'); o.value = v; o.textContent = t; if (v === value) o.selected = true; sel.appendChild(o); }
    sel.addEventListener('change', () => onChange(sel.value));
    row.appendChild(sel);
    return row;
  }

  _toggle(label, value, onChange) {
    const row = this._el('div', 'set-row');
    row.appendChild(this._el('label', null, label));
    const b = document.createElement('button'); b.className = 'toggle';
    const render = () => { b.textContent = value ? 'ENABLED' : 'DISABLED'; };
    render();
    b.addEventListener('click', () => { value = !value; render(); this.audio && this.audio.ui(); onChange(value); });
    row.appendChild(b);
    return row;
  }

  _buy(id) {
    this.audio && this.audio.ui();
    this.onBuy(id);
    this._refreshBuyHighlights();
  }

  _refreshBuyHighlights() {
    const lo = this.getLoadout() || {};
    const credits = this.getCredits ? this.getCredits() : null;
    const cr = document.getElementById('buy-credits');
    if (cr) cr.textContent = credits == null ? '' : `¤ ${credits}`;
    const heavyCol = this.buymenu.querySelector('.buy-col-heavy');
    if (heavyCol) heavyCol.style.display = this.heavyUnlocked ? '' : 'none';
    if (this.buyAmmoBtn) this.buyAmmoBtn.style.display = credits == null ? 'none' : '';
    if (this.buyArmorBtn) this.buyArmorBtn.style.display = credits == null ? 'none' : '';
    for (const cell of this.buymenu.querySelectorAll('.buy-cell')) {
      const id = cell.dataset.id;
      cell.classList.toggle('equipped', id === lo.primaryId || id === lo.sidearmId);
      cell.classList.toggle('unaffordable', credits != null && (WEAPONS[id]?.price || 0) > credits);
    }
  }

  _show(modal) {
    this.hideAll();
    modal.classList.add('show');
    this.current = modal;
  }

  _play() {
    const name = (this.ignInput.value || '').trim().slice(0, 16) || 'Agent';
    this.settings.set('ign', name);
    if (!this.settings.seenWelcome) this.settings.set('seenWelcome', true);
    this.onPlay();
  }

  _selectMode(key) {
    if (key === 'skirmish' || key === 'zombie' || key === 'aim' || key === 'tdm') this.settings.set('botMode', key);
    else this.settings.set('botMode', this._practiceMode || 'static');
    this._refreshModeButtons();
  }

  _refreshModeButtons() {
    if (!this.modeRow) return;
    const bm = this.settings.botMode;
    const cur = bm === 'skirmish' || bm === 'zombie' || bm === 'aim' || bm === 'tdm' ? bm : 'practice';
    for (const b of this.modeRow.children) b.classList.toggle('sel', b.dataset.mode === cur);
  }

  showStart() { this._refreshModeButtons(); this._show(this.start); }

  showPause() {
    this._show(this.pause);
    // let Esc resume — armed after a beat so the Esc that opened the menu doesn't
    // instantly close it (and to clear the pointer-lock cooldown).
    this._pauseEscReady = false;
    window.addEventListener('keydown', this._pauseKeyHandler);
    setTimeout(() => { this._pauseEscReady = true; }, 350);
  }

  _pauseKeyHandler(e) {
    if (e.code !== 'Escape' || e.repeat || !this._pauseEscReady || this.current !== this.pause) return;
    this.onResume();
    // The browser blocks re-locking for ~1.25s after an Esc-unlock, so the first
    // request can be rejected. Retry once the cooldown clears if still paused.
    clearTimeout(this._resumeRetry);
    this._resumeRetry = setTimeout(() => {
      if (this.current === this.pause && !document.pointerLockElement) this.onResume();
    }, 1400);
  }

  showResult({ win, playerScore, enemyScore, title, detail, canContinue }) {
    this.resultTitle.textContent = title || (win ? 'VICTORY' : 'DEFEAT');
    this.resultTitle.classList.toggle('lose', !win);
    this.resultScore.textContent = detail != null ? detail : `${playerScore} — ${enemyScore}`;
    this.resultContinue.style.display = canContinue ? '' : 'none';
    this._show(this.result);
  }
  openSettings() { this._buildSettings(); this._show(this.settingsModal); }
  openCrosshair() { this._buildCrosshair(); this._show(this.crosshairModal); }
  showNewContent() { this._show(this.newContent); }
  openControls() { this._show(this.controls); }

  openStats() {
    const s = this.getStats();
    const ses = s.session || {}, life = s.lifetime || {};
    const kd = (k, d) => (d > 0 ? (k / d).toFixed(2) : String(k || 0));
    const rows = [
      ['Kills', ses.kills ?? 0, life.kills ?? 0],
      ['Deaths', ses.deaths ?? 0, life.deaths ?? 0],
      ['K / D', kd(ses.kills, ses.deaths), kd(life.kills, life.deaths)],
      ['Best streak', ses.best ?? 0, life.bestStreak ?? 0],
      ['Accuracy', (ses.accuracy ?? 0) + '%', (life.accuracy ?? 0) + '%'],
      ['Headshot %', (ses.hsPct ?? 0) + '%', (life.hsPct ?? 0) + '%'],
      ['Shots', ses.shots ?? 0, life.shots ?? 0],
      ['Duels won', '—', life.wins ?? 0],
      ['Duels lost', '—', life.losses ?? 0],
    ];
    this.statsPanel.innerHTML =
      '<h2>STATS</h2>' +
      '<div class="stats-grid"><div class="sg-head"></div><div class="sg-head">Session</div><div class="sg-head life">Lifetime</div>' +
      rows.map(([l, a, b]) => `<div class="sg-label">${l}</div><div class="sg-val">${a}</div><div class="sg-val life">${b}</div>`).join('') +
      '</div>';
    this.statsPanel.appendChild(this._btn('RESET LIFETIME', 'secondary', () => { this.onResetLifetime(); this.openStats(); }));
    this.statsPanel.appendChild(this._btn('BACK', 'secondary', () => this.showPause()));
    this._show(this.statsModal);
  }
  openPatchNotes() { this._show(this.patchnotes); }

  openBuyMenu() {
    this._refreshBuyHighlights();
    this._show(this.buymenu);
    window.addEventListener('keydown', this._buyKeyHandler);
  }

  _closeBuy() {
    // Request re-lock; the LOCK_CHANGE handler hides the menu + resumes. We do
    // NOT remove the key handler here so B/Esc keep working if the browser
    // rejects the re-lock (pointer-lock cooldown); hideAll() removes it on lock.
    this.onResume();
  }

  _buyKeyHandler(e) {
    if (e.repeat) return; // ignore the held-B auto-repeat that opened the menu
    if (e.code === 'KeyB' || e.code === 'Escape') this._closeBuy();
  }

  hideAll() {
    window.removeEventListener('keydown', this._buyKeyHandler);
    window.removeEventListener('keydown', this._pauseKeyHandler);
    this._pauseEscReady = false;
    clearTimeout(this._resumeRetry);
    for (const m of [this.start, this.pause, this.settingsModal, this.crosshairModal, this.controls, this.buymenu, this.patchnotes, this.result, this.newContent, this.statsModal]) {
      m.classList.remove('show');
    }
    this.current = null;
  }
}

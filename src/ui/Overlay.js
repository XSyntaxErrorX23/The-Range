import { CATEGORIES, WEAPONS, modelKeyFor } from '../weapons/weapons.config.js';
import { VERSION, PATCH_NOTES } from '../version.js';

const BUY_ICON = {
  pistol: '<svg viewBox="0 0 64 32"><path d="M4 10h40v8H30l-2 8h-8l1-8H4z"/></svg>',
  smg: '<svg viewBox="0 0 64 32"><path d="M2 10h48v6H40l-1 10h-7l-1-10H22v6h-8v-6H2z"/></svg>',
  shotgun: '<svg viewBox="0 0 64 32"><path d="M2 12h54v6H22v8h-7v-8H2z M40 13h18v3H40z"/></svg>',
  rifle: '<svg viewBox="0 0 64 32"><path d="M2 12h58v5H44l-1 9h-6l-1-9H20v5h-6v-5H2z"/></svg>',
  sniper: '<svg viewBox="0 0 64 32"><path d="M2 13h60v4H46l-1 9h-5l-1-9H18v4h-5v-4H2z M24 7h14v3H24z"/></svg>',
  mg: '<svg viewBox="0 0 64 32"><path d="M2 11h58v8H24v7h-9v-7H2z M6 19h12v6H6z"/></svg>',
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
    this.getStats = () => ({ session: {}, lifetime: {} });
    this.onResetLifetime = () => {};

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

    // mode selector (Practice Range vs Skirmish 1v1)
    this._practiceMode = this.settings.botMode !== 'skirmish' ? this.settings.botMode : 'static';
    this.modeRow = this._el('div', 'mode-row');
    const mkMode = (key, title, desc) => {
      const b = document.createElement('button');
      b.className = 'mode-btn';
      b.dataset.mode = key;
      b.innerHTML = `<span class="mode-title">${title}</span><span class="mode-desc">${desc}</span>`;
      b.addEventListener('click', () => { this.audio && this.audio.ui(); this._selectMode(key); });
      return b;
    };
    this.modeRow.appendChild(mkMode('practice', 'PRACTICE RANGE', 'Drills & dummies'));
    this.modeRow.appendChild(mkMode('skirmish', 'SKIRMISH 1V1', 'Duel a bot · first to 5'));
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
    rp.appendChild(this._btn('REMATCH', 'big', () => this.onRematch()));
    rp.appendChild(document.createElement('br'));
    rp.appendChild(this._btn('EXIT TO RANGE', 'secondary', () => this.onExitSkirmish()));
    this.result.appendChild(rp);

    // ---- buy menu (Armory) ----
    this.buymenu = this._modal('m-buy');
    const bp = document.createElement('div'); bp.className = 'panel buymenu';
    bp.innerHTML = '<h2>ARMORY</h2>';
    const cols = this._el('div', 'buy-cols');
    for (const cat of CATEGORIES) {
      const col = this._el('div', 'buy-col');
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
    p.appendChild(this._slider('Crosshair Gap', 1, 16, 1, s.crosshairGap, (v) => { s.set('crosshairGap', v); }, (v) => String(v)));

    p.appendChild(this._select('View', [['first', 'First person'], ['third', 'Third person']], s.view, (v) => s.set('view', v)));
    p.appendChild(this._select('Bot Mode', [['static', 'Static'], ['strafe', 'Strafing'], ['popup', 'Pop-up drill'], ['skirmish', 'Skirmish (1v1)']], s.botMode, (v) => s.set('botMode', v)));
    p.appendChild(this._select('AI Difficulty', [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']], s.aiDifficulty, (v) => s.set('aiDifficulty', v)));
    p.appendChild(this._toggle('Bot Armor', s.botArmor, (v) => s.set('botArmor', v)));
    p.appendChild(this._toggle('Infinite Ammo', s.infiniteAmmo, (v) => s.set('infiniteAmmo', v)));

    const color = document.createElement('div'); color.className = 'set-row';
    color.innerHTML = '<label>Crosshair Color</label>';
    const ci = document.createElement('input'); ci.type = 'color'; ci.value = s.crosshairColor;
    ci.addEventListener('input', () => s.set('crosshairColor', ci.value));
    color.appendChild(ci);
    p.appendChild(color);

    const ignRow = this._el('div', 'set-row');
    ignRow.appendChild(this._el('label', null, 'IGN (Name)'));
    const ti = document.createElement('input');
    ti.type = 'text'; ti.maxLength = 16; ti.value = s.ign; ti.spellcheck = false; ti.className = 'ign-field';
    ti.addEventListener('change', () => s.set('ign', (ti.value || '').trim().slice(0, 16) || 'Agent'));
    ignRow.appendChild(ti);
    p.appendChild(ignRow);

    p.appendChild(this._btn('BACK', 'secondary', () => this.showPause()));
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
    for (const cell of this.buymenu.querySelectorAll('.buy-cell')) {
      const id = cell.dataset.id;
      cell.classList.toggle('equipped', id === lo.primaryId || id === lo.sidearmId);
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
    if (key === 'skirmish') this.settings.set('botMode', 'skirmish');
    else this.settings.set('botMode', this._practiceMode || 'static');
    this._refreshModeButtons();
  }

  _refreshModeButtons() {
    if (!this.modeRow) return;
    const isSkirm = this.settings.botMode === 'skirmish';
    for (const b of this.modeRow.children) {
      b.classList.toggle('sel', (b.dataset.mode === 'skirmish') === isSkirm);
    }
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

  showResult({ win, playerScore, enemyScore }) {
    this.resultTitle.textContent = win ? 'VICTORY' : 'DEFEAT';
    this.resultTitle.classList.toggle('lose', !win);
    this.resultScore.textContent = `${playerScore} — ${enemyScore}`;
    this._show(this.result);
  }
  openSettings() { this._buildSettings(); this._show(this.settingsModal); }
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
    for (const m of [this.start, this.pause, this.settingsModal, this.controls, this.buymenu, this.patchnotes, this.result, this.statsModal]) {
      m.classList.remove('show');
    }
    this.current = null;
  }
}

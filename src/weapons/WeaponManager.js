import { WEAPONS, PRIMARY_CATEGORIES, DEFAULT_PRIMARY, DEFAULT_SIDEARM } from './weapons.config.js';
import { bus, EV } from '../core/events.js';

/**
 * Inventory + ammo + weapon state. Slots:
 *   1 = Primary (any SMG/Shotgun/Rifle/Sniper/MG, chosen in the buy menu)
 *   2 = Sidearm (any pistol/Shorty, chosen in the buy menu)
 *   3 = Knife
 * Blade Storm (Jett ult) temporarily equips throwing knives, then reverts.
 */
export class WeaponManager {
  constructor(input, engine, viewModel, settings) {
    this.input = input;
    this.engine = engine;
    this.viewModel = viewModel;
    this.settings = settings;

    this.primaryId = DEFAULT_PRIMARY;
    this.sidearmId = DEFAULT_SIDEARM;
    this.currentId = DEFAULT_PRIMARY;
    this._prevId = DEFAULT_PRIMARY; // for Blade Storm revert

    this.ammoState = {};
    for (const id of Object.keys(WEAPONS)) {
      const w = WEAPONS[id];
      this.ammoState[id] = { mag: w.magSize, reserve: w.reserveAmmo };
    }

    this.equipping = 0;
    this.reloading = false;
    this.reloadTimer = 0;
    this.isADS = false;

    this.equip(this.currentId, true);
  }

  get weapon() { return WEAPONS[this.currentId]; }
  get ammo() { return this.ammoState[this.currentId]; }
  get reservedInfinite() { return this.ammo.reserve < 0; }
  get infiniteAmmoActive() { return this.settings.infiniteAmmo && this.currentId !== 'blades'; }

  isBusy() { return this.equipping > 0 || this.reloading; }

  adsSpeedMult() {
    if (!this.isADS) return 1;
    return this.weapon.scoped ? 0.5 : 0.75;
  }

  equip(id, instant = false) {
    if (!WEAPONS[id]) return;
    this.currentId = id;
    this.reloading = false;
    this.reloadTimer = 0;
    this.isADS = false;
    this.engine.setFovMult(1);
    this.equipping = instant ? 0 : WEAPONS[id].swapTime;
    this.viewModel.setWeapon(id);
    this.viewModel.setADS(false);
    this.viewModel.setScopedHidden(false);
    this._emitSwitched();
    this._emitAmmo();
  }

  selectSlot(slot) {
    if (slot === 1) this.equip(this.primaryId);
    else if (slot === 2) this.equip(this.sidearmId);
    else if (slot === 3) this.equip('knife');
  }

  /** Buy-menu selection: routes a weapon to its slot and equips it. */
  setLoadout(id) {
    const w = WEAPONS[id];
    if (!w) return;
    if (w.category === 'sidearm') { this.sidearmId = id; this.equip(id); }
    else if (PRIMARY_CATEGORIES.includes(w.category)) { this.primaryId = id; this.equip(id); }
    else if (w.category === 'melee') this.equip('knife');
  }

  cycle(dir) {
    const order = [this.primaryId, this.sidearmId, 'knife'];
    let i = order.indexOf(this.currentId);
    if (i < 0) i = 0;
    i = (i + (dir > 0 ? 1 : -1) + order.length) % order.length;
    this.equip(order[i]);
  }

  // ---- Blade Storm ----
  equipBlades() {
    if (this.currentId !== 'blades') this._prevId = this.currentId;
    this.ammoState.blades = { mag: WEAPONS.blades.magSize, reserve: 0 };
    this.equip('blades');
  }

  revertFromBlades() {
    const id = this._prevId && this._prevId !== 'blades' ? this._prevId : this.primaryId;
    this.equip(id);
  }

  startReload() {
    const w = this.weapon;
    if (this.reloading || w.type === 'melee' || w.id === 'blades') return;
    if (this.infiniteAmmoActive) return;
    if (this.ammo.mag >= w.magSize) return;
    if (!this.reservedInfinite && this.ammo.reserve <= 0) return;
    this.reloading = true;
    this.reloadTimer = w.reloadTime;
    this.viewModel.triggerReload(w.reloadTime);
    bus.emit(EV.WEAPON_RELOAD, { reloading: true, progress: 0 });
  }

  _finishReload() {
    const w = this.weapon;
    const need = w.magSize - this.ammo.mag;
    if (this.reservedInfinite) {
      this.ammo.mag = w.magSize;
    } else {
      const take = Math.min(need, this.ammo.reserve);
      this.ammo.mag += take;
      this.ammo.reserve -= take;
    }
    this.reloading = false;
    this.reloadTimer = 0;
    bus.emit(EV.WEAPON_RELOAD, { reloading: false, progress: 1 });
    this._emitAmmo();
  }

  consumeRound() {
    const w = this.weapon;
    if (w.type === 'melee') return true;
    if (this.infiniteAmmoActive) return true;
    if (this.ammo.mag <= 0) return false;
    this.ammo.mag -= 1;
    this._emitAmmo();
    return true;
  }

  update(dt) {
    if (this.equipping > 0) this.equipping = Math.max(0, this.equipping - dt);
    if (this.reloading) {
      this.reloadTimer -= dt;
      bus.emit(EV.WEAPON_RELOAD, {
        reloading: true,
        progress: 1 - Math.max(0, this.reloadTimer) / this.weapon.reloadTime,
      });
      if (this.reloadTimer <= 0) this._finishReload();
    }

    if (this.input.pressed('SLOT_1')) this.selectSlot(1);
    else if (this.input.pressed('SLOT_2')) this.selectSlot(2);
    else if (this.input.pressed('SLOT_3')) this.selectSlot(3);

    const wheel = this.input.consumeWheel();
    if (wheel !== 0) this.cycle(wheel);

    if (this.input.pressed('RELOAD')) this.startReload();

    const w = this.weapon;
    const wantADS = this.input.adsDown() && w.canADS && !this.isBusy();
    if (wantADS !== this.isADS) {
      this.isADS = wantADS;
      this.engine.setFovMult(this.isADS ? w.adsFovMult : 1);
      this.viewModel.setADS(this.isADS);
      this.viewModel.setScopedHidden(this.isADS && !!w.scoped);
      bus.emit(EV.ADS_CHANGED, { isADS: this.isADS, weaponId: this.currentId, scoped: !!w.scoped });
    }
  }

  _emitSwitched() {
    const w = this.weapon;
    bus.emit(EV.WEAPON_SWITCHED, {
      id: w.id, name: w.name, slot: this._slotOf(w), weapon: w,
      primaryName: WEAPONS[this.primaryId].name,
      sidearmName: WEAPONS[this.sidearmId].name,
    });
  }

  _slotOf(w) {
    if (w.category === 'sidearm') return 2;
    if (w.category === 'melee') return 3;
    if (w.category === 'special') return 0; // Blade Storm — no slot highlight
    return 1;
  }

  _emitAmmo() {
    const w = this.weapon;
    bus.emit(EV.WEAPON_AMMO, {
      mag: w.type === 'melee' ? null : this.ammo.mag,
      reserve: this.reservedInfinite ? Infinity : this.ammo.reserve,
      magSize: w.magSize,
      infinite: this.infiniteAmmoActive || w.type === 'melee',
      reloading: this.reloading,
    });
  }
}

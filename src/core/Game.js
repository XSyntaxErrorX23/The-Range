import { Engine } from './Engine.js';
import { Loop } from './Loop.js';
import { ScoreManager } from './ScoreManager.js';
import { bus, EV } from './events.js';
import { Input } from '../input/Input.js';
import { Player } from '../player/Player.js';
import { PlayerController } from '../player/PlayerController.js';
import { CameraRig } from '../player/CameraRig.js';
import { Abilities } from '../player/Abilities.js';
import { resolveCollision } from '../player/collision.js';
import { Range } from '../world/Range.js';
import { ViewModel } from '../weapons/ViewModel.js';
import { WeaponManager } from '../weapons/WeaponManager.js';
import { FiringController } from '../weapons/FiringController.js';
import { BotManager } from '../enemies/BotManager.js';
import { AudioManager } from '../fx/AudioManager.js';
import { FXManager } from '../fx/FXManager.js';
import { Settings } from '../ui/Settings.js';
import { HUD } from '../ui/HUD.js';
import { Overlay } from '../ui/Overlay.js';

/**
 * Top-level orchestrator: constructs every system, wires the fixed-step loop,
 * and owns the pointer-lock / pause lifecycle.
 */
export class Game {
  constructor() {
    const canvas = document.getElementById('app');
    this.settings = new Settings();
    this.engine = new Engine(canvas);
    this.engine.setBaseFov(this.settings.fov);
    this.engine.setFovMult(1);

    this.audio = new AudioManager(this.settings);
    this.input = new Input(canvas);

    this.player = new Player(this.engine.scene);
    this.cameraRig = new CameraRig(this.engine.camera, this.input, this.player, this.settings);
    this.cameraRig.yaw = Math.PI; // face +Z (downrange)

    this.world = new Range(this.engine.scene);
    this.cameraRig.setWorld(this.world);

    this.viewModel = new ViewModel(this.engine.camera);
    this.weapons = new WeaponManager(this.input, this.engine, this.viewModel, this.settings);
    this.bots = new BotManager(this.engine.scene, this.world, this.settings);
    this.firing = new FiringController({
      input: this.input,
      cameraRig: this.cameraRig,
      weapons: this.weapons,
      bots: this.bots,
      world: this.world,
      viewModel: this.viewModel,
    });
    this.playerCtl = new PlayerController(this.player, this.input, this.cameraRig, this.weapons);

    // UI / FX (HUD builds #damage-layer that FXManager uses — build HUD first)
    this.hud = new HUD(document.getElementById('hud'), this.settings);
    this.fx = new FXManager(this.engine.scene, this.engine.camera);
    this.score = new ScoreManager(this.world.scoreboard);
    this.overlay = new Overlay(document.getElementById('overlay'), this.settings, this.audio);

    // Jett abilities (created after HUD so its initial charge emit reaches the HUD)
    this.abilities = new Abilities({
      input: this.input,
      player: this.player,
      cameraRig: this.cameraRig,
      scene: this.engine.scene,
      weapons: this.weapons,
      world: this.world,
      audio: this.audio,
    });

    this._applyInitialSettings();
    this._wireOverlay();
    this._wireLock();
    this._wireSettings();

    this.loop = new Loop({ step: (dt) => this._step(dt), render: () => this.engine.render() });
  }

  _applyInitialSettings() {
    if (this.settings.view === 'third' && this.cameraRig.mode === 'first') this.cameraRig.toggle();
    this.viewModel.setVisible(this.cameraRig.mode === 'first');
    this.audio.setVolume(this.settings.volume);
    this.bots.setMode(this.settings.botMode);
    this.hud.setRangePanel(this.settings.snapshot());
    this.hud.setViewMode(this.cameraRig.mode);
    // push initial weapon/ammo to the HUD (WeaponManager equipped before HUD existed)
    this.weapons._emitSwitched();
    this.weapons._emitAmmo();
  }

  _wireOverlay() {
    this.overlay.onPlay = () => { this.audio.resume(); this.input.requestLock(); };
    this.overlay.onResume = () => { this.input.requestLock(); };
    this.overlay.onBuy = (id) => this.weapons.setLoadout(id);
    this.overlay.getLoadout = () => ({ primaryId: this.weapons.primaryId, sidearmId: this.weapons.sidearmId });
    this.overlay.onReset = () => this.score.reset();
  }

  _wireLock() {
    // hide the first-person viewmodel in third-person
    bus.on(EV.CAMERA_MODE, (mode) => this.viewModel.setVisible(mode === 'first'));

    bus.on(EV.LOCK_CHANGE, ({ locked }) => {
      if (locked) {
        this.loop.resume();
        this.overlay.hideAll();
        this.hud.show();
      } else {
        this.loop.pause();
        if (!this.overlay.anyOpen()) this.overlay.showPause();
      }
    });
  }

  _wireSettings() {
    this.settings.onChange((key, value) => {
      switch (key) {
        case 'fov':
          this.engine.setBaseFov(value);
          this.engine.setFovMult(this.weapons.isADS ? this.weapons.weapon.adsFovMult : 1);
          break;
        case 'view':
          if (value !== this.cameraRig.mode) this.cameraRig.toggle();
          this.hud.setViewMode(this.cameraRig.mode);
          break;
        case 'volume':
          this.audio.setVolume(value);
          break;
        case 'botMode':
          this.bots.setMode(value);
          break;
        case 'infiniteAmmo':
          this.weapons._emitAmmo();
          break;
        default:
          break;
      }
    });
  }

  start() {
    this.hud.hide();
    this.overlay.showStart();
    this.loop.start(); // runs RAF; simulation stays paused until first lock
  }

  _step(dt) {
    this.input.beginFrame();

    // one-shot edges while playing
    if (this.input.pressed('TOGGLE_VIEW')) {
      this.cameraRig.toggle();
      this.settings.view = this.cameraRig.mode;
      this.settings._save();
      this.hud.setViewMode(this.cameraRig.mode);
    }
    if (this.input.pressed('WEAPON_PICKER')) {
      // buy menu needs the cursor -> unlock (the lock handler won't pause-menu
      // because a menu is open); CLOSE / B / Esc re-locks
      this.overlay.openBuyMenu();
      this.input.exitLock();
    }
    if (this.input.pressed('RANGE_SETTINGS')) {
      this.overlay.openSettings();
      this.input.exitLock();
    }

    // look first so movement basis + aim ray use this frame's orientation
    this.cameraRig.consumeLook(dt);

    this.playerCtl.update(dt); // computes velocity (does not integrate)
    this.abilities.update(dt); // may add dash/updraft velocity
    this.player._prevY = this.player.position.y; // for fast-fall landing detection
    this.player.position.addScaledVector(this.player.velocity, dt); // integrate
    resolveCollision(this.player, this.world);
    this.weapons.update(dt);
    this.firing.update(dt);
    this.bots.update(dt);
    // animate gun (pose/ADS/recoil kick/reload/swing + bob & look sway)
    this.viewModel.update(dt, {
      speed: Math.hypot(this.player.velocity.x, this.player.velocity.z),
      lookDX: this.input.mouseDX,
      lookDY: this.input.mouseDY,
    });
    this.cameraRig.updateTransform(dt); // position camera after the player has moved

    this.hud.update(dt);
    this.fx.update(dt);

    this.input.endFrame();
  }
}

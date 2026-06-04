import * as THREE from 'three';
import { Engine } from './Engine.js';
import { Loop } from './Loop.js';
import { ScoreManager } from './ScoreManager.js';
import { bus, EV } from './events.js';
import { Input } from '../input/Input.js';
import { TouchControls } from '../input/TouchControls.js';
import { Player } from '../player/Player.js';
import { PlayerController } from '../player/PlayerController.js';
import { CameraRig } from '../player/CameraRig.js';
import { Abilities } from '../player/Abilities.js';
import { resolveCollision } from '../player/collision.js';
import { Range } from '../world/Range.js';
import { Graveyard } from '../world/Graveyard.js';
import { AimArena } from '../world/AimArena.js';
import { setupLights } from '../world/lights.js';
import { ViewModel } from '../weapons/ViewModel.js';
import { WeaponManager } from '../weapons/WeaponManager.js';
import { FiringController } from '../weapons/FiringController.js';
import { BotManager } from '../enemies/BotManager.js';
import { Skirmish } from '../modes/Skirmish.js';
import { ZombieSurvival } from '../modes/ZombieSurvival.js';
import { AimTrainer } from '../modes/AimTrainer.js';
import { AudioManager } from '../fx/AudioManager.js';
import { FXManager } from '../fx/FXManager.js';
import { Settings } from '../ui/Settings.js';
import { HUD } from '../ui/HUD.js';
import { Overlay } from '../ui/Overlay.js';
import { Minimap } from '../ui/Minimap.js';
import { CommsWheel } from '../ui/CommsWheel.js';

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

    this.lights = setupLights(this.engine.scene); // Game owns lighting; worlds re-tint via enter()
    this.range = new Range(this.engine.scene);
    this.graveyard = null; // built lazily on first zombie mode
    this.world = this.range;
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
      player: this.player,
    });
    this.playerCtl = new PlayerController(this.player, this.input, this.cameraRig, this.weapons);

    // 1v1 skirmish coordinator (dormant until bot mode === 'skirmish')
    this.skirmish = new Skirmish({
      scene: this.engine.scene,
      world: this.world,
      player: this.player,
      cameraRig: this.cameraRig,
      bots: this.bots,
      settings: this.settings,
      weapons: this.weapons,
    });

    // Zombie survival coordinator (dormant until bot mode === 'zombie')
    this.zombie = new ZombieSurvival({
      scene: this.engine.scene,
      player: this.player,
      cameraRig: this.cameraRig,
      bots: this.bots,
      settings: this.settings,
      weapons: this.weapons,
      firing: this.firing,
    });

    // Aim trainer (gridshot) coordinator (dormant until bot mode === 'aim')
    this.aim = new AimTrainer({
      scene: this.engine.scene,
      player: this.player,
      cameraRig: this.cameraRig,
      settings: this.settings,
      weapons: this.weapons,
    });

    // UI / FX (HUD builds #damage-layer that FXManager uses — build HUD first)
    this.hud = new HUD(document.getElementById('hud'), this.settings);
    this.fx = new FXManager(this.engine.scene, this.engine.camera);
    this.score = new ScoreManager(this.world.scoreboard);
    this.overlay = new Overlay(document.getElementById('overlay'), this.settings, this.audio);
    this.minimap = new Minimap(document.getElementById('hud'), {
      player: this.player, cameraRig: this.cameraRig, world: this.world, bots: this.bots,
    });
    this.radio = new CommsWheel(document.body);

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

    // Mobile: on-screen touch controls (only when there's no mouse/pointer-lock)
    this.touch = null;
    if (this.input.touch) {
      document.body.classList.add('touch-mode');
      this.touch = new TouchControls(this.input);
      const startHint = document.querySelector('#m-start .hint');
      if (startHint) startHint.textContent = 'Tap to play · use the on-screen controls.';
    }

    this._applyInitialSettings();
    this._wireOverlay();
    this._wireLock();
    this._wireSettings();

    // shoot a distance button -> slide the accuracy target to that range
    bus.on(EV.RANGE_DISTANCE, ({ distance }) => { if (this.world.setTargetDistance) this.world.setTargetDistance(distance); });

    this._stepT = 0; // footstep cadence timer

    // Cinematic menu camera: a slow flythrough of the map behind the menus.
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    this._cineWaypoints = [
      { pos: V(0, 6.2, -9), look: V(0, 1.2, 26) },    // overview down the lanes
      { pos: V(-13, 2.8, 14), look: V(6, 1.0, 27) },  // sweep across the crates
      { pos: V(8, 2.0, 6), look: V(17, 1.7, 26) },    // the accuracy lane
      { pos: V(18, 5.0, 0), look: V(2, 1.5, 30) },    // high over the right side
      { pos: V(-21, 4.5, 8), look: V(-15, 1.2, 20) }, // the parkour course
      { pos: V(6, 4.5, 42), look: V(0, 4.6, 30) },    // up at the scoreboard
    ];
    this._cineWaypointsGrave = [
      { pos: V(0, 8, -27), look: V(0, 1.5, 4) },     // wide overview from the south
      { pos: V(-16, 4, -13), look: V(-22, 2.5, -20) }, // the crypt
      { pos: V(13, 3, 11), look: V(20, 1.5, -16) },   // construction + far yard
      { pos: V(-11, 6, 18), look: V(2, 1, -4) },       // over the graves
      { pos: V(22, 5, -4), look: V(-12, 1.5, 8) },     // sweep across
    ];
    this._cineWaypointsAim = [
      { pos: V(0, 2.6, -2.5), look: V(0, 2.0, 14) },   // behind the firing line, downrange
      { pos: V(-6.5, 3.4, 3), look: V(4, 1.8, 15) },   // sweep from the left
      { pos: V(6.5, 1.7, 7), look: V(-3, 2.4, 15) },   // low from the right
      { pos: V(0, 4.2, 9), look: V(0, 1.6, 16) },      // high, close on the target wall
    ];
    this._cineT = 0;
    this._cineActive = true; // start-screen flythrough until first lock
    this._hasPlayed = false; // once true, pausing stays static (no flythrough)
    this._cinePos = new THREE.Vector3();
    this._cineLook = new THREE.Vector3();

    this.loop = new Loop({
      step: (dt) => this._step(dt),
      render: (alpha, dt) => { if (this._cineActive) this._cineUpdate(dt); this.engine.render(); },
    });
  }

  /** Glide the camera between waypoints (eased), looping — runs while menus are up. */
  _cineUpdate(dt) {
    const wps = (this.world === this.graveyard && this.graveyard) ? this._cineWaypointsGrave
      : (this.world === this.aimArena && this.aimArena) ? this._cineWaypointsAim
        : this._cineWaypoints;
    const SEG = 5.5; // seconds per leg
    this._cineT += dt;
    const total = this._cineT / SEG;
    const idx = Math.floor(total) % wps.length;
    const next = (idx + 1) % wps.length;
    let f = total - Math.floor(total);
    f = f * f * (3 - 2 * f); // smoothstep ease
    this._cinePos.lerpVectors(wps[idx].pos, wps[next].pos, f);
    this._cineLook.lerpVectors(wps[idx].look, wps[next].look, f);
    this.engine.camera.position.copy(this._cinePos);
    this.engine.camera.lookAt(this._cineLook);
  }

  _applyInitialSettings() {
    if (this.settings.view === 'third' && this.cameraRig.mode === 'first') this.cameraRig.toggle();
    this.viewModel.setVisible(this.cameraRig.mode === 'first');
    this.audio.setVolume(this.settings.volume);
    this._setMode(this.settings.botMode);
    this.hud.setRangePanel(this.settings.snapshot());
    this.hud.setViewMode(this.cameraRig.mode);
    // push initial weapon/ammo to the HUD (WeaponManager equipped before HUD existed)
    this.weapons._emitSwitched();
    this.weapons._emitAmmo();
  }

  _wireOverlay() {
    this.overlay.onPlay = () => { this.audio.resume(); this.input.requestLock(); };
    this.overlay.onResume = () => { this.input.requestLock(); };
    this.overlay.onBuy = (id) => {
      if (this.settings.botMode === 'zombie') this.zombie.tryBuy(id);
      else this.weapons.setLoadout(id);
    };
    this.overlay.getCredits = () => (this.settings.botMode === 'zombie' && this.zombie.active ? this.zombie.credits : null);
    this.overlay.onBuyAmmo = () => this.zombie.buyAmmo();
    this.overlay.onBuyArmor = () => this.zombie.buyArmor();
    this.overlay.getLoadout = () => ({ primaryId: this.weapons.primaryId, sidearmId: this.weapons.sidearmId });
    this.overlay.onReset = () => this.score.reset();
    this.overlay.getStats = () => this.score.getStats();
    this.overlay.onResetLifetime = () => this.score.resetLifetime();
    this.overlay.onRematch = () => {
      if (this.settings.botMode === 'zombie') this.zombie.activate(this.graveyard);
      else if (this.settings.botMode === 'aim') this.aim.restart();
      else this.skirmish.rematch();
      this.input.requestLock();
    };
    this.overlay.onExitSkirmish = () => { this.settings.set('botMode', 'static'); this.input.requestLock(); };

    // pause -> Main Menu: return to the start screen (with the flythrough) and
    // reset the selected mode to a fresh state, ready to re-enter.
    this.overlay.onMainMenu = () => {
      this._hasPlayed = false;
      this._cineActive = true;
      this._cineGunHidden = false;
      this.hud.hide();
      this.viewModel.setVisible(false);
      this._setMode(this.settings.botMode); // re-arm the current mode fresh
      this.overlay.showStart();
    };

    // match over -> show the result screen (unlock so the cursor returns)
    this.skirmish.onMatchEnd = (win) => {
      this.overlay.showResult({ win, playerScore: this.skirmish.playerScore, enemyScore: this.skirmish.enemyScore });
      this.input.exitLock();
    };
    this.zombie.onMatchEnd = (win) => {
      const detail = win ? `Cleared 5 waves + the Gravekeeper` : `Reached wave ${this.zombie.wave}`;
      this.overlay.showResult({ win, title: win ? 'VICTORY' : 'DEFEAT', detail, canContinue: win && !this.zombie.endless });
      this.input.exitLock();
    };
    this.aim.onMatchEnd = ({ score, acc, best, kps }) => {
      this.overlay.showResult({
        win: acc >= 80, title: 'TIME!',
        detail: `Score ${score} · ${acc}% acc · best streak ${best} · ${kps}/s`,
      });
      this.input.exitLock();
    };
    this.overlay.onContinue = () => { this.zombie.startEndless(); this.input.requestLock(); };
  }

  /** Switch mode: swap the active world + coordinator (range layouts / graveyard). */
  _setMode(mode) {
    this.bots.setMode(mode);
    if (mode === 'zombie') {
      this._ensureGraveyard();
      this._useWorld(this.graveyard);
      this.skirmish.deactivate();
      this.zombie.activate(this.graveyard);
    } else if (mode === 'skirmish') {
      this._useWorld(this.range);
      this.range.setLayout('arena');
      this.zombie.deactivate();
      this.aim.deactivate();
      this.skirmish.activate();
    } else if (mode === 'aim') {
      this._ensureAimArena();
      this._useWorld(this.aimArena);
      this.zombie.deactivate();
      this.skirmish.deactivate();
      this.aim.setArena(this.aimArena);
      this.aim.activate();
    } else {
      this._useWorld(this.range);
      this.range.setLayout('practice');
      this.zombie.deactivate();
      this.skirmish.deactivate();
      this.aim.deactivate();
    }
  }

  _ensureGraveyard() {
    if (!this.graveyard) this.graveyard = new Graveyard(this.engine.scene);
  }

  _ensureAimArena() {
    if (!this.aimArena) this.aimArena = new AimArena(this.engine.scene);
  }

  /** Make `world` the active world: toggle visibility, re-tint atmosphere, and
   *  re-point every system that holds a world reference. Collision reads
   *  `this.world` live each step, so this is all that's needed. */
  _useWorld(world) {
    if (this.world && this.world !== world && this.world.group) this.world.group.visible = false;
    this.world = world;
    if (world.group) world.group.visible = true;
    if (world.enter) world.enter(this.engine.scene, this.lights);
    this.cameraRig.setWorld(world);
    this.firing.world = world;
    this.abilities.world = world;
    this.bots.range = world;
    if (this.minimap && this.minimap.setWorld) this.minimap.setWorld(world);
  }

  _wireLock() {
    // hide the first-person viewmodel in third-person
    bus.on(EV.CAMERA_MODE, (mode) => this.viewModel.setVisible(mode === 'first'));

    bus.on(EV.LOCK_CHANGE, ({ locked }) => {
      if (locked) {
        this._hasPlayed = true;
        this._cineActive = false; // gameplay drives the camera now
        this.viewModel.setVisible(this.cameraRig.mode === 'first');
        this.loop.resume();
        this.overlay.hideAll();
        this.hud.show();
        if (this.touch) this.touch.show();
      } else {
        // flythrough only on the first start screen; pausing stays static
        this._cineActive = !this._hasPlayed;
        this.viewModel.setVisible(!this._cineActive && this.cameraRig.mode === 'first');
        this.loop.pause();
        if (this.touch) this.touch.hide();
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
          this._setMode(value);
          break;
        case 'aiDifficulty':
          this.skirmish.setDifficulty(value);
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
    this.viewModel.setVisible(false); // hidden during the menu flythrough
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
    if (this.input.pressed('INSPECT') && !this.weapons.isBusy()) {
      this.viewModel.triggerInspect();
      this.audio.inspect();
    }

    // skirmish / zombie round logic; either may freeze the player between rounds
    this.skirmish.update(dt);
    this.zombie.update(dt);
    this.aim.update(dt);
    const frozen = this.skirmish.playerFrozen() || this.zombie.playerFrozen() || this.aim.playerFrozen();

    // radio comms wheel: hold ` to open, mouse to aim a slice, release to send.
    // While open the look deltas drive the selector instead of the view.
    if (this.input.pressed('RADIO') && !this.radio.active) this.radio.open();
    if (this.radio.active) {
      this.radio.addAim(this.input.mouseDX, this.input.mouseDY);
      this.input.mouseDX = 0;
      this.input.mouseDY = 0;
      if (!this.input.isDown('RADIO')) { // released (or keys cleared on pause)
        const c = this.radio.commit();
        if (c) { this.audio.ui(); this.hud.showComms(this.settings.ign, c.text); }
      }
    }

    // look first so movement basis + aim ray use this frame's orientation
    this.cameraRig.consumeLook(dt);

    if (frozen) {
      // between rounds / dead: hold still but keep settling to the ground
      this.player.velocity.x = 0;
      this.player.velocity.z = 0;
      this.player.velocity.y -= this.playerCtl.GRAVITY * dt;
    } else {
      this.playerCtl.update(dt); // computes velocity (does not integrate)
      this.abilities.update(dt); // may add dash/updraft velocity
    }
    this.player._prevY = this.player.position.y; // for fast-fall landing detection
    this.player.position.addScaledVector(this.player.velocity, dt); // integrate
    resolveCollision(this.player, this.world);
    this.weapons.update(dt);
    this.bots.update(dt); // rebuild the shootable target list BEFORE firing this frame
    if (!frozen && !this.radio.active) this.firing.update(dt);
    // animate gun (pose/ADS/recoil kick/reload/swing + bob & look sway)
    this.viewModel.update(dt, {
      speed: Math.hypot(this.player.velocity.x, this.player.velocity.z),
      lookDX: this.input.mouseDX,
      lookDY: this.input.mouseDY,
    });
    this.cameraRig.updateTransform(dt); // position camera after the player has moved
    if (this.zombie.cinematicActive) {
      this.zombie.updateCinematicCamera(this.engine.camera, dt); // boss entrance
      if (!this._cineGunHidden) { this.viewModel.setVisible(false); this._cineGunHidden = true; }
    } else if (this._cineGunHidden) {
      this.viewModel.setVisible(this.cameraRig.mode === 'first');
      this._cineGunHidden = false;
    }

    // blind the screen when the camera is inside a smoke cloud
    this.hud.setSmoke(this.abilities.visionObscure(this.engine.camera.position));

    this.world.update(dt); // animated map life (fans, flickering lights)
    // footstep audio while running on the ground
    const psp = Math.hypot(this.player.velocity.x, this.player.velocity.z);
    if (!frozen && this.player.grounded && psp > 1.8) {
      this._stepT -= dt;
      if (this._stepT <= 0) { this.audio.footstep(); this._stepT = Math.max(0.27, 0.52 - psp * 0.03); }
    } else {
      this._stepT = 0;
    }

    this.minimap.update();
    this.hud.update(dt);
    this.fx.update(dt);

    this.input.endFrame();
  }
}

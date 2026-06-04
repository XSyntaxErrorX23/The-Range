# THE RANGE — a browser Valorant-style practice range

A first-person shooter sandbox set in a recreation of Valorant's **Shooting Range**,
built with **three.js** (vanilla) + **Vite**. Move, switch weapons, and shoot a
respawning practice bot. First-person by default; toggle third-person.

## Run

```bash
npm install
npm run dev      # http://localhost:5173  — click to play
```

`npm run build` for a production bundle, `npm run preview` to serve it.
Must be served over localhost (pointer lock + ES modules don't work on `file://`).

## Controls

| Action | Key |
|---|---|
| Move | `W A S D` |
| Jump | `Space` |
| Walk (slow) | `Left Shift` (hold) |
| Crouch | `Left Ctrl` |
| Fire | `LMB` |
| Aim (ADS) | `RMB` (hold) — sniper scopes |
| Reload | `R` |
| Slot 1 / 2 / 3 | Primary / Pistol / Knife |
| Armory (buy menu) | `B` — equip any weapon |
| Cycle weapons | Mouse wheel |
| Cloudburst (smoke) | `C` |
| Updraft | `Q` |
| Tailwind (dash) | `E` |
| Blade Storm | `X` |
| Toggle view | `V` (first ⇄ third person) |
| Range settings | `F2` |
| Pause | `Esc` |

## Abilities (Jett)

Cloudburst `C` (vision-blocking smoke), Updraft `Q` (vertical boost), Tailwind `E`
(dash), Blade Storm `X` (throwing knives). Charges auto-recharge in the range and
are shown on the ability HUD. See `src/player/Abilities.js`.

## Weapons

The full Valorant-style roster (`src/weapons/weapons.config.js`), bought from the
**Armory** (`B`): Sidearms (Classic, Shorty, Frenzy, Ghost, Sheriff), SMGs
(Stinger, Spectre), Shotguns (Bucky, Judge — multi-pellet), Rifles (Bulldog,
Guardian, Phantom, Vandal), Snipers (Marshal, Outlaw, Operator — scoped) and
Machine Guns (Ares, Odin), plus the Knife. Headshots, hitmarkers, tracers, damage
numbers and per-class synthesized audio.

## Obstacles & parkour

Crates, the target platform and the staircase are solid and **jumpable** — full 3D
collision (stand on top, step up ledges). A parkour course on the left lets you
practise jump → dash → Updraft.

## Range settings (`F2` / pause → Settings)

Bot mode (static / strafing / pop-up drill), Bot Armor, Infinite Ammo, mouse
sensitivity, FOV, volume, crosshair color/gap, view mode — persisted to
`localStorage`.

## Architecture

Fixed-timestep loop (120 Hz) so feel is frame-rate independent. Decoupled systems
communicate over a small event bus (`src/core/events.js`).

```
src/
  core/    Engine, Loop, Game (orchestrator), events, ScoreManager
  input/   Input (keys/mouse/pointer-lock), bindings
  player/  Player, PlayerController, CameraRig (custom 1st/3rd-person look + recoil), collision
  weapons/ weapons.config, WeaponManager, FiringController (hitscan), ViewModel
  enemies/ Bot, BotManager (static/strafe/popup)
  world/   Range (primitives), lights, scoreboard
  fx/      FXManager (tracers/muzzle/impacts/damage numbers), AudioManager (WebAudio synth)
  ui/      HUD, Overlay, Settings
```

Note: the look/camera uses a **custom pointer-lock + yaw/pitch rig** (not
`PointerLockControls`) so recoil rides cleanly on top of the aim. No external 3D
or audio assets — everything is primitives + synthesized sound.

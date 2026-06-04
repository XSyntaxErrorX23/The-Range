// Game version + patch notes (shown on the welcome screen).
export const VERSION = '0.4.0';

export const PATCH_NOTES = [
  {
    version: '0.4.0',
    date: '2026-06-04',
    title: 'Arena Update',
    notes: [
      'Skirmish 1v1 mode — duel a combat AI on a symmetrical arena, first to 5. Pick the mode on the start screen.',
      'Unique model for every weapon, plus enemies that hold their gun. Classic right-click 3-round burst.',
      'Spray patterns — automatic weapons now follow a fixed, learnable recoil pattern.',
      'Audio pass — punchier per-weapon fire, 3-stage reloads, footsteps and muffled enemy fire.',
      'Minimap radar, radio comms wheel (`), weapon weight affecting move speed, and a Stats screen.',
      'Map life — spinning fans, flickering lamps, pulsing beacons. Mobile touch controls.',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-06-03',
    title: 'Agent Update',
    notes: [
      'Jett abilities — Cloudburst (C), Updraft (Q), Tailwind dash (E), Blade Storm (X), with auto-recharging charges and an ability HUD.',
      'Jumpable obstacles — full 3D collision: stand on crates/platform, step up ledges, climb the staircase.',
      'New parkour course (jump → dash a gap → Updraft to a high ledge).',
      'Full weapon roster (18): sidearms, SMGs, shotguns, rifles, snipers and machine guns, bought from the Armory (B).',
      'Shotguns fire multiple pellets; machine guns added; per-weapon-class audio.',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-06-03',
    title: 'Polish Pass',
    notes: [
      'Procedural textures on every surface (concrete, plaster, wood, metal, crates) + image-based reflections.',
      'Higher-poly practice bots with arms, visor and a proper silhouette.',
      'Higher-poly weapon viewmodels with barrels, scopes and magazines.',
      'Enhanced animation: weapon sway & bob, idle breathing, walk cycle, hit flinch and a tumbling death.',
      'New welcome screen with IGN entry, version badge and these patch notes.',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-06-03',
    title: 'First Range',
    notes: [
      'The Range environment, WASD movement, jump/crouch/walk.',
      'Weapons: Pistol, SMG, Rifle, Sniper, Knife with ADS, reload, recoil and headshots.',
      'Practice bots: static, strafing and pop-up drill modes.',
      'First/third-person views, HUD, hitmarkers, score & range settings.',
    ],
  },
];

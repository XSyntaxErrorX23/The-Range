// Data-driven key bindings. Keys use KeyboardEvent.code (layout-independent).
// Remapping = edit this table; nothing else hardcodes key codes.

export const BINDINGS = {
  MOVE_FORWARD: ['KeyW', 'ArrowUp'],
  MOVE_BACK: ['KeyS', 'ArrowDown'],
  MOVE_LEFT: ['KeyA', 'ArrowLeft'],
  MOVE_RIGHT: ['KeyD', 'ArrowRight'],
  JUMP: ['Space'],
  WALK: ['ShiftLeft', 'ShiftRight'], // hold to walk slow (Valorant style)
  CROUCH: ['ControlLeft'], // C is now Cloudburst (Jett)
  RELOAD: ['KeyR'],
  ABILITY_CLOUD: ['KeyC'], // Cloudburst (smoke)
  ABILITY_UPDRAFT: ['KeyQ'], // Updraft (vertical boost)
  ABILITY_DASH: ['KeyE'], // Tailwind (dash)
  ABILITY_ULT: ['KeyX'], // Blade Storm (throwing knives)
  SLOT_1: ['Digit1'], // primary
  SLOT_2: ['Digit2'], // pistol
  SLOT_3: ['Digit3'], // knife
  WEAPON_PICKER: ['KeyB'],
  TOGGLE_VIEW: ['KeyV'], // 1st <-> 3rd person
  RANGE_SETTINGS: ['F2'],
  RADIO: ['Backquote'], // ` — radio comms wheel
  INSPECT: ['KeyY'], // inspect the equipped weapon
};

// Mouse buttons
export const MOUSE = {
  FIRE: 0, // left
  ADS: 2, // right
};

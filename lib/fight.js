// FOG AND FIRE — lib/fight.js: THE DUEL ENGINE (1v1, side-view plane, deterministic).
// Joe 2026-11-12: "fog and fire appears to still be more a beat em up game rather than a fighting game with unique
// new models all in 3d but playing as 2d. I want combos chains and specials."
//
// The sim is a flat 2D plane at 60 Hz with a seeded LCG and no Date/Math.random, so the same seed and the same
// inputs always give the same fight (E.hash()). The 3D suits are RENDER-ONLY: index.html reads this state and
// draws the Blender atlases over it. Nothing here knows a picture exists.
//
//   BUTTONS   L (light) · M (medium) · H (heavy) · S (special)          directions = numpad, relative to facing
//   CHAINS    L → M → H on hit or block (L → L twice) · crouching and standing mix · jL → jM → jH in the air
//   TARGETS   per-suit strings (tc): a button + direction during a named normal → a unique follow-up
//   LAUNCHER  2H launches; up on hit = SUPER JUMP → air chain → jH spikes them down (juggle cap JUGGLE_MAX)
//   SWEEP     3H = low hard knockdown
//   SPECIALS  motion + L/M/H (236 · 214 · 623 · [4]6 charge · [2]8 charge) — L/M/H change speed/range/damage
//             or the S button + a direction (6S / 4S / 2S / 5S / 8S) = the same move at 85% damage (keyboard path)
//   SUPER     236236 + any attack, or S+H together, with a full meter (one super per suit)
//   CANCELS   normal → special → super on hit or block
//   BLOCK     hold away from the attacker; crouch-block for lows, stand for overheads (jump-ins)
//   THROW     L+M together up close (back + L+M throws behind) · tech by pressing L+M as you're grabbed
//   DASH      66 / 44 (the backdash is briefly invulnerable)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.FAFFight = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const W = 960, GROUND = 476, XMIN = 64, XMAX = 896, GRAV = 0.72, BUF = 8, ROUND_T = 99 * 60;
  const METER_MAX = 100, JUGGLE_MAX = 8, CHARGE = 36, SHORT_K = 0.85;

  // ------------------------------------------------------------------------------------------- shared normals --
  // box = [x0, x1, y0, y1] in front of the feet (x along facing, y up is negative); scaled per suit (reach, size).
  // h = high | mid | low | ovh (overhead).  tier: 1 L, 2 M, 3 H (the chain only climbs).
  const NORMALS = {
    '5L': { name: 'JAB', su: 4, ac: 3, rc: 8, dmg: 32, hs: 14, bs: 10, box: [10, 96, -150, -95], h: 'mid', push: 3, tier: 1 },
    '5M': { name: 'STRAIGHT', su: 7, ac: 4, rc: 13, dmg: 56, hs: 18, bs: 13, box: [10, 118, -160, -80], h: 'mid', push: 4, tier: 2 },
    '5H': { name: 'HAYMAKER', su: 11, ac: 5, rc: 20, dmg: 86, hs: 22, bs: 16, box: [10, 138, -170, -70], h: 'mid', push: 6, tier: 3 },
    '2L': { name: 'LOW JAB', su: 4, ac: 3, rc: 8, dmg: 26, hs: 13, bs: 9, box: [10, 96, -55, 0], h: 'low', push: 3, tier: 1, crouch: 1 },
    '2M': { name: 'LOW STRIKE', su: 7, ac: 4, rc: 14, dmg: 50, hs: 17, bs: 12, box: [10, 124, -60, 0], h: 'low', push: 4, tier: 2, crouch: 1 },
    '2H': { name: 'LAUNCHER', su: 9, ac: 5, rc: 24, dmg: 70, hs: 30, bs: 15, box: [0, 112, -215, -60], h: 'mid', push: 1, tier: 3, crouch: 1, launch: -17, jc: 1 },
    '3H': { name: 'SWEEP', su: 10, ac: 5, rc: 24, dmg: 74, hs: 20, bs: 15, box: [10, 146, -40, 0], h: 'low', push: 5, tier: 3, crouch: 1, kd: 'hard', pop: -4 },
    'jL': { name: 'AIR JAB', su: 4, ac: 6, rc: 5, dmg: 30, hs: 14, bs: 10, box: [0, 92, -130, -40], h: 'ovh', push: 2, tier: 1, air: 1 },
    'jM': { name: 'AIR STRIKE', su: 6, ac: 6, rc: 7, dmg: 50, hs: 17, bs: 12, box: [10, 112, -120, -20], h: 'ovh', push: 3, tier: 2, air: 1 },
    'jH': { name: 'AIR SMASH', su: 8, ac: 6, rc: 9, dmg: 76, hs: 20, bs: 15, box: [10, 122, -110, 10], h: 'ovh', push: 4, tier: 3, air: 1, spike: 10 },
    'THROW': { name: 'THROW', su: 3, ac: 2, rc: 22, dmg: 115, box: [0, 88, -170, 0], h: 'throw', grab: 'throw', tier: 3, kd: 'hard' },
  };

  // ------------------------------------------------------------------------------------------- the suits --
  // Specials: motion = '236' | '214' | '623' | '[4]6' | '[2]8';  short = the S-button direction (6 4 2 5 8).
  // kind: strike (default) · proj · zone · grab · tele · burrow · counter · reflect · buff
  // Canon sources noted inline; anything marked JOE is my derivation and is listed in docs/FIGHTER.md.
  const S = (o) => o;
  const CHARS = {
    sandtrap: { name: 'SANDTRAP', pilot: 'MURAT', hp: 1030, size: 1.0, reach: 1.0, dmgk: 1.0, walk: 2.6, back: 2.1, jump: -15, jx: 3.6,
      hurt: [40, 172, 108], color: '#e8c878', call: 'I CAN SEE THROUGH YOU.', style: 'digger · rushdown',
      tc: [S({ from: ['5L'], btn: 'L', dir: 6, key: 'TC1', name: 'MAST JAB', su: 5, ac: 3, rc: 10, dmg: 40, hs: 16, bs: 11, box: [10, 108, -165, -90], h: 'mid', push: 3, tier: 2 }),
           S({ from: ['5M', 'TC1'], btn: 'H', dir: 6, key: 'TC2', name: 'CLAW OVERHEAD', su: 14, ac: 4, rc: 18, dmg: 80, hs: 22, bs: 15, box: [10, 132, -190, -40], h: 'ovh', push: 5, tier: 3 })],
      specials: [
        S({ key: 'A', name: 'DRILL RUSH', motion: '236', short: 6, su: 10, ac: 18, rc: 16, dmg: 26, hits: 3, hs: 16, bs: 10, box: [10, 112, -150, -40], h: 'mid', push: 1.5, dash: 7, kd: 'soft', lastLaunch: -9 }),   // canon: drill suit
        S({ key: 'B', name: 'X-RAY READ', motion: '214', short: 4, kind: 'counter', su: 3, ac: 24, rc: 18, dmg: 120, counter: { launch: -15, name: 'X-RAY COUNTER' } }),          // canon: x-ray vision
        S({ key: 'C', name: 'SULFUR BURROW', motion: '[2]8', short: 8, kind: 'burrow', su: 8, travel: 22, ac: 6, rc: 20, dmg: 96, hs: 30, bs: 14, box: [-40, 80, -200, 0], h: 'mid', push: 2, launch: -16 }), // game spec
        S({ key: 'D', name: 'SULFUR FOG', motion: '623', short: 2, kind: 'zone', su: 12, ac: 6, rc: 16, dmg: 10, h: 'mid', zone: { at: 150, w: 90, life: 130, every: 22, slow: 120, col: '#d8c84a' } }), // canon: sulfur-fog
      ],
      super: S({ name: 'TRIPLE DRILL', su: 6, ac: 30, rc: 26, dmg: 44, hits: 7, hs: 18, bs: 10, box: [10, 132, -170, -20], h: 'mid', push: 1, dash: 8, lastLaunch: -16, kd: 'hard', joe: 'name' }) },

    backdraft: { name: 'BACKDRAFTE', pilot: 'EDNA', hp: 990, size: 0.96, reach: 1.0, dmgk: 1.06, walk: 2.9, back: 2.3, jump: -15.5, jx: 3.9, air2: 1,
      hurt: [38, 168, 106], color: '#ff7a3a', call: 'OPENING GASKETS. PRIMING.', style: 'pyro · burns herself for RAGE', rage: 1,
      tc: [S({ from: ['5L'], btn: 'L', dir: 6, key: 'TC1', name: 'GASKET KICK', su: 5, ac: 3, rc: 10, dmg: 38, hs: 16, bs: 11, box: [10, 104, -120, -40], h: 'mid', push: 3, tier: 2 }),
           S({ from: ['5M', 'TC1'], btn: 'M', dir: null, key: 'TC2', name: 'TWIN FLAMER', su: 8, ac: 8, rc: 16, dmg: 34, hits: 2, hs: 18, bs: 12, box: [10, 150, -150, -70], h: 'mid', push: 4, tier: 3 })],
      specials: [
        S({ key: 'A', name: 'FLAMER', motion: '236', short: 6, kind: 'zone', su: 9, ac: 10, rc: 18, dmg: 18, selfDmg: 6, zone: { at: 120, w: 95, life: 34, every: 7, follow: 1, col: '#ff7a1a', hs: 12 } }), // canon: hydrazine flamers
        S({ key: 'B', name: 'ATMODOME FLASH', motion: '214', short: 4, su: 12, ac: 6, rc: 22, dmg: 120, hs: 30, bs: 16, box: [-110, 130, -220, 0], h: 'mid', push: 4, launch: -13, inv: [1, 13], selfDmg: 16 }),  // game spec
        S({ key: 'C', name: 'AFTERBURNER', motion: '623', short: 2, su: 3, ac: 10, rc: 22, dmg: 46, hits: 2, hs: 26, bs: 14, box: [0, 100, -230, -20], h: 'mid', push: 1, rise: [-13, 2.5], launch: -14, inv: [1, 8], selfDmg: 6 }),
        S({ key: 'D', name: 'JET CHARGE', motion: '[4]6', short: 5, su: 8, ac: 16, rc: 18, dmg: 52, hits: 2, hs: 22, bs: 14, box: [0, 120, -150, -30], h: 'mid', push: 5, dash: 9, kd: 'hard', lastLaunch: -8 }),      // canon: back jet engine
      ],
      super: S({ name: 'HYDRAZINE HEART', kind: 'proj', su: 14, ac: 1, rc: 34, dmg: 40, hits: 8, hs: 16, bs: 10, h: 'mid', selfDmg: 36, inv: [1, 14],
        proj: { speed: 9, w: 70, h: 150, life: 90, every: 5, beam: 1, col: '#ff5a1a', kdLast: 1 }, joe: 'name' }) },

    holyroller: { name: 'HOLY ROLLER', pilot: 'BUD', hp: 960, size: 1.04, reach: 1.12, dmgk: 0.98, walk: 2.4, back: 2.1, jump: -14, jx: 3.4,
      hurt: [44, 176, 112], color: '#3affe0', call: 'INTO THE VORTEX.', style: 'serpent · zoner',
      tc: [S({ from: ['5M'], btn: 'M', dir: null, key: 'TC1', name: 'DOUBLE COIL', su: 6, ac: 4, rc: 14, dmg: 52, hs: 19, bs: 13, box: [10, 150, -175, -70], h: 'mid', push: 4, tier: 3 })],
      specials: [
        S({ key: 'A', name: 'TORRENT', motion: '236', short: 6, kind: 'proj', su: 12, ac: 1, rc: 22, dmg: 62, hs: 18, bs: 12, h: 'mid', proj: { speed: 10, w: 34, h: 30, life: 110, col: '#7fd0ff' } }),
        S({ key: 'B', name: 'WATERSPOUT', motion: '214', short: 4, kind: 'zone', su: 14, ac: 6, rc: 18, dmg: 16, h: 'mid', zone: { at: 250, w: 60, life: 60, every: 10, pull: 2.2, launchLast: -14, col: '#7fd0ff', tall: 1 } }), // game spec
        S({ key: 'C', name: 'COIL STRIKE', motion: '623', short: 2, su: 4, ac: 8, rc: 24, dmg: 98, hs: 30, bs: 16, box: [0, 110, -240, -40], h: 'mid', push: 2, rise: [-12, 2], launch: -14, inv: [1, 9] }),
        S({ key: 'D', name: 'SERPENT LASH', motion: '[4]6', short: 5, su: 12, ac: 4, rc: 20, dmg: 84, hs: 22, bs: 15, box: [80, 270, -120, -40], h: 'mid', push: 7, kd: 'soft', pop: -6 }),
      ],
      super: S({ name: 'THE VORTEX', kind: 'zone', su: 12, ac: 6, rc: 30, dmg: 30, h: 'mid', inv: [1, 12], zone: { track: 1, w: 80, life: 90, every: 9, pull: 3.5, launchLast: -18, col: '#3affe0', tall: 1 }, joe: 'name' }) },

    foxeylady: { name: 'FOXEY LADY', pilot: 'RENEE', hp: 1150, size: 1.08, reach: 1.0, dmgk: 1.12, walk: 2.0, back: 1.8, jump: -13, jx: 3.0,
      hurt: [50, 178, 116], color: '#cfe6ff', call: 'GET BEHIND ME.', style: 'heavy lifter · grappler', armorH: 1,
      tc: [S({ from: ['5M'], btn: 'H', dir: 6, key: 'TC1', name: 'BACK BREAKER', su: 16, ac: 5, rc: 18, dmg: 96, hs: 24, bs: 16, box: [10, 132, -200, -30], h: 'ovh', push: 6, tier: 3, kd: 'soft', pop: -5 })],
      specials: [
        S({ key: 'A', name: 'JET BOOST', motion: '[4]6', short: 6, su: 10, ac: 14, rc: 20, dmg: 96, hs: 26, bs: 15, box: [0, 120, -170, -20], h: 'mid', push: 6, dash: 9, armor: 1, kd: 'hard', pop: -7 }),   // canon: jet-boost
        S({ key: 'B', name: 'DEADLIFT', motion: '214', short: 4, kind: 'grab', su: 6, ac: 3, rc: 30, dmg: 160, box: [0, 100, -170, 0], h: 'throw', grab: 'command' }),  // game spec
        S({ key: 'C', name: 'LIFT-OFF', motion: '623', short: 2, kind: 'grab', su: 5, ac: 12, rc: 22, dmg: 150, box: [0, 110, -260, -60], h: 'throw', grab: 'air', rise: [-13, 1.5], inv: [1, 6] }), // canon: jet-boost lift grab
        S({ key: 'D', name: 'BRIDGE BRACE', motion: '236', short: 5, su: 20, ac: 5, rc: 18, dmg: 110, hs: 26, bs: 16, box: [10, 128, -180, -30], h: 'mid', push: 8, armor: 2, kd: 'soft', pop: -6 }), // script: held up a bridge
      ],
      super: S({ name: 'SOCCER KICK', su: 9, ac: 6, rc: 30, dmg: 320, hs: 50, bs: 22, box: [0, 150, -150, 0], h: 'mid', push: 14, launch: -10, kd: 'hard', inv: [1, 9], joe: 'name' }) },

    poison: { name: 'POISON SAFETY', pilot: 'FABIEN', hp: 1000, size: 1.0, reach: 1.05, dmgk: 0.96, walk: 2.3, back: 2.0, jump: -14, jx: 3.4,
      hurt: [46, 166, 108], color: '#9bff5b', call: 'HOLD YOUR BREATH.', style: 'hazmat · trap zoner',
      tc: [S({ from: ['2M'], btn: 'M', dir: 3, key: 'TC1', name: 'HOSE WHIP', su: 8, ac: 4, rc: 16, dmg: 56, hs: 20, bs: 13, box: [20, 160, -60, 0], h: 'low', push: 4, tier: 3 })],
      specials: [
        S({ key: 'A', name: 'CANISTER LOB', motion: '236', short: 6, kind: 'proj', su: 13, ac: 1, rc: 22, dmg: 46, hs: 18, bs: 10, h: 'mid', proj: { speed: 6, arc: -10, grav: 0.42, w: 28, h: 28, life: 120, col: '#caa01a', cloud: { w: 70, life: 90, every: 22, dot: 120, col: '#9bff5b' } } }),
        S({ key: 'B', name: 'SUCTION HOSE', motion: '214', short: 4, su: 12, ac: 8, rc: 18, dmg: 40, hs: 26, bs: 12, box: [40, 260, -140, -40], h: 'mid', push: -12, pull: 1 }),  // OG art: suction cups
        S({ key: 'C', name: 'FILTER PURGE', motion: '623', short: 2, su: 5, ac: 8, rc: 22, dmg: 78, hs: 26, bs: 14, box: [-60, 100, -220, 0], h: 'mid', push: 8, launch: -11, inv: [1, 7] }),
        S({ key: 'D', name: 'TOXIN VENT', motion: '[4]6', short: 5, kind: 'zone', su: 12, ac: 6, rc: 16, dmg: 12, h: 'mid', zone: { at: 90, w: 110, life: 150, every: 25, dot: 160, col: '#9bff5b' } }),   // game spec
      ],
      super: S({ name: 'NEUTRALIZE', kind: 'zone', su: 10, ac: 6, rc: 24, dmg: 26, h: 'mid', inv: [1, 10], zone: { at: 0, w: 300, life: 80, every: 8, dot: 300, launchLast: -12, col: '#9bff5b' }, joe: 'name' }) },

    solitaire: { name: 'SOLITAIRE', pilot: 'JEAN SOLITAIRE', hp: 950, size: 0.62, reach: 1.0, dmgk: 1.06, walk: 3.6, back: 3.0, jump: -16.5, jx: 4.6, air2: 2,
      hurt: [26, 110, 70], color: '#7fd0ff', call: 'I AM ONE THROUGH SIX.', style: 'man-sized ninja · teleports · GETS BIG',
      tc: [S({ from: ['5L', '2L'], btn: 'L', dir: 6, key: 'TC1', name: 'SHADOW KNEE', su: 4, ac: 3, rc: 9, dmg: 36, hs: 16, bs: 11, box: [0, 96, -120, -40], h: 'mid', push: 3, tier: 2 }),
           S({ from: ['TC1'], btn: 'M', dir: 6, key: 'TC2', name: 'ONE THROUGH SIX', su: 6, ac: 12, rc: 16, dmg: 18, hits: 6, hs: 16, bs: 10, box: [0, 120, -150, -20], h: 'mid', push: 1, tier: 3, kd: 'soft', lastLaunch: -8 })],
      specials: [
        S({ key: 'A', name: 'CHARGE SHOT', motion: '[4]6', short: 6, kind: 'proj', su: 10, ac: 1, rc: 18, dmg: 58, hs: 18, bs: 11, h: 'mid', proj: { speed: 12, w: 30, h: 22, life: 90, col: '#7fd0ff' } }),   // canon: charging weapons
        S({ key: 'B', name: 'SHADOW STEP', motion: '214', short: 4, kind: 'tele', su: 6, ac: 1, rc: 14, inv: [1, 12] }),   // canon: teleport
        S({ key: 'C', name: 'RISING BLADE', motion: '623', short: 2, su: 3, ac: 8, rc: 20, dmg: 34, hits: 3, hs: 24, bs: 12, box: [-10, 140, -200, -10], h: 'mid', push: 1, rise: [-14, 4.5], launch: -13, inv: [1, 8] }),
        S({ key: 'D', name: 'SIX CUT', motion: '236', short: 5, su: 8, ac: 18, rc: 16, dmg: 18, hits: 6, hs: 14, bs: 9, box: [0, 104, -130, -20], h: 'mid', push: 1, dash: 5, kd: 'soft', lastLaunch: -7 }),
      ],
      super: S({ name: 'GET BIG', kind: 'buff', su: 16, ac: 6, rc: 22, dmg: 150, hs: 30, bs: 16, box: [-90, 150, -260, 0], h: 'mid', push: 10, launch: -14, inv: [1, 22], big: 600 }) },   // canon: GET BIG

    namor: { name: 'NAMOR', pilot: 'CAROL', hp: 1040, size: 1.0, reach: 1.1, dmgk: 1.05, walk: 2.9, back: 2.3, jump: -14.5, jx: 3.8, air2: 1,
      hurt: [42, 174, 110], color: '#7fd0ff', call: 'DRUM-SOLO FROM MOBY DICK!', style: 'aquatic · redirects fire',
      tc: [S({ from: ['5L'], btn: 'M', dir: 6, key: 'TC1', name: 'RIPTIDE HOOK', su: 7, ac: 4, rc: 13, dmg: 52, hs: 19, bs: 13, box: [10, 130, -170, -60], h: 'mid', push: 4, tier: 2 })],
      specials: [
        S({ key: 'A', name: 'WATER JET', motion: '236', short: 6, kind: 'proj', su: 11, ac: 1, rc: 20, dmg: 58, hs: 18, bs: 12, h: 'mid', proj: { speed: 11, w: 30, h: 26, life: 100, col: '#7fd0ff' } }),
        S({ key: 'B', name: 'REDIRECT', motion: '214', short: 4, kind: 'reflect', su: 3, ac: 22, rc: 16 }),     // canon: catches and redirects fire
        S({ key: 'C', name: 'RIPTIDE', motion: '623', short: 2, su: 4, ac: 10, rc: 22, dmg: 36, hits: 3, hs: 24, bs: 12, box: [-30, 100, -220, -10], h: 'mid', push: 1, rise: [-12, 1], launch: -14, inv: [1, 8] }),
        S({ key: 'D', name: 'TIDAL DRUM', motion: '[4]6', short: 5, kind: 'proj', su: 14, ac: 1, rc: 22, dmg: 70, hs: 20, bs: 14, h: 'low', proj: { speed: 7, w: 46, h: 40, life: 120, low: 1, col: '#2e9bd8' } }),   // game spec
      ],
      super: S({ name: 'DRUM SOLO', su: 8, ac: 36, rc: 26, dmg: 28, hits: 12, hs: 16, bs: 9, box: [0, 130, -170, -10], h: 'mid', push: 0.6, dash: 4, lastLaunch: -15, kd: 'hard', inv: [1, 8] }) },

    angie: { name: 'JUSTICE-RIG', pilot: 'ANGIE', hp: 950, size: 1.0, reach: 1.15, dmgk: 1.0, walk: 3.0, back: 2.6, jump: -15.5, jx: 4.0,
      hurt: [36, 172, 106], color: '#ff5b6b', call: 'COME AND TAKE IT.', style: 'trident duelist · footsies',
      tc: [S({ from: ['5M'], btn: 'M', dir: 6, key: 'TC1', name: 'TRIDENT TWIST', su: 7, ac: 5, rc: 14, dmg: 58, hs: 19, bs: 13, box: [30, 170, -160, -70], h: 'mid', push: 5, tier: 3 }),
           S({ from: ['2L'], btn: 'L', dir: 3, key: 'TC2', name: 'EN POINTE', su: 4, ac: 3, rc: 9, dmg: 28, hs: 14, bs: 9, box: [10, 104, -50, 0], h: 'low', push: 3, tier: 2 })],
      specials: [
        S({ key: 'A', name: 'IMPALER', motion: '236', short: 6, su: 12, ac: 6, rc: 20, dmg: 92, hs: 24, bs: 15, box: [40, 230, -150, -60], h: 'mid', push: 7, dash: 6, kd: 'soft', pop: -6 }),    // game spec
        S({ key: 'B', name: 'DAGGER TOSS', motion: '214', short: 4, kind: 'proj', su: 10, ac: 1, rc: 18, dmg: 34, hs: 15, bs: 10, h: 'mid', proj: { speed: 12, w: 24, h: 14, life: 90, n: 2, spread: 40, col: '#ff5b6b' } }),
        S({ key: 'C', name: 'PIROUETTE', motion: '623', short: 2, su: 4, ac: 12, rc: 22, dmg: 30, hits: 4, hs: 22, bs: 12, box: [-70, 100, -230, -10], h: 'mid', push: 1, rise: [-11, 1.5], launch: -13, inv: [1, 9] }),
        S({ key: 'D', name: 'GRAND JETE', motion: '[4]6', short: 5, su: 10, ac: 8, rc: 16, dmg: 80, hs: 22, bs: 15, box: [0, 120, -140, 10], h: 'ovh', push: 4, hop: [6, -10] }),
      ],
      super: S({ name: 'MARTIAN MISTRESS', su: 8, ac: 30, rc: 28, dmg: 36, hits: 9, hs: 16, bs: 9, box: [20, 200, -170, -20], h: 'mid', push: 0.6, dash: 3, lastLaunch: -16, kd: 'hard', inv: [1, 8], joe: 'name' }) },

    morningstar: { name: 'MORNING STAR', pilot: 'KYLE SINGLER', hp: 1250, size: 1.22, reach: 1.15, dmgk: 1.08, walk: 2.1, back: 1.9, jump: -13.5, jx: 3.2,
      hurt: [54, 196, 126], color: '#b14bff', call: 'GRAVITY IS NOT A SUGGESTION.', style: 'boss · gravity and rails', boss: 1, lock: 'arcade',
      tc: [S({ from: ['5M'], btn: 'H', dir: null, key: 'TC1', name: 'FLAIL CHAIN', su: 12, ac: 8, rc: 18, dmg: 52, hits: 2, hs: 22, bs: 15, box: [10, 190, -180, -40], h: 'mid', push: 6, tier: 3 })],
      specials: [
        S({ key: 'A', name: 'RAIL VOLLEY', motion: '236', short: 6, kind: 'proj', su: 12, ac: 1, rc: 22, dmg: 40, hs: 15, bs: 10, h: 'mid', proj: { speed: 14, w: 30, h: 12, life: 80, n: 3, spread: 30, col: '#b14bff' } }),   // boss move
        S({ key: 'B', name: 'GRAVITY WELL', motion: '214', short: 4, kind: 'zone', su: 14, ac: 6, rc: 20, dmg: 22, h: 'mid', zone: { at: 260, w: 70, life: 70, every: 14, pull: 3, col: '#b14bff', tall: 1 } }),   // boss move
        S({ key: 'C', name: 'GRAV SLAM', motion: '623', short: 2, su: 10, ac: 6, rc: 24, dmg: 112, hs: 28, bs: 16, box: [-60, 180, -200, 0], h: 'mid', push: 8, launch: -12, armor: 1 }),      // boss move
        S({ key: 'D', name: 'MORNING FLAIL', motion: '[4]6', short: 5, su: 14, ac: 6, rc: 22, dmg: 96, hs: 24, bs: 16, box: [60, 260, -190, -60], h: 'mid', push: 8, kd: 'soft', pop: -6 }), // script: chain flail
      ],
      super: S({ name: 'CHEST BEAM', kind: 'proj', su: 16, ac: 1, rc: 34, dmg: 38, hits: 9, hs: 16, bs: 10, h: 'mid', inv: [1, 16], proj: { speed: 16, w: 90, h: 70, life: 60, every: 5, beam: 1, col: '#d68bff', kdLast: 1 } }) },  // script: the orb beam
  };

  // THE GREAT ONES (Kyle's SinglerTech league) — the ladder's dark foils. Each rides a squad suit's model in its own
  // colours until it gets its own Blender build (JOE), with its own numbers and move names.
  function foil(base, o) { const b = CHARS[base], c = Object.assign({}, b, o, { foilOf: base });
    c.specials = b.specials.map((m, i) => Object.assign({}, m, (o.sp && o.sp[i]) || {})); delete c.sp;
    c.super = Object.assign({}, b.super, o.su || {}); delete c.su; return c; }
  CHARS.deadletter = foil('solitaire', { name: 'DEAD LETTER', pilot: 'KYLE SINGLER', hp: 1000, size: 0.7, dmgk: 1.14, walk: 3.8, hurt: [28, 118, 76], color: '#9fe8ff', call: 'YOU SHOULD HAVE LOOKED CLOSER.', style: 'Great One · briefcase ninja', great: 1, lock: 'arcade',
    sp: [{ name: 'WAVE SHOT' }, { name: 'DEAD DROP' }, { name: 'LETTER OPENER' }, { name: 'BRIEFCASE' }],
    su: { name: 'WAVE PULSE', kind: 'proj', su: 14, ac: 1, rc: 30, dmg: 34, hits: 8, inv: [1, 14], big: 0, proj: { speed: 14, w: 80, h: 120, life: 70, every: 5, beam: 1, col: '#9fe8ff', kdLast: 1 } } });
  CHARS.widow = foil('angie', { name: 'WHITE WIDOW', pilot: 'THE LEAGUE', hp: 980, color: '#c8ffb0', call: 'HOLD STILL.', style: 'Great One · venom duelist', great: 1, lock: 'arcade',
    sp: [{ name: 'FANG LUNGE', dot: 90 }, { name: 'VENOM PINS', proj: Object.assign({}, CHARS.angie.specials[1].proj, { col: '#9bff5b' }), dot: 120 }, { name: 'SPINNERET' }, { name: 'WIDOW DROP' }],
    su: { name: 'SILK COFFIN' } });
  CHARS.undertow = foil('namor', { name: 'UNDERTOW', pilot: 'THE LEAGUE', hp: 1020, color: '#3affe0', call: 'DOWN YOU GO.', style: 'Great One · drowning zoner', great: 1, lock: 'arcade',
    sp: [{ name: 'BLACK WATER' }, { name: 'DEFLECT' }, { name: 'WHIRLPOOL' }, { name: 'RIP CURRENT', proj: Object.assign({}, CHARS.namor.specials[3].proj, { speed: 9, col: '#0e6a74' }) }],
    su: { name: 'DROWNING' } });
  CHARS.anvil = foil('foxeylady', { name: 'ANVIL CHORUS', pilot: 'THE LEAGUE', hp: 1300, dmgk: 1.18, walk: 1.8, color: '#e0a92e', call: 'SING IT.', style: 'Great One · siege heavy', great: 1, lock: 'arcade',
    sp: [{ name: 'RAM' }, { name: 'HAMMERLOCK' }, { name: 'UPLIFT' }, { name: 'IRON CHORUS', armor: 3 }],
    su: { name: 'ANVIL FALL' } });

  const ROSTER = ['sandtrap', 'backdraft', 'holyroller', 'foxeylady', 'poison', 'solitaire', 'namor', 'angie', 'deadletter', 'widow', 'undertow', 'anvil', 'morningstar'];
  // ARCADE ladder: POD 19 exhibition bouts, then the Great Ones at THE EXIT, then Kyle.
  const LADDER = [
    { stage: 'pod19', foe: 'auto0', title: 'POD 19 — EXHIBITION', sub: 'Phaser has the crowd. Two suits, one pod.' },
    { stage: 'newqom', foe: 'auto1', title: 'NEW QOM — UNDER THE DOME', sub: 'The cult wants a champion. Give them one.' },
    { stage: 'underhive', foe: 'auto2', title: 'MARS UNDERHIVE', sub: 'Something down here wears a friend\'s suit.' },
    { stage: 'crawler', foe: 'anvil', title: 'THE EXIT — ANVIL CHORUS', sub: 'Kyle\'s league breaks out. The first Great One blocks the ramp.' },
    { stage: 'underhive', foe: 'widow', title: 'THE EXIT — WHITE WIDOW', sub: 'She never misses twice.' },
    { stage: 'ishtar', foe: 'undertow', title: 'THE EXIT — UNDERTOW', sub: 'The sulfur fog hides the water.' },
    { stage: 'newqom', foe: 'deadletter', title: 'THE EXIT — DEAD LETTER', sub: 'The briefcase that killed the room.' },
    { stage: 'ishtar', foe: 'morningstar', title: 'KYLE — MORNING STAR', sub: 'Gravity is not a suggestion. See it with your own two eyes.' },
  ];
  const STAGES = ['pod19', 'newqom', 'underhive', 'crawler', 'ishtar'];

  // ------------------------------------------------------------------------------------------- rng / build --
  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  function mkF(id, side) {
    const c = CHARS[id]; if (!c) throw new Error('no suit ' + id);
    return { id, side, c, x: side ? W / 2 + 170 : W / 2 - 170, y: GROUND, vx: 0, vy: 0, face: side ? -1 : 1,
      hp: c.hp, maxhp: c.hp, state: 'stand', move: null, mkey: '', sf: 0, hitN: 0, hitsLeft: 0, connected: false, cancel: false,
      hitstun: 0, blockstun: 0, kd: 0, kdKind: '', airHit: false, juggle: 0, juggleFull: false, inv: 0, armor: 0,
      dot: 0, slow: 0, jumps: 0, sj: false, chainL: 0, animT: 0, bigT: 0, rage: false, dashT: 0, dashV: 0, throwInv: 0,
      land: 0, strength: 'M', shortcut: false, lastHitBy: '', counterOn: false, reflectOn: false };
  }
  function mkBuf() { return { pd: {}, pm: {}, dirs: [], held: {}, press: { L: 0, M: 0, H: 0, S: 0 }, pt: { L: -99, M: -99, H: -99, S: -99 }, cb: 0, cd: 0, kb: 0, kbT: 0, kd2: 0, kdT: 0, last: 5, tap: { 6: -99, 4: -99 }, dash: 0, raw: {}, upEdge: false }; }

  function create(opt) {
    opt = opt || {};
    const E = { W, GROUND, XMIN, XMAX, t: 0, timer: opt.training ? Infinity : (opt.time || ROUND_T), hitstop: 0, freeze: 0, freezeBy: -1,
      f: [mkF(opt.p1 || 'sandtrap', 0), mkF(opt.p2 || 'holyroller', 1)], meter: [opt.meter0 || 0, opt.meter1 || 0], buf: [mkBuf(), mkBuf()],
      projs: [], zones: [], events: [], over: false, winner: -1, combo: [0, 0], comboDmg: [0, 0], comboMax: [0, 0],
      rnd: rng(opt.seed || 1), cpuMem: [{ plan: [], t: 0, hold: 0 }, { plan: [], t: 0, hold: 0 }], training: !!opt.training, infMeter: !!opt.infMeter,
      idleT: [0, 0], stats: { hits: [0, 0], specials: [0, 0], supers: [0, 0], throws: [0, 0], blocks: [0, 0], tcs: [0, 0], launch: [0, 0], airhits: [0, 0], bestCombo: [0, 0], parries: [0, 0], techs: [0, 0], counters: [0, 0] } };
    E.step = (i0, i1) => step(E, [i0 || {}, i1 || {}]);
    E.hash = () => hash(E);
    return E;
  }

  // ------------------------------------------------------------------------------------------- input --
  function relDir(inp, face) {        // 6 = toward where you face, 4 = away, 2 down, 8 up
    const h = (inp.r ? 1 : 0) - (inp.l ? 1 : 0), fwd = h * face, v = (inp.d ? 1 : 0) - (inp.u ? 1 : 0);
    return 5 + fwd + (v > 0 ? -3 : v < 0 ? 3 : 0);
  }
  function feed(E, s, inp, face, frozen) {
    const b = E.buf[s], d = relDir(inp, face), prev = b.last;
    b.dirs.push(d); if (b.dirs.length > 40) b.dirs.shift();
    b.raw = inp; b.upEdge = d >= 7 && prev < 7;
    if (b.upEdge) b.upBuf = BUF; else if (b.upBuf > 0 && !frozen) b.upBuf--;
    // charge: back (1 4 7) and down (1 2 3); a released charge stays good for 10 ticks
    if (d === 1 || d === 4 || d === 7) b.cb++; else { if (b.cb >= CHARGE) { b.kb = b.cb; b.kbT = 10; } b.cb = 0; }
    if (d <= 3) b.cd++; else { if (b.cd >= CHARGE) { b.kd2 = b.cd; b.kdT = 10; } b.cd = 0; }
    if (b.kbT > 0) b.kbT--; if (b.kdT > 0) b.kdT--;
    // dash: 6 5 6 (or 4 5 4) inside 14 ticks
    if ((d === 6 || d === 4) && prev === 5) { if (E.t - b.tap[d] <= 14 && b.lastTapFrom5 === d) b.dash = d; b.tap[d] = E.t; b.lastTapFrom5 = d; }
    else if (d !== 5 && d !== 6 && d !== 4) b.lastTapFrom5 = 0;
    b.last = d;
    for (const k of ['L', 'M', 'H', 'S']) {
      if (inp[k] && !b.held[k]) { b.press[k] = BUF; b.pt[k] = E.t; b.pd[k] = d; b.pm[k] = snapMotions(b); }
      else if (b.press[k] > 0 && !frozen) b.press[k]--;
      b.held[k] = !!inp[k];
    }
  }
  function seqIn(dirs, seq, win) { const d = dirs.slice(-win); let j = 0; for (const x of d) { if (x === seq[j]) j++; if (j === seq.length) return true; } return false; }
  function motionOk(b, mo) {
    const last = b.dirs[b.dirs.length - 1];
    switch (mo) {
      case '236': return seqIn(b.dirs, [2, 3, 6], 16);
      case '214': return seqIn(b.dirs, [2, 1, 4], 16);
      case '623': return seqIn(b.dirs, [6, 2, 3], 18) && (last === 3 || last === 2 || last === 6);
      case '236236': return seqIn(b.dirs, [2, 3, 6, 2, 3, 6], 34);
      case '[4]6': return (b.cb >= CHARGE || (b.kbT > 0 && b.kb >= CHARGE)) && (last === 6 || last === 3 || last === 9);
      case '[2]8': return (b.cd >= CHARGE || (b.kdT > 0 && b.kd2 >= CHARGE)) && last >= 7;
    }
    return false;
  }
  const MOTIONS = ['236', '214', '623', '236236', '[4]6', '[2]8'];
  function snapMotions(b) { const o = {}; for (const m of MOTIONS) o[m] = motionOk(b, m); return o; }
  // a motion counts if it was good when the button went down (so it survives hitstop) or is good now
  const mot = (b, mo, k) => !!((b.pm[k] && b.pm[k][mo]) || motionOk(b, mo));
  const take = (b, k) => { if (b.press[k] > 0) { b.press[k] = 0; return true; } return false; };
  function anyAtk(b) { return b.press.H > 0 ? 'H' : b.press.M > 0 ? 'M' : b.press.L > 0 ? 'L' : b.press.S > 0 ? 'S' : ''; }

  // ------------------------------------------------------------------------------------------- the step --
  function step(E, inputs) {
    E.events = [];
    if (E.over) { for (const f of E.f) { f.animT++; physics(E, f); } return; }
    E.t++;
    const frozen = E.hitstop > 0 || E.freeze > 0;
    for (let s = 0; s < 2; s++) feed(E, s, inputs[s], E.f[s].face, frozen);
    if (E.freeze > 0) { E.freeze--; return; }
    if (E.hitstop > 0) { E.hitstop--; return; }
    if (E.timer > 0 && E.timer !== Infinity) E.timer--;
    for (const f of E.f) {
      f.animT++;
      if (f.dot > 0) { f.dot--; if (f.dot % 30 === 0 && f.hp > 1) { f.hp = Math.max(1, f.hp - 5); E.events.push({ k: 'dot', f }); } }
      if (f.slow > 0) f.slow--;
      if (f.bigT > 0 && --f.bigT === 0) E.events.push({ k: 'small', f });
      if (f.throwInv > 0) f.throwInv--;
      if (f.c.rage) { const r = f.hp < f.maxhp * 0.4; if (r && !f.rage) E.events.push({ k: 'rage', f }); f.rage = r; }
    }
    for (let s = 0; s < 2; s++) think(E, s);
    for (const f of E.f) physics(E, f);
    pushApart(E);
    resolveHits(E);
    tickProjs(E); tickZones(E);
    for (let s = 0; s < 2; s++) {           // face the opponent whenever you're free on the ground
      const p = E.f[s], o = E.f[1 - s];
      if (!p.move && p.hitstun <= 0 && p.blockstun <= 0 && p.kd <= 0 && p.y >= GROUND && p.dashT <= 0 && Math.abs(o.x - p.x) > 4) p.face = o.x >= p.x ? 1 : -1;
    }
    comboTrack(E);
    if (E.training) trainingRefill(E);
    checkOver(E);
  }

  function actionable(f) { return !f.move && f.hitstun <= 0 && f.blockstun <= 0 && f.kd <= 0 && f.state !== 'ko' && f.dashT <= 0 && f.land <= 0; }
  function sizeK(f) { return (f.bigT > 0 ? 2 : 1); }

  function think(E, s) {
    const b = E.buf[s], p = E.f[s], o = E.f[1 - s];
    if (p.state === 'ko') return;
    const air = p.y < GROUND;
    // ---- cancels out of a move that made contact (hit or block) ----
    if (p.move && p.cancel) {
      const m = p.move, tier = m.tier || 0;
      // super jump off the launcher
      if (m.jc && p.connected && !p.blockedLast && b.upBuf > 0 && !air) { b.upBuf = 0; superJump(E, p, o); return; }
      const r = resolveAttack(E, s, air, true);
      if (r) {
        let ok = false;
        if (r.type === 'super') ok = tier < 9 && !m.isSuper;
        else if (r.type === 'special') ok = tier < 5 && !m.noSc;
        else if (r.type === 'tc') ok = true;
        else if (r.type === 'normal') ok = (r.mv.air ? 1 : 0) === (air ? 1 : 0) && (r.mv.tier > tier || (r.mv.tier === 1 && tier === 1 && p.chainL < 2)) && tier < 4 && !m.isTC;
        if (ok) { r.consume(); return doAttack(E, p, r); }
      }
    }
    if (!actionable(p)) {
      if (p.y >= GROUND && p.state === 'block' && p.blockstun <= 0) p.state = 'stand';
      return;
    }
    // ---- fresh attacks ----
    const r = resolveAttack(E, s, air, false);
    if (r && !(p.preJ > 0 && r.type !== 'special' && r.type !== 'super')) { p.preJ = 0; r.consume(); return doAttack(E, p, r); }
    // ---- movement ----
    const d = b.last, slow = p.slow > 0 ? 0.6 : 1, bigk = p.bigT > 0 ? 0.85 : 1;
    if (!air) {
      if (p.preJ > 0) {                   // 3-tick prejump: a [2]8 charge or a special can still come out of it
        if (--p.preJ === 0) { const jd = d >= 7 ? d : p.preD; p.vy = p.c.jump * (p.bigT > 0 ? 0.92 : 1); p.vx = (jd === 9 ? p.c.jx : jd === 7 ? -p.c.jx : 0) * p.face; p.state = 'jump'; p.jumps = 1; p.sj = false; p.chainL = 0; E.events.push({ k: 'jump', f: p }); }
        return;
      }
      if (b.dash) { const dd = b.dash; b.dash = 0;
        if (dd === 6) { p.dashT = 16; p.dashV = 7.5 * p.face * bigk; p.state = 'dash'; E.events.push({ k: 'dash', f: p }); return; }
        p.dashT = 18; p.dashV = -6.5 * p.face; p.inv = Math.max(p.inv, 7); p.state = 'backdash'; E.events.push({ k: 'dash', f: p }); return; }
      if (d >= 7) { p.preJ = 3; p.preD = d; p.vx = 0; p.state = 'prejump'; return; }
      if (d <= 3) { p.vx = 0; p.state = 'crouch'; return; }
      if (d === 6) { p.vx = p.c.walk * p.face * slow * bigk; p.state = 'walk'; return; }
      if (d === 4) { p.vx = -p.c.back * p.face * slow; p.state = 'walkb'; return; }
      p.vx = 0; p.state = 'stand';
    } else {
      const maxJ = 1 + (p.c.air2 || 0);
      if (b.upEdge && p.jumps < maxJ && p.vy > -9 && !p.sj) {
        p.vy = p.c.jump * 0.82; p.jumps++; p.vx = (d === 9 ? p.c.jx : d === 7 ? -p.c.jx : p.vx * p.face) * p.face; E.events.push({ k: 'boost', f: p });
      }
    }
  }

  // which attack the buffer asks for (does not consume until r.consume())
  function resolveAttack(E, s, air, inCancel) {
    const b = E.buf[s], p = E.f[s], o = E.f[1 - s], d = b.last, c = p.c, meter = E.meter[s];
    const atk = anyAtk(b); if (!atk) return null;
    const pdir = b.pd[atk] || d;          // the direction held when the button went down
    const mk = (type, mv, key, str, consumeKeys, extra) => Object.assign({ type, mv, key, str, consume: () => { for (const k of consumeKeys) b.press[k] = 0; } }, extra || {});
    // SUPER: 236236 + attack, or S+H together
    if (!air && meter >= METER_MAX) {
      if (b.press.S > 0 && b.press.H > 0 && Math.abs(b.pt.S - b.pt.H) <= 4) return mk('super', c.super, 'SUPER', 'H', ['S', 'H']);
      if (mot(b, '236236', atk) && atk) return mk('super', c.super, 'SUPER', atk === 'S' ? 'M' : atk, [atk]);
    }
    if (!air) {
      // THROW: L+M together, close
      if (!inCancel && b.press.L > 0 && b.press.M > 0 && Math.abs(b.pt.L - b.pt.M) <= 3) return mk('throw', NORMALS.THROW, 'THROW', 'M', ['L', 'M'], { back: pdir === 4 || pdir === 1 || pdir === 7 });
      // SPECIALS by motion (+ any attack button)
      const order = ['623', '[2]8', '236', '214', '[4]6'];
      const found = [];
      for (const mo of order) { const sp = c.specials.find(x => x.motion === mo); if (sp && mot(b, mo, atk)) found.push(sp); }
      if (found.length) {
        let sp = found[0];
        // 623 vs 236 overlap (walk forward then QCF): last dir 6 means QCF
        if (sp.motion === '623' && pdir === 6) sp = found.find(x => x.motion === '236') || sp;
        return mk('special', sp, sp.key, atk === 'S' ? 'M' : atk, [atk]);
      }
      // the S button + a direction = the keyboard path (85% damage)
      if (b.press.S > 0) {
        const sd = b.pd.S || d, want = sd === 6 || sd === 3 ? 6 : sd === 4 || sd === 1 ? 4 : sd === 2 ? 2 : sd >= 7 ? 8 : 5;
        let sp = c.specials.find(x => x.short === want) || (want === 8 ? c.specials.find(x => x.short === 2) : null) || c.specials.find(x => x.short === 5);
        if (sp) return mk('special', sp, sp.key, 'M', ['S'], { shortcut: true });
      }
      // target combos (only out of their named move)
      if (inCancel && p.move) {
        for (const tc of c.tc || []) {
          if (!tc.from.includes(p.mkey)) continue;
          if (b.press[tc.btn] <= 0) continue;
          const td = b.pd[tc.btn] || d;
          if (tc.dir && !(td === tc.dir || (tc.dir === 6 && (td === 3 || td === 9)))) continue;
          if (!tc.dir && (td === 6 && (c.tc || []).some(t => t.from.includes(p.mkey) && t.btn === tc.btn && t.dir === 6))) continue;
          return mk('tc', tc, tc.key, tc.btn, [tc.btn]);
        }
      }
      if (atk === 'S') return null;
      const crouch = pdir <= 3;
      let key = (crouch ? '2' : '5') + atk;
      if (atk === 'H' && pdir === 3) key = '3H';
      return mk('normal', NORMALS[key], key, atk, [atk]);
    }
    if (atk === 'S') { b.press.S = 0; return null; }
    return mk('normal', NORMALS['j' + atk], 'j' + atk, atk, [atk]);
  }

  const STR = { L: { dmg: 0.88, su: -1, sp: 0.8, at: 0.75 }, M: { dmg: 1, su: 0, sp: 1, at: 1 }, H: { dmg: 1.12, su: 2, sp: 1.25, at: 1.3 } };
  function doAttack(E, p, r) {
    const s = p.side;
    let mv = Object.assign({}, r.mv);
    const st = STR[r.str] || STR.M;
    if (r.type === 'special') {
      mv.su = Math.max(2, mv.su + st.su); mv.dmg = Math.round(mv.dmg * st.dmg * (r.shortcut ? SHORT_K : 1));
      if (mv.dash) mv.dash *= st.sp; if (mv.proj) mv.proj = Object.assign({}, mv.proj, { speed: mv.proj.speed * st.sp });
      if (mv.zone && mv.zone.at) mv.zone = Object.assign({}, mv.zone, { at: mv.zone.at * st.at });
      mv.tier = 5; mv.isSpecial = true;
      E.stats.specials[s]++; E.meter[s] = Math.min(METER_MAX, E.meter[s] + (E.infMeter ? 0 : 2));
      E.events.push({ k: 'special', f: p, name: mv.name, key: r.key, str: r.str, shortcut: !!r.shortcut });
    } else if (r.type === 'super') {
      mv.tier = 9; mv.isSuper = true; E.meter[s] -= METER_MAX; if (E.infMeter) E.meter[s] = METER_MAX;
      E.freeze = 34; E.freezeBy = s; E.stats.supers[s]++;
      E.events.push({ k: 'super', f: p, name: mv.name });
    } else if (r.type === 'tc') { mv.isTC = true; E.stats.tcs[s]++; E.events.push({ k: 'tc', f: p, name: mv.name }); }
    else if (r.type === 'throw') { mv.back = r.back; }
    if (r.key === '5H' && p.c.armorH) mv.armor = 1;
    if (r.key === '5L' || r.key === '2L') p.chainL = (p.move && p.move.tier === 1) ? p.chainL + 1 : 0;
    p.shortcut = !!r.shortcut; p.strength = r.str;
    startMove(E, p, r.key, mv);
  }
  function startMove(E, f, key, mv) {
    f.preJ = 0; f.move = mv; f.mkey = key; f.sf = 0; f.hitN = 0; f.connected = false; f.cancel = false; f.blockedLast = false;
    f.hitsLeft = mv.hits || 1; f.armor = mv.armor || 0; f.state = 'attack'; f.dashT = 0;
    if (!mv.air && f.y >= GROUND) f.vx = 0;
    if (mv.hop) { f.vx = mv.hop[0] * f.face; f.vy = mv.hop[1]; }
    if (mv.selfDmg) { f.hp = Math.max(1, f.hp - mv.selfDmg); E.events.push({ k: 'selfburn', f, n: mv.selfDmg }); }
    if (mv.kind === 'burrow') { const o = E.f[1 - f.side]; f.burrowTo = clamp(o.x - f.face * 30); f.inv = mv.su + mv.travel + 2; }
  }
  function superJump(E, p, o) {
    p.move = null; p.mkey = ''; p.cancel = false; p.state = 'jump'; p.sj = true; p.jumps = 3; p.chainL = 0;
    p.vy = -18.5; p.vx = Math.max(-6, Math.min(6, (o.x - p.x) * 0.06)); E.events.push({ k: 'superjump', f: p });
  }

  // ------------------------------------------------------------------------------------------- physics --
  function clamp(x) { return Math.max(XMIN, Math.min(XMAX, x)); }
  function physics(E, f) {
    if (f.inv > 0) f.inv--;
    if (f.land > 0) f.land--;
    const m = f.move;
    f.counterOn = false; f.reflectOn = false;
    if (m) {
      f.sf++;
      const act = f.sf > m.su && f.sf <= m.su + m.ac;
      if (m.inv && f.sf >= m.inv[0] && f.sf <= m.inv[1]) f.inv = Math.max(f.inv, 1);
      if (m.dash && act) f.vx = m.dash * f.face;
      if (m.dash && f.sf === m.su + m.ac + 1) f.vx = 0;
      if (m.rise && f.sf === m.su) { f.vy = m.rise[0]; f.vx = m.rise[1] * f.face; }
      if (m.kind === 'counter' && act) f.counterOn = true;
      if (m.kind === 'reflect' && act) f.reflectOn = true;
      if (m.kind === 'proj' && f.sf === m.su + 1) spawnProj(E, f, m);
      if ((m.kind === 'zone') && f.sf === m.su + 1) spawnZone(E, f, m);
      if (m.kind === 'burrow' && f.sf === m.su + m.travel) { const o = E.f[1 - f.side]; f.x = f.burrowTo; f.face = o.x >= f.x ? 1 : -1; }
      if (m.kind === 'tele' && f.sf === m.su) tele(E, f);
      if (m.kind === 'buff' && f.sf === m.su) { f.bigT = m.big || 600; E.events.push({ k: 'big', f }); }
      const tot = m.su + (m.travel || 0) + m.ac + m.rc;
      if (f.sf >= tot && (!m.air || f.y >= GROUND) && !(m.rise && f.y < GROUND)) endMove(f);
    }
    if (f.dashT > 0) { f.dashT--; f.vx = f.dashV * (f.dashT > 4 ? 1 : 0.4); if (f.dashT === 0) { f.state = 'stand'; f.vx = 0; } }
    if (f.hitstun > 0 && f.y >= GROUND && !f.airHit) { f.hitstun--; if (f.hitstun === 0) f.state = 'stand'; }
    if (f.blockstun > 0) { f.blockstun--; if (f.blockstun === 0) { f.state = 'stand'; f.throwInv = Math.max(f.throwInv, 3); } }
    if (f.kd > 0) { f.kd--; if (f.kd === 0 && f.state !== 'ko') { f.state = 'stand'; f.inv = 4; f.throwInv = 8; f.juggle = 0; f.juggleFull = false; } }
    // gravity
    if (f.y < GROUND || f.vy < 0) f.vy += GRAV * (f.airHit ? 0.9 : 1);
    f.x += f.vx; f.y += f.vy;
    if (f.y >= GROUND) {
      const wasAir = f.vy > 0;
      f.y = GROUND; f.vy = 0; f.jumps = 0; f.sj = false;
      if (wasAir && f.airHit) {
        f.airHit = false; f.hitstun = 0;
        if (f.state === 'ko' || f.hp <= 0) { f.state = 'ko'; f.kd = 0; }
        else { f.state = 'kd'; f.kd = f.kdKind === 'hard' ? 42 : 24; f.inv = f.kd + 2; E.events.push({ k: 'land', f, hard: f.kdKind === 'hard' }); }
        f.kdKind = '';
      } else if (wasAir && f.move && f.move.air) { endMove(f); f.land = 4; }
      else if (wasAir && f.move && f.move.rise) { /* rising special ends with its recovery */ if (f.sf >= f.move.su + f.move.ac) { endMove(f); f.land = 8; } }
      else if (wasAir && f.state === 'jump') { f.state = 'stand'; f.land = 3; }
      if (f.state !== 'walk' && f.state !== 'walkb' && !(f.move && f.move.dash) && f.dashT <= 0) f.vx *= 0.72;
      if (Math.abs(f.vx) < 0.05) f.vx = 0;
    }
    if (f.state === 'ko' && f.y >= GROUND) f.vx *= 0.8;
    f.x = clamp(f.x);
  }
  function endMove(f) { f.move = null; f.mkey = ''; f.cancel = false; f.state = f.y < GROUND ? 'jump' : 'stand'; f.armor = 0; }
  function tele(E, f) {
    const o = E.f[1 - f.side], str = f.strength;
    if (str === 'L') f.x = clamp(o.x - (o.x >= f.x ? 1 : -1) * 70);
    else if (str === 'H') { f.x = clamp(o.x); f.y = GROUND - 250; f.vy = 0; f.vx = 0; f.jumps = 2; endMove(f); f.state = 'jump'; }
    else { const dir = o.x >= f.x ? 1 : -1; let nx = o.x + dir * 80; if (nx < XMIN + 10 || nx > XMAX - 10) nx = o.x - dir * 80; f.x = clamp(nx); }
    f.face = o.x >= f.x ? 1 : -1; E.events.push({ k: 'tele', f });
  }
  function pushApart(E) {
    const a = E.f[0], b = E.f[1];
    if (a.state === 'ko' || b.state === 'ko' || a.kd > 0 || b.kd > 0) return;
    if (a.y < GROUND - 120 || b.y < GROUND - 120) return;
    const min = (hurtW(a) + hurtW(b)) * 0.85, d = b.x - a.x;
    if (Math.abs(d) < min) {
      const dir = d === 0 ? (a.face || 1) : Math.sign(d), need = (min - Math.abs(d)) / 2;
      a.x = clamp(a.x - need * dir); b.x = clamp(b.x + need * dir);
      if (Math.abs(b.x - a.x) < min - 1) { if (a.x <= XMIN + 1 || a.x >= XMAX - 1) b.x = clamp(a.x + min * dir); else a.x = clamp(b.x - min * dir); }
    }
  }

  // ------------------------------------------------------------------------------------------- boxes --
  function hurtW(f) { return f.c.hurt[0] * sizeK(f); }
  function hurtbox(f) {
    const k = sizeK(f), w = f.c.hurt[0] * k;
    let h = (f.state === 'crouch' || (f.move && f.move.crouch) ? f.c.hurt[2] : f.c.hurt[1]) * k;
    if (f.kd > 0 || f.state === 'ko') h = 40;
    const y1 = f.y, y0 = f.y - h;
    const box = { x0: f.x - w, x1: f.x + w, y0, y1 };
    // an attacking limb is hittable (whiff punishes)
    if (f.move && f.move.box && !f.move.kind && !f.move.inv && f.sf > f.move.su) {
      const hb = hitbox(f); if (hb) { const cut = 0.3 * (hb.x1 - hb.x0); if (f.face > 0) box.x1 = Math.max(box.x1, hb.x1 - cut); else box.x0 = Math.min(box.x0, hb.x0 + cut); }
    }
    return box;
  }
  function hitbox(f) {
    const m = f.move; if (!m || !m.box) return null;
    const k = sizeK(f), rx = f.c.reach * k * (f.c.hurt[1] < 140 ? 0.9 : 1), ry = f.c.hurt[1] / 172 * k;
    const x1 = m.grab === 'throw' ? (f.c.hurt[0] * k + 58) / rx : m.box[1];
    const a = f.x + f.face * m.box[0] * rx, b = f.x + f.face * x1 * rx;
    return { x0: Math.min(a, b), x1: Math.max(a, b), y0: f.y + m.box[2] * ry, y1: f.y + m.box[3] * ry };
  }
  const overlap = (A, B) => A.x0 < B.x1 && A.x1 > B.x0 && A.y0 < B.y1 && A.y1 > B.y0;

  // ------------------------------------------------------------------------------------------- hits --
  function hitDue(f) {
    const m = f.move; if (!m || !m.box) return false;
    if (m.kind === 'proj' || m.kind === 'zone' || m.kind === 'counter' || m.kind === 'reflect' || m.kind === 'tele') return false;
    const s0 = m.su + (m.travel || 0);
    if (!(f.sf > s0 && f.sf <= s0 + m.ac)) return false;
    if (f.hitsLeft <= 0) return false;
    const n = m.hits || 1; if (n === 1) return f.hitN === 0;
    const every = Math.max(1, Math.floor(m.ac / n)), k = f.sf - s0 - 1;
    return k % every === 0 && k / every < n && f.hitN === Math.floor(k / every);
  }
  function resolveHits(E) {
    const pend = [];
    for (let s = 0; s < 2; s++) {
      const a = E.f[s], o = E.f[1 - s];
      if (a.state === 'ko' || !hitDue(a)) continue;
      const hb = hitbox(a); if (!hb) continue;
      if (a.move.grab) { pend.push({ grab: true, a, o, hb }); continue; }
      // a multi-hit move keeps its hit count ticking whether or not it connects
      const multi = (a.move.hits || 1) > 1;
      if (o.state === 'ko' || o.inv > 0 || (o.juggleFull && o.y < GROUND)) { if (multi) { a.hitN++; a.hitsLeft--; } continue; }
      if (!overlap(hb, hurtbox(o))) { if (multi) { a.hitN++; a.hitsLeft--; } continue; }
      pend.push({ a, o, m: a.move });
    }
    for (const h of pend) {                 // both resolve: a trade is a trade
      if (h.grab) { if (h.a.move) tryGrab(E, h.a, h.o, h.hb); continue; }
      const last = h.a.hitN === (h.m.hits || 1) - 1;
      h.a.hitN++; h.a.hitsLeft--;
      hit(E, h.a, h.o, h.m, { last });
    }
  }
  function tryGrab(E, a, o, hb) {
    const m = a.move;
    if (o.state === 'ko' || o.inv > 0 || o.kd > 0) return;
    if (m.grab === 'air') { if (o.y >= GROUND - 20) return; }
    else { if (o.y < GROUND || o.hitstun > 0 || o.blockstun > 0 || o.throwInv > 0) return; }
    if (!overlap(hb, hurtbox(o))) return;
    a.hitN = 1; a.hitsLeft = 0;
    if (m.grab === 'throw') {
      const ob = E.buf[o.side];
      if (E.t - ob.pt.L <= 7 && E.t - ob.pt.M <= 7 && (!o.move || o.mkey === 'THROW')) {           // TECH
        a.vx = -5 * a.face; o.vx = 5 * a.face; endMove(a); a.land = 10; o.blockstun = 10; o.state = 'block';
        E.stats.techs[o.side]++; E.events.push({ k: 'tech', f: o, x: (a.x + o.x) / 2, y: GROUND - 120 }); E.hitstop = 8; return;
      }
    }
    if (o.move) { o.move = null; o.mkey = ''; }
    let dir = a.face;
    if (m.back) { o.x = clamp(a.x - a.face * 70); dir = -a.face; a.face = -a.face; }
    const dmg = Math.round(m.dmg * a.c.dmgk * (a.rage ? 1.25 : 1) * (a.bigT > 0 ? 1.3 : 1));
    applyDamage(E, a, o, dmg, false);
    E.combo[a.side] = 1; E.comboDmg[a.side] = dmg;
    o.state = o.hp > 0 ? 'hitstun' : 'ko'; o.airHit = true; o.kdKind = 'hard'; o.vx = 5.5 * dir; o.vy = m.grab === 'air' ? 6 : -9; o.hitstun = 1; o.juggle = JUGGLE_MAX; o.juggleFull = true;
    if (m.grab === 'air') { a.vy = 4; }
    a.connected = true; a.cancel = false;
    E.meter[a.side] = Math.min(METER_MAX, E.meter[a.side] + 6); E.stats.throws[a.side]++;
    E.hitstop = 14; E.events.push({ k: 'throw', f: o, by: a, name: m.name, x: o.x, y: o.y - 100, dmg });
  }

  function blocking(E, o, a, m, fromX) {
    if (o.state === 'ko' || o.y < GROUND || o.kd > 0 || o.hitstun > 0 || o.dashT > 0) return false;
    if (o.move && !(o.blockstun > 0)) return false;
    const raw = E.buf[o.side].raw || {}, away = fromX > o.x ? raw.l : raw.r;
    if (!away && !(o.blockstun > 0 && (raw.l || raw.r))) return false;
    const crouching = !!raw.d;
    if (m.h === 'low' && !crouching) return false;
    if (m.h === 'ovh' && crouching) return false;
    return true;
  }
  function applyDamage(E, a, o, dmg, chip) {
    if (E.training) dmg = Math.min(dmg, o.hp - 1);
    if (chip && o.hp - dmg <= 0 && !(a && a.move && a.move.isSuper)) dmg = o.hp - 1;
    o.hp = Math.max(0, o.hp - dmg);
    if (o.hp <= 0 && o.state !== 'ko') { o.state = 'ko'; o.move = null; o.mkey = ''; E.events.push({ k: 'ko', f: o, by: a }); }
  }
  function hit(E, a, o, m, info) {
    info = info || {};
    const s = a.side, fromX = info.fromX != null ? info.fromX : a.x, dir = info.dir || (o.x >= fromX ? 1 : -1);
    // X-RAY READ (counter stance): a strike into it is read and punished
    if (o.counterOn && !info.proj && o.move) {
      const cm = o.move; o.move.ac = 0; o.sf = cm.su + 1; o.cancel = false;
      const dmg = Math.round((cm.dmg || 100) * o.c.dmgk);
      applyDamage(E, o, a, dmg, false); E.stats.parries[o.side]++;
      if (a.move) { a.move = null; a.mkey = ''; }
      a.state = a.hp > 0 ? 'hitstun' : 'ko'; a.airHit = true; a.kdKind = 'hard'; a.vy = (cm.counter && cm.counter.launch) || -14; a.vx = 3 * (a.x >= o.x ? 1 : -1); a.hitstun = 1;
      o.face = a.x >= o.x ? 1 : -1;
      E.hitstop = 16; E.events.push({ k: 'parry', f: o, by: a, name: (cm.counter && cm.counter.name) || cm.name, x: a.x, y: a.y - 100, dmg }); return;
    }
    // super armor eats the hit (half damage)
    if (o.armor > 0 && o.move && o.sf <= o.move.su + o.move.ac + (o.move.travel || 0)) {
      o.armor--; applyDamage(E, a, o, Math.round((m.dmg || 0) * 0.5), false);
      if (!info.proj) { a.connected = true; a.cancel = true; }
      E.hitstop = 7; E.events.push({ k: 'armor', f: o, x: o.x, y: o.y - 100 }); return;
    }
    const mult = a.c.dmgk * (a.rage ? 1.25 : 1) * (a.bigT > 0 ? 1.3 : 1);
    if (blocking(E, o, a, m, fromX)) {
      const chip = (m.isSpecial || m.isSuper) ? Math.round((m.dmg || 0) * mult * 0.18) : 0;
      if (chip) applyDamage(E, a, o, chip, true);
      o.state = 'block'; o.blockstun = m.bs || 10; o.vx = (Math.abs(m.push || 3) + 1) * dir;
      if (o.x <= XMIN + 2 || o.x >= XMAX - 2) { if (!info.proj) a.vx = -(Math.abs(m.push || 3) + 1) * dir; }
      E.meter[1 - s] = Math.min(METER_MAX, E.meter[1 - s] + 2); E.meter[s] = Math.min(METER_MAX, E.meter[s] + 1);
      if (!info.proj) { a.connected = true; a.cancel = true; a.blockedLast = true; }
      E.stats.blocks[1 - s]++;
      E.hitstop = 5; E.events.push({ k: 'block', f: o, by: a, x: o.x - dir * 30, y: o.y - 110 * o.c.size, chip });
      return;
    }
    const counter = !!(o.move && o.sf <= o.move.su + o.move.ac && !info.proj);
    const n = ++E.combo[s];
    let scale = n <= 2 ? 1 : Math.max(0.3, 1 - 0.1 * (n - 2));
    if (m.isSuper) scale = Math.max(0.5, scale);
    const dmg = Math.max(1, Math.round((m.dmg || 0) * mult * scale * (counter ? 1.2 : 1)));
    applyDamage(E, a, o, dmg, false); E.comboDmg[s] += dmg; E.stats.hits[s]++;
    if (counter) E.stats.counters[s]++;
    E.meter[s] = Math.min(METER_MAX, E.meter[s] + (m.isSuper ? 0 : Math.round(dmg * 0.045) + 1) * (a.rage ? 1.5 : 1));
    E.meter[1 - s] = Math.min(METER_MAX, E.meter[1 - s] + Math.round(dmg * 0.03));
    if (o.move) { o.move = null; o.mkey = ''; }
    o.armor = 0; o.dashT = 0; o.land = 0;
    const wasAir = o.y < GROUND || o.airHit;
    const hs = (m.hs || 14) + (counter ? 4 : 0);
    const launch = (info.last && (m.lastLaunch || m.launchLast)) || m.launch;
    o.vx = (Math.abs(m.push || 3) * (m.push < 0 ? -1 : 1)) * dir;
    if (m.pull) o.vx = -Math.min(12, Math.max(0, Math.abs(o.x - a.x) - 90) / 4) * dir;
    if (o.x <= XMIN + 2 || o.x >= XMAX - 2) { if (!info.proj && !wasAir) a.vx = -Math.abs(m.push || 3) * 0.9 * dir; }
    if (m.dot) o.dot = Math.max(o.dot, m.dot);
    if (m.slow) o.slow = Math.max(o.slow, m.slow);
    if (wasAir || launch || (m.kd && (info.last || (m.hits || 1) === 1)) || o.state === 'ko') {
      o.juggle += m.isSuper ? 0 : 1;
      if (o.juggle > JUGGLE_MAX) o.juggleFull = true;
      o.airHit = true; o.hitstun = hs;
      if (wasAir && m.spike) { o.vy = m.spike; o.kdKind = 'hard'; }
      else if (launch) { o.vy = launch + Math.min(6, o.juggle * 0.5); E.stats.launch[s]++; }
      else if (m.kd && !wasAir) { o.vy = m.pop || -5; o.kdKind = m.kd; }
      else if (wasAir) { o.vy = Math.min(-3, -7.5 + o.juggle * 0.55); o.vx *= 0.5; }
      if (m.kd === 'hard') o.kdKind = 'hard';
      if (o.state !== 'ko') o.state = 'hitstun';
      if (wasAir) E.stats.airhits[s]++;
    } else { o.state = 'hitstun'; o.hitstun = hs; }
    if (o.hp <= 0) { o.state = 'ko'; o.airHit = true; o.vy = Math.min(o.vy, -8); o.vx = 4 * dir; }
    if (!info.proj) { a.connected = true; a.cancel = true; }
    const lvl = m.isSuper ? 4 : m.tier >= 5 ? 3 : m.tier || 2;
    E.hitstop = Math.max(E.hitstop, lvl >= 4 ? 10 : lvl >= 3 ? 9 : lvl === 2 ? 7 : 5);
    if (o.state === 'ko') E.hitstop = 24;
    E.events.push({ k: 'hit', f: o, by: a, x: o.x - dir * 20, y: o.y - 100 * o.c.size, dmg, lvl, combo: n, counter, name: m.name });
  }

  // ------------------------------------------------------------------------------------------- projectiles / zones --
  function spawnProj(E, f, m) {
    const P = m.proj, n = P.n || 1;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * (P.spread || 0), k = sizeK(f);
      E.projs.push({ side: f.side, owner: f, x: f.x + f.face * 60 * f.c.size * k, y: (P.low ? GROUND - 24 : f.y - 100 * f.c.size * k) - off, vx: P.speed * f.face, vy: P.arc || 0, grav: P.grav || 0,
        life: P.life || 100, w: P.w || 30, h: P.h || 24, m: Object.assign({}, m), hitsLeft: m.hits || 1, every: P.every || 0, cd: 0, beam: !!P.beam, col: P.col, cloud: P.cloud, kdLast: P.kdLast, born: E.t, id: E.t * 4 + i });
    }
    E.events.push({ k: 'shot', f, name: m.name });
  }
  function projBox(p) { return { x0: p.x - p.w / 2, x1: p.x + p.w / 2, y0: p.y - p.h / 2, y1: p.y + p.h / 2 }; }
  function tickProjs(E) {
    for (const p of E.projs) {
      p.x += p.vx; p.y += p.vy; p.vy += p.grav; p.life--; if (p.cd > 0) p.cd--;
      if (p.grav && p.y >= GROUND - 10) { p.life = 0; if (p.cloud) spawnCloud(E, p); continue; }
      const o = E.f[1 - p.side];
      if (o.state === 'ko' || o.inv > 0 || p.cd > 0 || (o.juggleFull && o.y < GROUND)) continue;
      if (!overlap(projBox(p), hurtbox(o))) continue;
      if (o.reflectOn && !p.beam) {                       // NAMOR REDIRECT: caught and sent back faster
        p.side = o.side; p.owner = o; p.vx = -p.vx * 1.25; p.vy = Math.min(0, p.vy); p.grav = 0; p.life = 90; p.m = Object.assign({}, p.m, { dmg: Math.round(p.m.dmg * 1.2) });
        E.stats.parries[o.side]++; E.events.push({ k: 'redirect', f: o, x: p.x, y: p.y }); E.hitstop = 6; continue;
      }
      p.hitsLeft--;
      hit(E, p.owner, o, Object.assign({}, p.m, p.kdLast && p.hitsLeft <= 0 ? { kd: 'hard', launch: -9 } : {}), { proj: true, fromX: p.x - p.vx * 4, dir: p.vx >= 0 ? 1 : -1, last: p.hitsLeft <= 0 });
      if (p.hitsLeft <= 0) { p.life = 0; if (p.cloud) spawnCloud(E, p); } else p.cd = p.every || 6;
    }
    for (let a = 0; a < E.projs.length; a++) for (let b = a + 1; b < E.projs.length; b++) {     // projectiles trade
      const A = E.projs[a], B = E.projs[b];
      if (A.side === B.side || A.life <= 0 || B.life <= 0) continue;
      if (!overlap(projBox(A), projBox(B))) continue;
      if (A.beam && !B.beam) { B.life = 0; continue; } if (B.beam && !A.beam) { A.life = 0; continue; }
      A.life = 0; B.life = 0; E.events.push({ k: 'clash', x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 });
    }
    E.projs = E.projs.filter(p => p.life > 0 && p.x > -60 && p.x < W + 60);
  }
  function spawnCloud(E, p) { const c = p.cloud; E.zones.push({ side: p.side, owner: p.owner, x: clamp(p.x), w: c.w, life: c.life, every: c.every, t: 0, m: Object.assign({}, p.m, { dmg: Math.round(p.m.dmg * 0.25), dot: c.dot, hs: 10 }), pull: 0, col: c.col, tall: 0, cloud: 1 }); }
  function spawnZone(E, f, m) {
    const Z = m.zone, o = E.f[1 - f.side], k = sizeK(f);
    const x = Z.track ? o.x : clamp(f.x + f.face * (Z.at || 0) * k);
    E.zones.push({ side: f.side, owner: f, x, w: Z.w * (Z.w > 200 ? 1 : k), life: Z.life, every: Z.every, t: 0, m: Object.assign({}, m, { hs: Z.hs || m.hs || 14, bs: 8, dot: Z.dot, slow: Z.slow }), pull: Z.pull || 0, col: Z.col, tall: Z.tall, follow: Z.follow, launchLast: Z.launchLast, at: Z.at || 0, maxLife: Z.life });
  }
  function tickZones(E) {
    for (const z of E.zones) {
      z.life--; z.t++;
      if (z.follow) { const f = z.owner; if (f.move && f.move.kind === 'zone') z.x = clamp(f.x + f.face * z.at); }
      const o = E.f[1 - z.side];
      if (o.state === 'ko' || o.inv > 0) continue;
      const box = { x0: z.x - z.w, x1: z.x + z.w, y0: z.tall ? GROUND - 330 : GROUND - 200, y1: GROUND + 5 };
      if (!overlap(box, hurtbox(o))) continue;
      if (z.pull && o.kd <= 0 && !(blocking(E, o, z.owner, z.m, z.x))) o.x = clamp(o.x + Math.sign(z.x - o.x) * Math.min(z.pull, Math.abs(z.x - o.x)));
      if (z.t % z.every === 0 && !(o.juggleFull && o.y < GROUND)) {
        const last = z.life < z.every;
        hit(E, z.owner, o, Object.assign({}, z.m, last && z.launchLast ? { launch: z.launchLast } : { launch: 0 }), { proj: true, fromX: z.x === o.x ? z.owner.x : z.x, last });
      }
    }
    E.zones = E.zones.filter(z => z.life > 0);
  }

  // ------------------------------------------------------------------------------------------- combos / round --
  function comboTrack(E) {
    for (let s = 0; s < 2; s++) {
      const o = E.f[1 - s];
      const inCombo = o.hitstun > 0 || o.airHit || o.state === 'hitstun';
      if (!inCombo && E.combo[s] > 0) {
        if (E.combo[s] >= 2) E.events.push({ k: 'combo', side: s, n: E.combo[s], dmg: E.comboDmg[s] });
        if (E.combo[s] > E.stats.bestCombo[s]) E.stats.bestCombo[s] = E.combo[s];
        E.comboMax[s] = Math.max(E.comboMax[s], E.combo[s]);
        E.lastCombo = { side: s, n: E.combo[s], dmg: E.comboDmg[s] };
        E.combo[s] = 0; E.comboDmg[s] = 0;
      }
    }
  }
  function trainingRefill(E) {
    for (let s = 0; s < 2; s++) {
      const f = E.f[s];
      const idle = !f.move && f.hitstun <= 0 && f.blockstun <= 0 && f.kd <= 0 && !f.airHit && E.combo[1 - s] === 0;
      E.idleT[s] = idle ? E.idleT[s] + 1 : 0;
      if (E.idleT[s] > 50 && f.hp < f.maxhp) f.hp = Math.min(f.maxhp, f.hp + 25);
      if (f.hp <= 0) { f.hp = f.maxhp; f.state = 'stand'; }
      if (E.infMeter) E.meter[s] = METER_MAX;
    }
  }
  function checkOver(E) {
    if (E.training) return;
    const a = E.f[0].hp <= 0, b = E.f[1].hp <= 0;
    if (a || b) { E.over = true; E.winner = a && b ? -1 : a ? 1 : 0; E.how = 'ko'; E.events.push({ k: 'roundover', winner: E.winner, how: 'ko' }); return; }
    if (E.timer <= 0) {
      const pa = E.f[0].hp / E.f[0].maxhp, pb = E.f[1].hp / E.f[1].maxhp;
      E.over = true; E.winner = Math.abs(pa - pb) < 1e-9 ? -1 : pa > pb ? 0 : 1; E.how = 'time';
      E.events.push({ k: 'roundover', winner: E.winner, how: 'time' });
    }
  }

  // ------------------------------------------------------------------------------------------- the match (best of 3) --
  const INTRO = 110, OUTRO = 150;
  function match(opt) {
    opt = opt || {};
    const M = { opt, wins: [0, 0], round: 1, phase: 'intro', pt: 0, E: null, over: false, winner: -1, events: [], history: [], firstTo: opt.firstTo || 2 };
    function newRound() { M.E = create(Object.assign({}, opt, { seed: (opt.seed || 1) + M.round * 7919, meter0: M.E ? M.E.meter[0] : 0, meter1: M.E ? M.E.meter[1] : 0 })); M.phase = opt.training ? 'fight' : 'intro'; M.pt = 0; }
    newRound();
    M.step = (i0, i1) => {
      M.events = [];
      if (M.over) { M.E.step({}, {}); return; }
      M.pt++;
      if (M.phase === 'intro') {
        M.E.step({}, {}); M.E.t--; if (M.E.timer !== Infinity) M.E.timer = opt.time || ROUND_T;   // idle animation only; the clock waits
        if (M.pt === 1) M.events.push({ k: 'round', n: M.round });
        if (M.pt >= INTRO) { M.phase = 'fight'; M.pt = 0; M.events.push({ k: 'fight' }); }
        return;
      }
      if (M.phase === 'fight') {
        M.E.step(i0, i1); M.events = M.E.events.slice();
        if (M.E.over) { M.phase = 'ko'; M.pt = 0; }
        return;
      }
      if (M.phase === 'ko') {
        M.E.step({}, {}); M.events = M.E.events.slice();
        if (M.pt >= OUTRO) {
          const w = M.E.winner;
          if (w >= 0) M.wins[w]++; else { M.wins[0]++; M.wins[1]++; }
          M.history.push({ round: M.round, winner: w, how: M.E.how, hp: [M.E.f[0].hp, M.E.f[1].hp], stats: M.E.stats });
          const done = M.wins[0] >= M.firstTo || M.wins[1] >= M.firstTo || M.round >= 5;
          if (done) {
            M.over = true; M.phase = 'over';
            M.winner = M.wins[0] === M.wins[1] ? -1 : M.wins[0] > M.wins[1] ? 0 : 1;
            M.events.push({ k: 'matchover', winner: M.winner });
          } else { M.round++; newRound(); }
        }
      }
    };
    return M;
  }

  // ------------------------------------------------------------------------------------------- CPU --
  // level 0..3 (EASY · NORMAL · HARD · HARDEST). Seeded from the round's own RNG, so CPU fights replay exactly.
  const LV = [
    { react: 0.12, combo: 0.35, aa: 0.08, spec: 0.010, agg: 0.5, sup: 0.2 },
    { react: 0.32, combo: 0.65, aa: 0.25, spec: 0.016, agg: 0.7, sup: 0.5 },
    { react: 0.55, combo: 0.85, aa: 0.45, spec: 0.022, agg: 0.85, sup: 0.8 },
    { react: 0.78, combo: 0.97, aa: 0.65, spec: 0.028, agg: 1.0, sup: 1.0 },
  ];
  function cpu(E, s, level) {
    const L = LV[Math.max(0, Math.min(3, level == null ? 1 : level))];
    const p = E.f[s], o = E.f[1 - s], r = E.rnd, mem = E.cpuMem[s], inp = {};
    mem.t++;
    if (p.state === 'ko' || E.over) return inp;
    const dx = o.x - p.x, dist = Math.abs(dx), F = dx >= 0 ? 'r' : 'l', B = dx >= 0 ? 'l' : 'r', P = p.face > 0 ? 'r' : 'l', Q = p.face > 0 ? 'l' : 'r';
    if (mem.plan.length) return Object.assign(inp, mem.plan.shift());
    // in blockstun: keep holding the guard
    if (p.blockstun > 0) { inp[B] = true; if (o.move && o.move.h === 'low') inp.d = true; return inp; }
    // confirm into the chain / specials / super / launcher follow-ups
    if (p.move && p.cancel) {
      if (r() > L.combo) return inp;
      const m = p.move, t = m.tier || 0;
      if (p.connected && !p.blockedLast && m.jc && o.airHit && r() < 0.8) { mem.plan = [{ u: true, [F]: true }, {}, {}, {}, {}, {}, {}, { M: true }]; return { u: true }; }
      if (E.meter[s] >= METER_MAX && t >= 3 && t < 9 && r() < L.sup && !p.blockedLast) return { S: true, H: true };
      if (t === 1) return r() < 0.5 ? { M: true } : (p.c.tc && p.c.tc[0] && p.c.tc[0].from.includes(p.mkey) ? { [p.c.tc[0].btn]: true, [P]: p.c.tc[0].dir === 6 } : { M: true });
      if (t === 2) { const tc = (p.c.tc || []).find(x => x.from.includes(p.mkey)); if (tc && r() < 0.5) return { [tc.btn]: true, [P]: tc.dir === 6, d: tc.dir === 3, ...(tc.dir === 3 ? { [P]: true } : {}) };
        return r() < 0.5 ? { H: true, d: !p.blockedLast && r() < 0.5 } : { H: true }; }
      if (t === 3 && t < 5) { mem.plan = specialPlan(p, r, P, Q, o); return mem.plan.shift(); }
      return inp;
    }
    // juggle: chase an airborne opponent with air normals after a super jump
    if (p.y < GROUND && p.sj && !p.move) { if (Math.abs(o.y - p.y) < 120 && dist < 140) return { [r() < 0.5 ? 'M' : 'L']: true }; return inp; }
    if (p.y < GROUND && !p.move && dist < 150 && o.y >= GROUND - 10 && p.vy > 0 && r() < 0.3) return { H: true };
    if (!actionable(p)) return inp;
    // defend on a read
    const threat = (o.move && o.sf <= o.move.su + o.move.ac + 2 && dist < 300) || E.projs.some(q => q.side !== s && Math.abs(q.x - p.x) < 220 && Math.sign(q.vx) === Math.sign(p.x - q.x));
    if (threat && r() < L.react * 0.45) {           // read it: X-RAY a strike, REDIRECT a shot
      const ctr = p.c.specials.find(x => x.kind === 'counter'), ref = p.c.specials.find(x => x.kind === 'reflect');
      const shot = E.projs.some(q => q.side !== s && Math.abs(q.x - p.x) < 260);
      if (ctr && o.move && o.move.box && !o.move.kind && dist < 220) { mem.plan = motionPlan(ctr.motion, P, Q, 'L'); return mem.plan.shift(); }
      if (ref && shot) { mem.plan = motionPlan(ref.motion, P, Q, 'L'); return mem.plan.shift(); }
    }
    if (threat && r() < L.react) {
      const low = o.move && o.move.h === 'low', ovh = o.move && o.move.h === 'ovh';
      const g = { [B]: true, d: low && !ovh };
      mem.plan = Array.from({ length: 8 }, () => Object.assign({}, g)); return g;
    }
    // anti-air
    if (o.y < GROUND - 60 && o.vy > -2 && dist < 200 && r() < L.aa) {
      const dp = p.c.specials.find(x => x.motion === '623');
      if (dp && r() < 0.6) { mem.plan = [{ [P]: true }, { d: true }, { d: true, [P]: true, H: true }]; return {}; }
      return { d: true, H: true };
    }
    // neutral
    if (dist > 300) {
      const pr = p.c.specials.find(x => x.kind === 'proj' || (x.kind === 'zone' && (x.zone.at || 0) > 150));
      if (pr && r() < L.spec * 3) { mem.plan = motionPlan(pr.motion, P, Q, r() < 0.5 ? 'M' : 'H'); return mem.plan.shift(); }
      if (r() < 0.02 * L.agg) { mem.plan = [{ [F]: true }, {}, { [F]: true }]; return {}; }      // dash in
      if (r() < 0.01 * L.agg) return { u: true, [F]: true };
      return r() < 0.85 * L.agg ? { [F]: true } : {};
    }
    if (dist > 160) {
      const roll = r();
      if (roll < 0.05 * L.agg) return { M: true };
      if (roll < 0.07) return { d: true, M: true };
      if (roll < 0.07 + L.spec) { const sp = p.c.specials[(r() * p.c.specials.length) | 0]; if (sp.kind !== 'counter' && sp.kind !== 'reflect') { mem.plan = motionPlan(sp.motion, P, Q, 'M'); return mem.plan.shift(); } }
      if (roll < 0.10) return { u: true, [F]: true };
      return r() < 0.8 * L.agg ? { [F]: true } : { [B]: r() < 0.4 };
    }
    const roll = r();
    if (roll < 0.14 * L.agg) return { L: true, d: r() < 0.4 };
    if (roll < 0.22 * L.agg) return { M: true, d: r() < 0.3 };
    if (roll < 0.25) return { d: true, [P]: true, H: true };                 // sweep
    if (roll < 0.27 && o.blockstun <= 0) return { L: true, M: true };      // throw
    if (roll < 0.29) { const sp = p.c.specials[(r() * p.c.specials.length) | 0]; mem.plan = motionPlan(sp.motion, P, Q, 'L'); return mem.plan.shift(); }
    if (roll < 0.33) { mem.plan = Array.from({ length: 10 }, () => ({ [B]: true, d: r() < 0.5 })); return {}; }
    if (roll < 0.35) return { u: true, [F]: true };
    return {};
  }
  function motionPlan(mo, P, Q, btn) {
    switch (mo) {
      case '236': return [{ d: true }, { d: true, [P]: true }, { [P]: true, [btn]: true }];
      case '214': return [{ d: true }, { d: true, [Q]: true }, { [Q]: true, [btn]: true }];
      case '623': return [{ [P]: true }, { d: true }, { d: true, [P]: true, [btn]: true }];
      case '[4]6': return Array.from({ length: CHARGE + 2 }, () => ({ [Q]: true })).concat([{ [P]: true, [btn]: true }]);
      case '[2]8': return Array.from({ length: CHARGE + 2 }, () => ({ d: true })).concat([{ u: true, [btn]: true }]);
    }
    return [{ S: true }];
  }
  // a cancel needs the move out within the buffer, so charge specials ride the S shortcut out of a chain
  function specialPlan(p, r, P, Q, o) {
    const pool = p.c.specials.filter(x => x.kind !== 'counter' && x.kind !== 'reflect' && x.kind !== 'tele' && !(x.kind === 'grab'));
    const sp = pool[(r() * pool.length) | 0] || p.c.specials[0];
    if (sp.motion[0] === '[') { const dd = sp.short === 6 ? { [P]: true } : sp.short === 4 ? { [Q]: true } : sp.short === 2 ? { d: true } : sp.short === 8 ? { u: true } : {}; return [Object.assign({ S: true }, dd)]; }
    return motionPlan(sp.motion, P, Q, 'H');
  }

  // training dummy behaviours
  function dummy(E, s, mode) {
    const p = E.f[s], o = E.f[1 - s], B = o.x >= p.x ? 'l' : 'r';
    if (mode === 'crouch') return { d: true };
    if (mode === 'jump') return { u: (E.t % 50) === 0 };
    if (mode === 'block') {
      const m = o.move, low = m && m.h === 'low';
      const close = Math.abs(o.x - p.x) < 420 || E.projs.length || E.zones.length;
      return close ? { [B]: true, d: !!low && !(m && m.h === 'ovh') } : {};
    }
    if (mode === 'cpu') return cpu(E, s, 1);
    return {};
  }

  // ------------------------------------------------------------------------------------------- move list --
  const MOTION_TXT = { '236': '↓↘→', '214': '↓↙←', '623': '→↓↘', '[4]6': '[←] →', '[2]8': '[↓] ↑' };
  const SHORT_TXT = { 6: '→+SP', 4: '←+SP', 2: '↓+SP', 5: 'SP', 8: '↑+SP' };
  const BTN_TXT = { L: 'L', M: 'M', H: 'H' };
  const DIR_TXT = { 6: '→', 3: '↘', null: '' };
  function frameData(m) {
    const tot = m.su + (m.travel || 0) + m.ac + m.rc, strike = m.bs && m.box && !m.grab && !/^(proj|zone|counter|reflect|tele)$/.test(m.kind || '');
    const per = (m.hits || 1) > 1 ? Math.floor(m.ac / m.hits) * (m.hits - 1) : 0;     // advantage after the LAST hit of a multi-hit
    return { su: m.su + (m.travel || 0) + 1, ac: m.ac, rc: m.rc, tot, onBlock: strike ? m.bs - (m.ac - per + m.rc) + 1 : null }; }
  function movelist(id) {
    const c = CHARS[id], rows = [];
    const sp = c.specials.map(m => ({ group: 'SPECIAL', name: m.name, input: MOTION_TXT[m.motion] + ' + L/M/H', alt: SHORT_TXT[m.short], kind: m.kind || 'strike', dmg: m.dmg ? m.dmg * (m.hits || 1) : 0, fd: frameData(m), note: noteOf(m), joe: m.joe }));
    rows.push(...sp);
    const su = c.super; rows.push({ group: 'SUPER', name: su.name, input: '↓↘→↓↘→ + any', alt: 'SP+H', kind: su.kind || 'strike', dmg: su.dmg * (su.hits || 1), fd: frameData(su), note: noteOf(su) + ' · costs the full meter', joe: su.joe });
    for (const t of c.tc || []) rows.push({ group: 'TARGET COMBO', name: t.name, input: t.from.map(k => k[0] === 'T' ? ((c.tc.find(x => x.key === k) || {}).name || k) : k).join(' / ') + ' → ' + (DIR_TXT[t.dir] || '') + BTN_TXT[t.btn], alt: '', kind: 'strike', dmg: t.dmg * (t.hits || 1), fd: frameData(t), note: t.h === 'ovh' ? 'overhead' : t.h === 'low' ? 'low' : '' });
    for (const k of ['5L', '5M', '5H', '2L', '2M', '2H', '3H', 'jL', 'jM', 'jH']) {
      const m = NORMALS[k]; rows.push({ group: 'NORMAL', name: m.name, input: k.replace('5', '').replace('2', '↓').replace('3', '↘').replace('j', 'air '), alt: '', kind: 'strike', dmg: m.dmg, fd: frameData(m), note: k === '2H' ? 'launches · ↑ to super jump' : k === '3H' ? 'low · knockdown' : m.h === 'low' ? 'low' : m.h === 'ovh' ? 'overhead' : (k === '5H' && c.armorH ? '1-hit armor' : '') });
    }
    rows.push({ group: 'SYSTEM', name: 'THROW', input: 'L+M (close)', alt: '←+L+M = back throw', kind: 'grab', dmg: NORMALS.THROW.dmg, fd: frameData(NORMALS.THROW), note: 'tech: L+M as you are grabbed' });
    return rows;
  }
  function noteOf(m) {
    const n = [];
    if (m.kind === 'proj') n.push(m.proj.beam ? 'beam' : m.proj.arc ? 'arcing shot' : 'projectile'); if (m.kind === 'zone') n.push(m.zone.track ? 'erupts under them' : 'area'); if (m.kind === 'grab') n.push(m.grab === 'air' ? 'anti-air grab' : 'command grab (unblockable)');
    if (m.kind === 'counter') n.push('counter stance'); if (m.kind === 'reflect') n.push('reflects projectiles'); if (m.kind === 'tele') n.push('teleport · L front / M behind / H above'); if (m.kind === 'burrow') n.push('invulnerable burrow');
    if (m.kind === 'buff') n.push('grows ×2 for 10 s'); if (m.inv) n.push('invulnerable start'); if (m.armor) n.push(m.armor + '-hit armor'); if (m.launch || m.lastLaunch || (m.zone && m.zone.launchLast)) n.push('launches');
    if (m.kd === 'hard') n.push('hard knockdown'); if (m.selfDmg) n.push('burns herself ' + m.selfDmg); if (m.dot || (m.zone && m.zone.dot) || (m.proj && m.proj.cloud)) n.push('poison'); if (m.zone && m.zone.pull) n.push('pulls'); if (m.pull) n.push('pulls in'); if (m.h === 'ovh') n.push('overhead'); if (m.h === 'low') n.push('low');
    return n.join(' · ');
  }

  function hash(E) {
    let h = 2166136261 >>> 0;
    const mix = v => { h ^= (Math.round(v * 100) | 0); h = Math.imul(h, 16777619) >>> 0; };
    mix(E.t); mix(E.timer === Infinity ? -1 : E.timer); mix(E.meter[0]); mix(E.meter[1]); mix(E.projs.length); mix(E.zones.length); mix(E.combo[0]); mix(E.combo[1]);
    for (const f of E.f) { mix(f.x); mix(f.y); mix(f.vx); mix(f.vy); mix(f.hp); mix(f.sf); mix(f.hitstun); mix(f.blockstun); mix(f.kd); mix(f.juggle); mix(f.bigT); }
    for (const p of E.projs) { mix(p.x); mix(p.y); }
    return h.toString(16);
  }

  return { create, match, cpu, dummy, movelist, frameData, hurtbox, hitbox, projBox, actionable, relDir, CHARS, NORMALS, ROSTER, LADDER, STAGES,
    W, GROUND, XMIN, XMAX, ROUND_T, METER_MAX, JUGGLE_MAX, CHARGE, INTRO, OUTRO };
});

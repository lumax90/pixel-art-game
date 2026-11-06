// The tile groups. Each group has its own ramp and its own set of 16 x 16 variants, but all ramps lean to the same cool shadow
// and warm light, which is what makes the groups sit together. A variant only marks the inside of a tile and leaves its
// edges alone, so any two variants of a group can lie side by side. To add a group, add an entry to GROUPS.
import { Rng, hex } from "../../vendor/pixelfx/src/core/index.js";

export const TILE = 16;

const ramp = (list) => list.map(hex);

/** Marks on a tile: `0` is nothing, anything else is a color. Marks stay 2 px clear of the edge. */
function createVariant(paint) {
  const pixels = new Uint32Array(TILE * TILE);
  paint((x, y, color) => {
    if (x >= 2 && y >= 2 && x < TILE - 2 && y < TILE - 2) pixels[y * TILE + x] = color;
  });
  return pixels;
}

function tuft(put, x, y, C, tall) {
  put(x, y + 1, C[1]);
  put(x, y, C[3]);
  put(x - 1, y, C[2]);
  put(x + 1, y, C[2]);
  put(x - 1, y - 1, C[3]);
  put(x + 1, y - 1, C[4]);
  if (tall) {
    put(x, y - 1, C[3]);
    put(x, y - 2, C[4]);
  }
}

function flower(put, x, y, petal, heart, C) {
  put(x, y + 1, C[1]);
  put(x, y - 1, petal);
  put(x - 1, y, petal);
  put(x + 1, y, petal);
  put(x, y + 1, petal);
  put(x, y, heart);
}

function pebble(put, x, y, C, wide) {
  put(x, y, C[4]);
  if (wide) put(x + 1, y, C[3]);
  put(x, y + 1, C[1]);
  if (wide) put(x + 1, y + 1, C[1]);
}

function crack(put, rng, x, y, length, color) {
  for (let n = 0; n < length; n++) {
    put(x, y, color);
    x += 1;
    y += rng.int(-1, 1);
  }
}

const spot = (rng) => [rng.int(3, TILE - 4), rng.int(3, TILE - 4)];

const GRASS = ramp(["#1f3d33", "#2b5a39", "#3f7a3e", "#5f9a44", "#93bd56"]);
const DIRT = ramp(["#3b2b30", "#5a4034", "#7a5a40", "#9a7a54", "#bd9f70"]);
const STONE = ramp(["#2a2b38", "#454753", "#666871", "#918f8c", "#bcb9a8"]); // cool in the shade, warm in the light
export const WATER = ramp(["#12304f", "#174a6e", "#1f6a8c", "#3a96a8", "#8fd6d0", "#e6fff0"]);
const PETALS = ramp(["#f0eee0", "#f2d868", "#e88aa8", "#a8c0f0"]);
export const CRAG = ramp(["#23262f", "#3c404b", "#5b606a", "#848780", "#aeac98"]);
const SCREE = ramp(["#2c2a30", "#4a4648", "#6a6460", "#8e887c", "#b4ac98"]);
const MOSS = ramp(["#2a3a2a", "#46583a", "#6a7a42", "#8f9a50", "#bcc06c"]);
const SNOW = ramp(["#5a6c8c", "#8a9cbc", "#b8c8dc", "#dce6f0", "#ffffff"]);
const ICE = ramp(["#1c3e5c", "#2e6c8c", "#5ca4bc", "#9cd4dc", "#e4f8f8"]);
const LICHEN = ramp(["#8a9a50", "#c4a848"]);

function grassVariants() {
  const rng = new Rng(41), list = [];
  for (let n = 0; n < 5; n++) list.push({ kind: "plain", pixels: createVariant(() => {}) });
  for (let n = 0; n < 8; n++)
    list.push({
      kind: "tufts",
      pixels: createVariant((put) => {
        const count = 1 + n % 3;
        for (let k = 0; k < count; k++) tuft(put, ...spot(rng), GRASS, rng.chance(0.4));
      }),
    });
  for (let n = 0; n < 6; n++)
    list.push({
      kind: "flowers",
      pixels: createVariant((put) => {
        const petal = PETALS[n % PETALS.length], count = 1 + n % 3;
        for (let k = 0; k < count; k++) flower(put, ...spot(rng), petal, PETALS[1], GRASS);
        tuft(put, ...spot(rng), GRASS, false);
      }),
    });
  return list;
}

function dirtVariants() {
  const rng = new Rng(43), list = [];
  for (let n = 0; n < 5; n++) list.push({ kind: "plain", pixels: createVariant(() => {}) });
  for (let n = 0; n < 7; n++)
    list.push({
      kind: "pebbles",
      pixels: createVariant((put) => {
        for (let k = 0; k <= n % 3; k++) pebble(put, ...spot(rng), DIRT, rng.chance(0.5));
      }),
    });
  for (let n = 0; n < 5; n++)
    list.push({
      kind: "cracks",
      pixels: createVariant((put) => {
        const [x, y] = spot(rng);
        crack(put, rng, Math.min(x, 6), y, rng.int(4, 8), DIRT[1]);
      }),
    });
  return list;
}

function stoneVariants() {
  const rng = new Rng(47), list = [];
  for (let n = 0; n < 6; n++) list.push({ kind: "plain", pixels: createVariant(() => {}) });
  for (let n = 0; n < 6; n++)
    list.push({
      kind: "worn",
      pixels: createVariant((put) => {
        const [x, y] = spot(rng);
        crack(put, rng, Math.min(x, 6), y, rng.int(3, 7), STONE[0]);
        if (n % 2) pebble(put, ...spot(rng), STONE, false);
      }),
    });
  return list;
}

/** A stone lying loose, bigger than a pebble: lit on top, in shade at its foot. */
function boulder(put, x, y, C) {
  for (const [dx, dy, tone] of [[0, -1, 4], [1, -1, 3], [-1, 0, 3], [0, 0, 3], [1, 0, 2], [2, 0, 2], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [2, 1, 0]]) put(x + dx, y + dy, C[tone]);
}

function cragVariants() {
  const rng = new Rng(53), list = [];
  for (let n = 0; n < 6; n++) list.push({ kind: "plain", pixels: createVariant(() => {}) });
  for (let n = 0; n < 6; n++)
    list.push({
      kind: "cracks",
      pixels: createVariant((put) => {
        const [x, y] = spot(rng);
        crack(put, rng, Math.min(x, 5), y, rng.int(4, 9), CRAG[0]);
      }),
    });
  for (let n = 0; n < 5; n++)
    list.push({
      kind: "worn",
      pixels: createVariant((put) => {
        const [x, y] = spot(rng), tone = LICHEN[n % 2];
        for (const [dx, dy] of [[0, 0], [1, 0], [-1, 1], [0, 1], [1, 1], [2, 1]]) if (rng.chance(0.8)) put(x + dx, y + dy, tone);
      }),
    });
  for (let n = 0; n < 4; n++) list.push({ kind: "pebbles", pixels: createVariant((put) => boulder(put, ...spot(rng), CRAG)) });
  return list;
}

function screeVariants() {
  const rng = new Rng(59), list = [];
  for (let n = 0; n < 3; n++) list.push({ kind: "plain", pixels: createVariant(() => {}) });
  for (let n = 0; n < 8; n++)
    list.push({
      kind: "pebbles",
      pixels: createVariant((put) => {
        for (let k = 0; k < 3 + n % 4; k++) pebble(put, ...spot(rng), SCREE, rng.chance(0.6));
      }),
    });
  for (let n = 0; n < 6; n++)
    list.push({
      kind: "worn",
      pixels: createVariant((put) => {
        boulder(put, ...spot(rng), SCREE);
        pebble(put, ...spot(rng), SCREE, true);
        pebble(put, ...spot(rng), SCREE, false);
      }),
    });
  return list;
}

function mossVariants() {
  const rng = new Rng(61), list = [];
  for (let n = 0; n < 5; n++) list.push({ kind: "plain", pixels: createVariant(() => {}) });
  for (let n = 0; n < 8; n++)
    list.push({
      kind: "tufts",
      pixels: createVariant((put) => {
        // cushions of moss, low and round: nothing on a mountain stands tall
        for (let k = 0; k <= n % 3; k++) {
          const [x, y] = spot(rng);
          for (const [dx, dy, tone] of [[-1, 1, 1], [0, 1, 1], [1, 1, 1], [-1, 0, 3], [0, 0, 3], [1, 0, 2], [0, -1, 4]]) put(x + dx, y + dy, MOSS[tone]);
        }
      }),
    });
  for (let n = 0; n < 4; n++)
    list.push({
      kind: "flowers",
      pixels: createVariant((put) => {
        for (let k = 0; k < 2 + n % 3; k++) {
          const [x, y] = spot(rng);
          put(x, y, PETALS[n % 2 ? 3 : 0]);
          put(x, y + 1, MOSS[1]);
        }
      }),
    });
  return list;
}

function snowVariants() {
  const rng = new Rng(67), list = [];
  for (let n = 0; n < 8; n++) list.push({ kind: "plain", pixels: createVariant(() => {}) });
  for (let n = 0; n < 6; n++)
    list.push({
      kind: "worn",
      pixels: createVariant((put) => {
        // a scoop the wind cut: a blue shadow under a bright lip
        const [x, y] = spot(rng), long = rng.int(3, 6), left = Math.min(x, 7);
        for (let k = 0; k < long; k++) {
          put(left + k, y, SNOW[4]);
          put(left + k, y + 1, SNOW[k === 0 || k === long - 1 ? 2 : 1]);
        }
      }),
    });
  for (let n = 0; n < 4; n++)
    list.push({
      kind: "pebbles",
      pixels: createVariant((put) => {
        // rock showing through
        const [x, y] = spot(rng);
        for (const [dx, dy, tone] of [[0, 0, 1], [1, 0, 2], [0, 1, 0], [1, 1, 1], [2, 1, 0]]) put(x + dx, y + dy, CRAG[tone]);
        put(x, y - 1, SNOW[4]);
        put(x + 1, y - 1, SNOW[4]);
      }),
    });
  return list;
}

function iceVariants() {
  const rng = new Rng(71), list = [];
  for (let n = 0; n < 7; n++) list.push({ kind: "plain", pixels: createVariant(() => {}) });
  for (let n = 0; n < 6; n++)
    list.push({
      kind: "cracks",
      pixels: createVariant((put) => {
        const [x, y] = spot(rng);
        crack(put, rng, Math.min(x, 6), y, rng.int(4, 8), ICE[n % 2]);
      }),
    });
  return list;
}

/**
 * Lowest first: a group higher in the list lies over the ones below it where they meet. `tones` are the three close colors
 * large soft patches of ground take; the ramp is for what stands out. `wander` is how far its border strays: laid stone keeps
 * a straighter line than grass. `rim` colors the edge of a group lying over another. `debris` is what a blow throws up from it.
 * `surface` names how its ground is painted when it's more than soft patches. `mountain`: a cliff under it is grey mountain rock, not earth.
 */
export const GROUPS = [
  { id: "water", name: "Su", char: "~", ramp: WATER, active: true, debris: "#2c4a78", variants: [] },
  { id: "dirt", name: "Toprak", char: ".", ramp: DIRT, debris: "#5e4430", tones: ramp(["#75563f", "#7f5f45", "#8a6a4c"]), variants: dirtVariants() },
  { id: "scree", mountain: true, name: "Moloz", char: "s", ramp: SCREE, debris: "#6a6460", tones: ramp(["#635e5a", "#6c6762", "#76706a"]), variants: screeVariants() },
  { id: "crag", mountain: true, name: "Kaya", char: "r", ramp: CRAG, debris: "#5b606a", tones: ramp(["#4f535d", "#595d66", "#646870"]), surface: "crag", wander: 0.8, variants: cragVariants() },
  { id: "stone", name: "Taş", char: "#", ramp: STONE, debris: "#5f6170", tones: ramp(["#5a5c68", "#646672", "#6f7078"]), laid: true, wander: 0.4, variants: stoneVariants() },
  { id: "moss", mountain: true, name: "Dağ çayırı", char: "m", ramp: MOSS, debris: "#4a4230", tones: ramp(["#67763f", "#717f45", "#7c894c"]), rim: true, variants: mossVariants() },
  { id: "grass", name: "Çim", char: ",", ramp: GRASS, debris: "#4d3b28", tones: ramp(["#427e3f", "#498842", "#519346"]), rim: true, grows: true, variants: grassVariants() },
  { id: "ice", mountain: true, name: "Buzul", char: "i", ramp: ICE, debris: "#9cd4dc", tones: ramp(["#7cbccc", "#8ccad6", "#9cd6de"]), surface: "ice", variants: iceVariants() },
  { id: "snow", mountain: true, name: "Kar", char: "*", ramp: SNOW, debris: "#dce6f0", tones: ramp(["#c4d2e4", "#d6e0ec", "#e6ecf4"]), surface: "snow", rim: true, variants: snowVariants() },
];

const shades = (rows) => rows.map(ramp);

/**
 * The kinds of living grass. Which one grows where follows large patches of noise, so a seed lays them out its own way.
 * moisture: the wettest and driest ground it grows on, 0 to 1: near water it's wet, far from it dry, and hollows differ.
 * shades: root to tip, in three variations. tall, short: px high, where it's lush and where it's thin. blades, spread: how many
 * to a tuft and how wide. stems: px thick. fan: how far blades lean out from the middle of the tuft. give: how much the
 * wind and the walker bend it. head: a pale seed head on each tip.
 */
export const GRASSES = [
  {
    name: "Çayır otu",
    moisture: [0.38, 0.66],
    shades: [[GRASS[1], GRASS[2], GRASS[3]], [GRASS[1], GRASS[3], GRASS[3]], [GRASS[2], GRASS[3], GRASS[4]]],
    tall: [8, 15], short: [4, 8], blades: [4, 8], spread: 7, stems: 1, fan: 0, give: 1,
  },
  {
    name: "Altın başak",
    moisture: [0, 0.38],
    shades: shades([["#4d5a2c", "#8c8a3a", "#c9b45c"], ["#5a5a2a", "#a39440", "#d8c46c"], ["#44522a", "#7c8236", "#b8a852"]]),
    tall: [13, 21], short: [7, 11], blades: [3, 6], spread: 9, stems: 1, fan: 0.35, give: 1.3, head: hex("#efe0a0"),
  },
  {
    name: "Koyu eğrelti",
    moisture: [0.66, 1],
    shades: shades([["#123a36", "#1c5a4c", "#2f8060"], ["#143f3a", "#226451", "#3a8e68"], ["#10332f", "#194f45", "#2a7458"]]),
    tall: [7, 11], short: [5, 8], blades: [5, 8], spread: 11, stems: 2, fan: 1.1, give: 0.7,
  },
];

/** The earth showing where land stops at water. */
export const BANK = [DIRT[0], DIRT[1], DIRT[2]];
/** The rock a cliff is made of. */
export const ROCK = ramp(["#231d24", "#3d3138", "#5a4a48", "#7a6658", "#9c8a70"]);

/** The ground under water, from the shallows out. */
export const BED = ramp(["#7d7558", "#5f6a58", "#3f5a5a", "#274660", "#142c4c"]); // the lake bed, from just under the surface to deep
export const BED_WEED = ramp(["#2c4a3a", "#3a5f42"]);
export const BED_STONE = ramp(["#2a3440", "#566260"]);

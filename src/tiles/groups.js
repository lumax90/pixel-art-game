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

/**
 * Lowest first: a group higher in the list lies over the ones below it where they meet. `tones` are the three close colors
 * large soft patches of ground take; the ramp is for what stands out. `wander` is how far its border strays: laid stone keeps
 * a straighter line than grass. `rim` colors the edge of a group lying over another. `debris` is what a blow throws up from it.
 */
export const GROUPS = [
  { id: "water", name: "Su", char: "~", ramp: WATER, active: true, debris: "#2c4a78", variants: [] },
  { id: "dirt", name: "Toprak", char: ".", ramp: DIRT, debris: "#5e4430", tones: ramp(["#75563f", "#7f5f45", "#8a6a4c"]), variants: dirtVariants() },
  { id: "stone", name: "Taş", char: "#", ramp: STONE, debris: "#5f6170", tones: ramp(["#5a5c68", "#646672", "#6f7078"]), laid: true, wander: 0.4, variants: stoneVariants() },
  { id: "grass", name: "Çim", char: ",", ramp: GRASS, debris: "#4d3b28", tones: ramp(["#427e3f", "#498842", "#519346"]), rim: true, grows: true, variants: grassVariants() },
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
export const BED = ramp(["#6f6a4e", "#3f5a5a", "#142c4c"]);

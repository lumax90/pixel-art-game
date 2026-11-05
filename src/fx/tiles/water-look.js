// What the water looks like, for the shader that draws it and the worker that draws what touches it.
import { clamp, fbm, hex, rand, tileFbm } from "../../../vendor/pixelfx/src/core/index.js";
import { WATER as PACKAGE_WATER } from "../../../vendor/pixelfx/src/fx/water/_lib.js";

const DEEP_COLOR = "#0e2552";
const tone = (color) => hex(color) >>> 0; // unsigned, as they are in the typed arrays below
export const C = PACKAGE_WATER.map(tone);
export const DEEP = tone(DEEP_COLOR);
export const TONES = [DEEP, C[1], C[2], C[3], C[4], C[5]]; // dark to light, for moving a pixel up or down as the water rises and falls
/** The red, green and blue of a tone. */
export const RGB = new Map([...PACKAGE_WATER, DEEP_COLOR].map((color) => [tone(color), [1, 3, 5].map((at) => parseInt(color.slice(at, at + 2), 16))]));
/** The colours of light on the water, by what they do there. */
export const CREST_RGB = [3, 4, 6].map((step) => RGB.get(C[step]));
export const LIT_RGB = [2, 3, 4].map((step) => RGB.get(C[step]));

export const SIZE = 256; // px across the noise the water is made from
export const FRAMES_A_SECOND = 8;
export const CREST_DRIFT = 1.4, WINDY_DRIFT = 5; // px a second
export const CREST_WIDTH = 0.57, WINDY_WIDTH = -0.07; // how high the swell has to be to catch the light
export const LIGHT_BEND = 6; // px the light lines wander
export const LIGHT_DRIFT = 0.6; // px a second

const SHALLOWS = 5, COAST = 13, MIDDLE = 30; // px from the shore where the water steps down a tone
const SKY_SHARE = 0.26; // of the water, from the far side, that holds the sky
const CLEAR_DEPTH = 24; // px deep where the water stops being see-through
const CLEAREST = 0.42; // how much of the colour there is where it's shallowest
const LIGHT_CELL = 19; // px across a cell of the light bending through the shallows

export function createSwell(seed) {
  const values = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) values[y * SIZE + x] = tileFbm(x / 16, y / 8, 16, 32, seed, 2) * 0.5 + 0.5;
  return values;
}

/** Thin lines between cells, like the light a rippling surface throws on what's under it. */
export function createLightLines(seed) {
  const cells = Math.floor(SIZE / LIGHT_CELL), span = cells * LIGHT_CELL, points = [], lines = new Uint8Array(SIZE * SIZE);
  for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) points.push([(x + rand(x, y, seed)) * LIGHT_CELL, (y + rand(x, y, seed + 1)) * LIGHT_CELL]);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const cx = Math.floor(x / LIGHT_CELL), cy = Math.floor(y / LIGHT_CELL);
      let near = 1e9, next = 1e9;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const [px, py] = points[((cy + dy + cells) % cells) * cells + ((cx + dx + cells) % cells)], ox = Math.abs(x - px), oy = Math.abs(y - py);
          const d = Math.hypot(Math.min(ox, span - ox), Math.min(oy, span - oy));
          if (d < near) {
            next = near;
            near = d;
          } else if (d < next) next = d;
        }
      lines[y * SIZE + x] = next - near < 1.25 ? 1 : 0;
    }
  return lines;
}

/** What never changes about each pixel of `list` (x, y, depth): its tone, its share of colour over the bed, its edge, and the tone of the light in it. */
export function lookOfWater(list, seed) {
  const count = list.length / 3, wet = new Set(), north = new Map(), south = new Map();
  for (let n = 0; n < count; n++) {
    const x = list[n * 3], y = list[n * 3 + 1];
    wet.add(y * 4096 + x);
    north.set(x, Math.min(north.get(x) ?? y, y));
    south.set(x, Math.max(south.get(x) ?? y, y));
  }
  const base = new Uint32Array(count), alpha = new Float32Array(count), rim = new Uint8Array(count), lit = new Uint32Array(count);
  for (let n = 0; n < count; n++) {
    const x = list[n * 3], y = list[n * 3 + 1], shore = list[n * 3 + 2], reach = south.get(x) - north.get(x) || 1, far = (y - north.get(x)) / reach, wander = fbm(x / 34, y / 14, seed + 4, 3) * 0.2;
    const edgeWander = shore + wander * 22;
    base[n] = edgeWander < SHALLOWS ? C[3] : far + wander < SKY_SHARE || edgeWander < COAST ? C[2] : edgeWander < MIDDLE ? C[1] : DEEP;
    alpha[n] = clamp(CLEAREST + (shore / CLEAR_DEPTH) * (1 - CLEAREST), 0, 1);
    rim[n] = wet.has((y - 1) * 4096 + x) ? (shore <= 1 ? 2 : 0) : 1;
    // light bends through thin water only: the deep stays plain
    lit[n] = edgeWander < SHALLOWS ? C[4] : edgeWander < COAST ? C[3] : edgeWander < COAST + 6 ? C[2] : 0;
  }
  return { base, alpha, rim, lit };
}

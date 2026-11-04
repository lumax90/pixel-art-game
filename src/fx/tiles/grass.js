// The living grass: every blade leans with the wind, and bends away from whoever walks through it, then springs back and
// shivers to a stop. The effect stands where the walker is. Blades behind him go on the back picture and the few in front of
// him on the front one, so he wades through it rather than walks on top of it.
import { GRASSES } from "../../tiles/groups.js";
import { air, gustAt } from "../lib/air.js";

export const meta = {
  name: "Grass",
  desc: "Blades of grass that sway in gusts of wind and part round whoever walks through them.",
  tags: ["grass", "tile", "ambient", "loop"],
  size: [960, 540],
  origin: [0, 0],
  duration: 1000,
  loop: true,
  fps: 30,
  options: { blades: null },
};

const STRIDE = 7; // numbers per blade
const STEP = 1 / 30;
const REACH = 24; // px from the walker that blades feel him
const PUSH = 1.5;
const SPRING = 0.3;
const DAMP = 0.26;
const FRONT_WIDE = 30, FRONT_DEEP = 18; // how far in front of his feet a blade can stand and still cross him
const GUST_CELL = 32; // px of grass that share a gust: the wind is worked out per patch, not per blade
const GUST_BITS = 5;
const BLOWN = 0.95; // how far full wind lays a blade over
const STILL_AIR = 0.05;
const SHIVER = 0.04, WINDY_SHIVER = 0.13;
const WAVES = 256; // a table of one sine wave, so each blade's flutter is a lookup
const WAVE = Float32Array.from({ length: WAVES }, (_, i) => Math.sin((i / WAVES) * Math.PI * 2));

export function create(o) {
  const list = o.blades, count = list.length / STRIDE, bend = new Float32Array(count), speed = new Float32Array(count), wind = new Float32Array(count);
  const span = (index) => list.reduce((most, value, i) => (i % STRIDE === index ? Math.max(most, value) : most), 0);
  const cols = (span(0) >> GUST_BITS) + 1, rows = (span(1) >> GUST_BITS) + 1, gusts = new Float32Array(cols * rows);
  const flutter = Uint8Array.from({ length: count }, (_, n) => ((list[n * STRIDE + 4] / (Math.PI * 2)) * WAVES) & (WAVES - 1));
  let t = 0, clock = 0;

  function step() {
    const hx = o.x, hy = o.y, beat = Math.floor((t * 3.1 * WAVES) / (Math.PI * 2));
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        // the wind's own direction across the screen, in gusts, and a last stir of air however calm it is
        const px = x * GUST_CELL, py = y * GUST_CELL, gust = gustAt(px, py);
        gusts[y * cols + x] = (air.x + air.y * 0.25) * gust * BLOWN + Math.sin(px * 0.019 + t * 1.2) * STILL_AIR;
      }
    const shiver = SHIVER + air.wind * WINDY_SHIVER;
    for (let n = 0; n < count; n++) {
      const at = n * STRIDE, x = list[at], y = list[at + 1];
      wind[n] = gusts[(y >> GUST_BITS) * cols + (x >> GUST_BITS)] + WAVE[(flutter[n] + beat) & (WAVES - 1)] * shiver;
      const dx = x - hx, dy = (y - hy) * 1.7, d2 = dx * dx + dy * dy;
      let target = 0;
      if (d2 < REACH * REACH) target = (dx < 0 ? -1 : 1) * (1 - Math.sqrt(d2) / REACH) * PUSH;
      if (!target && Math.abs(bend[n]) < 0.01 && Math.abs(speed[n]) < 0.01) continue;
      speed[n] += (target - bend[n]) * SPRING;
      speed[n] *= 1 - DAMP;
      bend[n] += speed[n];
    }
  }

  function paint(p, front) {
    const { C, w, h, ox, oy } = p, hx = o.x, hy = o.y;
    for (let n = 0; n < count; n++) {
      const at = n * STRIDE, x = list[at], y = list[at + 1], crossing = y > hy && y - hy < FRONT_DEEP && Math.abs(x - hx) < FRONT_WIDE;
      if (crossing !== front) continue;
      const type = GRASSES[list[at + 5]], lean = (wind[n] + bend[n]) * type.give + list[at + 6], tall = list[at + 2] * (1 - Math.min(0.55, Math.abs(bend[n]) * 0.4)), shades = type.shades[list[at + 3]], top = Math.round(tall);
      for (let k = 0; k <= top; k++) {
        const u = k / top, sx = Math.round(x + lean * tall * u * u) - ox, sy = y - k - oy;
        if (sx < 0 || sy < 0 || sx >= w || sy >= h - 1) continue;
        const color = type.head && k >= top - 2 ? type.head : shades[u < 0.36 ? 0 : u < 0.74 ? 1 : 2];
        C[sy * w + sx] = color;
        // the broad kinds are two pixels thick up to where they taper
        if (type.stems > 1 && u < 0.72 && sx + 1 < w) C[sy * w + sx + 1] = shades[u < 0.36 ? 0 : 1];
        if (type.head && k === top - 1 && sx + 1 < w) C[sy * w + sx + 1] = type.head;
      }
    }
  }

  return {
    update(dt) {
      t += dt;
      clock += dt;
      if (clock < STEP) return;
      clock %= STEP;
      step();
    },
    drawBack(p) {
      paint(p, false);
    },
    draw(p) {
      paint(p, true);
    },
  };
}

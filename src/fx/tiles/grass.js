// The living grass: every blade leans with the wind, and bends away from whoever walks through it, then springs back and
// shivers to a stop. The effect stands where the walker is. Blades behind him go on the back picture and the few in front of
// him on the front one, so he wades through it rather than walks on top of it.
import { hex } from "../../../vendor/pixelfx/src/core/index.js";
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
const GUST_SWING = 0.42; // how much of a passing gust a blade feels: strong wind holds it over, it doesn't swing it flat and back
const EDDY = 0.34; // small swirls at full wind, so neighbouring patches don't move as one
const STILL_AIR = 0.05;
const SHIVER = 0.04, WINDY_SHIVER = 0.15;
const FLUTTER = 3.1, WINDY_FLUTTER = 6; // how fast a blade flutters in calm air, and how much faster at full wind
const CATCHES = [0.07, 0.24]; // how quickly a blade takes up a change in the wind: each its own, so a gust runs through them unevenly
const SCATTER = 1.2; // how far from its own patch a blade may read the wind, in patches, which hides the edges between them
const BLAST_RUNS = 240; // px a second a blow runs out through the grass
const FLATTENS = 1.7; // the floor is seen at a slant, so a round blow looks flatter up and down the screen
const TORN_OUT = 0.85; // how much of a tear in the ground takes the grass with it
const GROWN_BACK = 0.9; // a torn-out blade shows again from here on, as it grows
const REGROWS = 8, THAWS = 8; // seconds until burnt or torn-out grass has grown back, and frozen grass thawed
const SCORCHED = 0.66, WITHERED = 0.25, FROZEN = 0.35; // how far gone a blade has to be to turn to each of the colors below
const CHAR = ["#191514", "#241d1a", "#3a2d25"].map(hex);
const WILT = ["#3e3220", "#5a4526", "#7a5c2c"].map(hex);
const ICE = ["#6f93b0", "#a8cfe4", "#e8f7ff"].map(hex);
const WAVES = 256; // a table of one sine wave, so each blade's flutter is a lookup
const WAVE = Float32Array.from({ length: WAVES }, (_, i) => Math.sin((i / WAVES) * Math.PI * 2));

const part = (value) => value - Math.floor(value);

export function create(o) {
  const list = o.blades, count = list.length / STRIDE, bend = new Float32Array(count), speed = new Float32Array(count), wind = new Float32Array(count), blown = new Float32Array(count);
  const span = (index) => list.reduce((most, value, i) => (i % STRIDE === index ? Math.max(most, value) : most), 0);
  const cols = (span(0) >> GUST_BITS) + 1, rows = (span(1) >> GUST_BITS) + 1, gusts = new Float32Array(cols * rows);
  const flutter = Uint8Array.from({ length: count }, (_, n) => ((list[n * STRIDE + 4] / (Math.PI * 2)) * WAVES) & (WAVES - 1));
  // what makes each blade its own, drawn from its phase: which patch of wind it reads, how fast it catches it, how far it gives
  const reads = new Uint16Array(count), catches = new Float32Array(count), gives = new Float32Array(count);
  for (let n = 0; n < count; n++) {
    const at = n * STRIDE, phase = list[at + 4], across = (part(phase * 7.3) - 0.5) * SCATTER * GUST_CELL, down = (part(phase * 11.9) - 0.5) * SCATTER * GUST_CELL;
    const cx = Math.max(0, Math.min(cols - 1, (list[at] + across) >> GUST_BITS)), cy = Math.max(0, Math.min(rows - 1, (list[at + 1] + down) >> GUST_BITS));
    reads[n] = cy * cols + cx;
    catches[n] = CATCHES[0] + part(phase * 13.7) * (CATCHES[1] - CATCHES[0]);
    gives[n] = 0.72 + part(phase * 3.1) * 0.56;
  }
  const burnt = new Float32Array(count), frozen = new Float32Array(count), gone = new Float32Array(count);
  let t = 0, clock = 0, fluttered = 0, blasts = [];

  /** Blows on the world run out from where they landed, and act on each blade as they pass it. */
  function runBlasts() {
    for (const [x, y, push, reach, burn, frost, tear] of o.pokes.splice(0)) blasts.push({ x, y, push, reach, burn, frost, tear, ring: 0 });
    for (const blast of blasts) {
      const from = blast.ring, to = (blast.ring += BLAST_RUNS * STEP);
      for (let n = 0; n < count; n++) {
        const at = n * STRIDE, dx = list[at] - blast.x, dy = (list[at + 1] - blast.y) * FLATTENS, d = Math.hypot(dx, dy);
        if (d < from || d >= to || d > blast.reach) continue;
        if (d < blast.tear * TORN_OUT) gone[n] = 1;
        const near = 1 - d / blast.reach;
        speed[n] += (dx < 0 ? -1 : 1) * blast.push * near;
        if (blast.burn) burnt[n] = Math.max(burnt[n], Math.min(1, 0.45 + near * 1.3));
        if (blast.frost) frozen[n] = Math.max(frozen[n], Math.min(1, 0.6 + near));
      }
    }
    blasts = blasts.filter((blast) => blast.ring < blast.reach);
  }

  function step() {
    fluttered += STEP * (FLUTTER + air.wind * WINDY_FLUTTER);
    const hx = o.x, hy = o.y, beat = Math.floor((fluttered * WAVES) / (Math.PI * 2));
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        // the wind's own direction across the screen, in gusts, and a last stir of air however calm it is
        const px = x * GUST_CELL, py = y * GUST_CELL, eddy = Math.sin(px * 0.083 + py * 0.061 + t * 2.3) * Math.sin(py * 0.097 - px * 0.037 - t * 1.7) * EDDY;
        gusts[y * cols + x] = (air.x + air.y * 0.25) * (1 + (gustAt(px, py) - 1) * GUST_SWING + eddy) * BLOWN + Math.sin(px * 0.019 + t * 1.2) * STILL_AIR;
      }
    const shiver = SHIVER + air.wind * WINDY_SHIVER;
    runBlasts();
    for (let n = 0; n < count; n++) {
      const at = n * STRIDE, x = list[at], y = list[at + 1];
      if (burnt[n] > 0) burnt[n] -= STEP / REGROWS;
      if (frozen[n] > 0) frozen[n] -= STEP / THAWS;
      if (gone[n] > 0) gone[n] -= STEP / REGROWS;
      blown[n] += (gusts[reads[n]] * gives[n] - blown[n]) * catches[n];
      wind[n] = blown[n] + WAVE[(flutter[n] + beat) & (WAVES - 1)] * shiver;
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
      if (crossing !== front || gone[n] > GROWN_BACK) continue;
      const type = GRASSES[list[at + 5]], scorch = burnt[n], ice = frozen[n], changed = scorch > WITHERED || ice > FROZEN;
      const lean = (wind[n] * (ice > FROZEN ? 0.15 : 1) + bend[n]) * type.give + list[at + 6], tall = list[at + 2] * (1 - Math.min(0.55, Math.abs(bend[n]) * 0.4)) * (1 - Math.max(0, scorch) * 0.45) * (1 - Math.max(0, gone[n]));
      const shades = scorch > SCORCHED ? CHAR : scorch > WITHERED ? WILT : ice > FROZEN ? ICE : type.shades[list[at + 3]], head = changed ? 0 : type.head;
      // a leaning blade keeps its length: what it reaches sideways it loses in height, and it's drawn so no gap opens along it
      const rise = tall / Math.hypot(1, lean), reach = lean * rise, top = Math.max(1, Math.ceil(Math.max(rise, Math.abs(reach))));
      for (let k = 0; k <= top; k++) {
        const u = k / top, sx = Math.round(x + reach * u * u) - ox, sy = Math.round(y - rise * u) - oy;
        if (sx < 0 || sy < 0 || sx >= w || sy >= h - 1) continue;
        const color = head && k >= top - 2 ? head : shades[u < 0.36 ? 0 : u < 0.74 ? 1 : 2];
        C[sy * w + sx] = color;
        // the broad kinds are two pixels thick up to where they taper
        if (type.stems > 1 && u < 0.72 && sx + 1 < w) C[sy * w + sx + 1] = shades[u < 0.36 ? 0 : 1];
        if (head && k === top - 1 && sx + 1 < w) C[sy * w + sx + 1] = head;
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

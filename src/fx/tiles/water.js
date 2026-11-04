// The active tile: water. Dark and plain, with light kept rare, the way the package's rain-splash puddle does it: the eye goes to
// the few bright marks and the water reads as deep. Thin crests drift slowly across it, the far side holds a little of the
// sky, its far edge catches the light, and at the shallows the bed shows through. Rain, blows and wading feet leave rings.
import { Rng, TAU, clamp, fbm, hex, rand, tileFbm } from "../../../vendor/pixelfx/src/core/index.js";
import { WATER as PACKAGE_WATER } from "../../../vendor/pixelfx/src/fx/water/_lib.js";
import { air } from "../lib/air.js";

export const meta = {
  name: "Water",
  desc: "Dark, plain living water: rare thin crests, a little sky on the far side, a lit far edge, and the bed showing through at the shallows.",
  tags: ["water", "tile", "ambient", "loop"],
  size: [960, 540],
  origin: [0, 0],
  duration: 1000,
  loop: true,
  fps: 30,
  options: { pixels: null, seed: 1 },
};

const C = PACKAGE_WATER.map(hex);
const DEEP = hex("#0e2552");
const TONES = [DEEP, C[1], C[2], C[3], C[4], C[5]]; // dark to light, for moving a pixel up or down as the water rises and falls
const SHALLOWS = 5, COAST = 13, MIDDLE = 30; // px from the shore where the water steps down a tone
const SIZE = 256, WRAP = SIZE - 1;
const FRAMES_A_SECOND = 8;
const CREST_DRIFT = 1.4, WINDY_DRIFT = 5; // px a second
const CREST_WIDTH = 0.57, WINDY_WIDTH = -0.07; // how high the swell has to be to catch the light
const SKY_SHARE = 0.26; // of the water, from the far side, that holds the sky
const CLEAR_DEPTH = 13; // px from the shore where the water stops being see-through
const CLEAREST = 0.5; // how much of the colour there is at the very edge

const DROPS_A_SECOND = 90; // rain landing on the water, in a downpour
const RING_LIFE = 0.8;
const RING_WIDEN = 15; // px a second
const RING_POINTS = 10;
const WADE_EVERY = 0.26; // seconds between the splashes of wading feet
const SUBMERGED = 3; // px of a wader hidden by the water round him
const STEP_DROPLETS = 5;
const DROPLET_LIFE = 0.3, DROPLET_RISE = 9, DROPLET_REACH = 8; // seconds, and px up and out

const WAVE_BODY = 3.2, WAVE_SPREAD = 3.4; // px wide a wave is at first, and how much wider it gets as it goes
const WAVE_CREST = 0.15, WAVE_PEAK = 0.7, WAVE_TROUGH = -0.2; // how high the water must stand to catch the light, or low to go dark
const RAIN_WAVE_CHANCE = 0.12; // of drops that are big enough to move the water

const LIGHT_CELL = 19; // px across a cell of the light bending through the shallows
const LIGHT_BEND = 10; // px the lines wander
const LIGHT_DRIFT = 0.6; // px a second

function createSwell(seed) {
  const values = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) values[y * SIZE + x] = tileFbm(x / 16, y / 8, 16, 32, seed, 2) * 0.5 + 0.5;
  return values;
}

/** Thin lines between cells, like the light a rippling surface throws on what's under it. */
function createLightLines(seed) {
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

export function create(o) {
  const lightLines = createLightLines(o.seed), swell = createSwell(o.seed), list = o.pixels, count = list.length / 3, rng = new Rng(o.seed + 5), rings = [], wet = new Set(), index = new Map(), north = new Map(), south = new Map();
  for (let n = 0; n < count; n++) {
    const x = list[n * 3], y = list[n * 3 + 1];
    wet.add(y * 4096 + x);
    index.set(y * 4096 + x, n);
    north.set(x, Math.min(north.get(x) ?? y, y));
    south.set(x, Math.max(south.get(x) ?? y, y));
  }
  // what never changes about each pixel: its depth tone, whether it holds the sky, and its share of colour over the bed
  const base = new Uint32Array(count), alpha = new Float32Array(count), rim = new Uint8Array(count), lit = new Uint32Array(count);
  for (let n = 0; n < count; n++) {
    const x = list[n * 3], y = list[n * 3 + 1], shore = list[n * 3 + 2], reach = south.get(x) - north.get(x) || 1, far = (y - north.get(x)) / reach, wander = fbm(x / 34, y / 14, o.seed + 4, 3) * 0.2;
    const edgeWander = shore + wander * 22;
    base[n] = edgeWander < SHALLOWS ? C[3] : far + wander < SKY_SHARE || edgeWander < COAST ? C[2] : edgeWander < MIDDLE ? C[1] : DEEP;
    alpha[n] = clamp(CLEAREST + (shore / CLEAR_DEPTH) * (1 - CLEAREST), 0, 1);
    rim[n] = wet.has((y - 1) * 4096 + x) ? (shore <= 1 ? 2 : 0) : 1;
    // light bends through thin water only: the deep stays plain
    lit[n] = edgeWander < SHALLOWS ? C[4] : edgeWander < COAST ? C[3] : edgeWander < COAST + 6 ? C[2] : 0;
  }

  let t = 0, due = 0, wadeClock = 0, lastX = o.x, lastY = o.y, slide = 0, frame = -1, shiftA = 0, shiftB = 0, width = CREST_WIDTH, side = 1, lightShift = 0;
  const isWet = (x, y) => wet.has(Math.round(y) * 4096 + Math.round(x));

  // each drop leaves a ring that spreads and goes, on the water only
  function moveRings(dt) {
    due += air.rain * DROPS_A_SECOND * dt;
    for (; due >= 1 && count; due--) {
      const n = rng.int(0, count - 1) * 3;
      rings.push({ x: list[n], y: list[n + 1], age: 0, size: 1, wave: rng.chance(RAIN_WAVE_CHANCE) ? 0.6 : 0 });
    }
    for (const [x, y, power] of o.pokes?.splice(0) ?? []) rings.push({ x, y, age: 0, size: power, wave: 1.5 });
    if (o.x !== undefined) {
      const moved = Math.hypot(o.x - lastX, o.y - lastY);
      lastX = o.x;
      lastY = o.y;
      wadeClock -= dt;
      if (moved > 0.05 && wadeClock <= 0 && isWet(o.x, o.y)) {
        wadeClock = WADE_EVERY;
        // the foot falling on alternate sides of him
        side = -side;
        rings.push({ x: o.x + side * 3, y: o.y, age: 0, size: 1.1, splash: true, wave: 1.5 });
      }
    }
    for (let n = rings.length - 1; n >= 0; n--) {
      rings[n].age += dt;
      if (rings[n].age > RING_LIFE * rings[n].size) rings.splice(n, 1);
    }
  }

  /**
   * What a touch does to the water itself: a low swell that travels out with its ring, a crest behind a trough. Swells add up
   * where they cross. The crest catches the light and the trough goes dark, so the surface visibly lifts and falls.
   */
  function drawWaves(p) {
    const heights = new Map();
    for (const { x, y, age, size, wave } of rings) {
      if (!wave) continue;
      const life = age / (RING_LIFE * size), radius = 1 + RING_WIDEN * RING_LIFE * size * Math.sqrt(life), body = WAVE_BODY + life * WAVE_SPREAD, reach = radius + body * 2.2;
      const power = wave * size * (1 - life) ** 1.3 * Math.min(1, age / 0.05), top = Math.floor(reach / 2);
      for (let dy = -top; dy <= top; dy++)
        for (let dx = -Math.ceil(reach); dx <= reach; dx++) {
          const off = Math.hypot(dx, dy * 2) - radius;
          if (Math.abs(off) > body * 2.2) continue;
          const key = (Math.round(y) + dy) * 4096 + Math.round(x) + dx;
          if (index.has(key)) heights.set(key, (heights.get(key) ?? 0) + power * Math.cos(off * 0.9) * Math.exp(-((off / body) ** 2)));
        }
    }
    for (const [key, height] of heights) {
      const up = height > WAVE_PEAK ? 2 : height > WAVE_CREST ? 1 : height < WAVE_TROUGH ? -1 : 0;
      if (!up) continue;
      const n = index.get(key), tone = TONES.indexOf(base[n]);
      p.put(key % 4096, Math.floor(key / 4096), TONES[Math.max(0, Math.min(TONES.length - 1, tone + up))]);
    }
  }

  function drawRings(p) {
    for (const { x, y, age, size } of rings) {
      // rings open fast and slow down, as the swell they carry spends itself; a second, fainter one follows inside
      const life = age / (RING_LIFE * size), r = 1 + RING_WIDEN * RING_LIFE * size * Math.sqrt(life);
      for (let wave = 0; wave < 2; wave++) {
        const ring = r - wave * 3.5, points = Math.ceil(Math.max(RING_POINTS, ring * 3));
        if (ring <= 0) continue;
        for (let k = 0; k < points; k++) {
          const a = (k / points) * TAU;
          // rings break up as they fade
          if (Math.sin(a * 5 + x) < life * 1.5 - 0.9) continue;
          const rx = Math.round(x + Math.cos(a) * ring), ry = Math.round(y + Math.sin(a) * ring * 0.5);
          if (wet.has(ry * 4096 + rx)) p.put(rx, ry, C[wave === 0 && life < 0.45 ? 6 : wave === 0 ? 5 : 4]);
        }
      }
      if (age < 0.05) p.put(Math.round(x), Math.round(y), C[7]);
    }
  }

  /** A step throws a few drops up and out, over everything. */
  function drawDroplets(p) {
    for (const { x, y, age, splash } of rings) {
      if (!splash || age > DROPLET_LIFE) continue;
      const u = age / DROPLET_LIFE;
      for (let k = 0; k < STEP_DROPLETS; k++) {
        const a = ((k + 0.5) / STEP_DROPLETS) * TAU + x, out = DROPLET_REACH * u * (0.7 + (k % 2) * 0.4);
        p.put(Math.round(x + Math.cos(a) * out), Math.round(y + Math.sin(a) * out * 0.5 - Math.sin(u * Math.PI) * DROPLET_RISE), C[k % 2 ? 7 : 6]);
      }
    }
  }

  function colorOf(n) {
    if (rim[n] === 1) return C[4]; // the far edge catches the light
    if (rim[n] === 2) return C[3];
    const x = list[n * 3], y = list[n * 3 + 1];
    // light on the water is rare: short level dashes, only where two drifting sheets of swell are both high; each stretch of
    // water has its own rows, so the dashes don't stack up in lines
    const row = y + ((((x >> 4) * 7) ^ (y >> 3)) & 3);
    if ((row & 3) === 0) {
      const a = swell[((y + shiftB) & WRAP) * SIZE + ((x + shiftA) & WRAP)], b = swell[((y - shiftB + 83) & WRAP) * SIZE + ((x - shiftA + 41) & WRAP)], high = Math.min(a, b);
      if (high > width + 0.1) return C[6];
      if (high > width + 0.03) return C[4];
      if (high > width) return C[3];
    }
    // the light bending through the shallows: thin lines that wander slowly over the bed
    if (lit[n]) {
      const bend = swell[((y + lightShift) & WRAP) * SIZE + ((x >> 1) & WRAP)] - 0.5, turn = swell[(((y >> 1) + 53) & WRAP) * SIZE + ((x - lightShift) & WRAP)] - 0.5;
      const lx = (x + Math.round(bend * LIGHT_BEND * 2)) & WRAP, ly = (y + Math.round(turn * LIGHT_BEND * 2)) & WRAP;
      if (lightLines[ly * SIZE + lx]) return lit[n];
    }
    return base[n];
  }

  function paint(p, n) {
    const x = list[n * 3], y = list[n * 3 + 1], sx = x - p.ox, sy = y - p.oy;
    if (sx < 0 || sy < 0 || sx >= p.w || sy >= p.h) return;
    if (alpha[n] >= 1) p.C[sy * p.w + sx] = colorOf(n);
    else p.blendPx(x, y, colorOf(n), alpha[n]);
  }

  return {
    update(dt) {
      t += dt;
      moveRings(dt);
      slide += (CREST_DRIFT + air.wind * WINDY_DRIFT) * dt;
      const now = Math.floor(t * FRAMES_A_SECOND);
      if (now === frame) return;
      frame = now;
      shiftA = Math.floor(slide);
      shiftB = Math.floor(slide * 0.4);
      lightShift = Math.floor(t * LIGHT_DRIFT);
      width = CREST_WIDTH + air.wind * WINDY_WIDTH;
    },
    drawBack(p) {
      for (let n = 0; n < count; n++) paint(p, n);
      drawWaves(p);
      drawRings(p);
    },
    // whoever stands in the water stands in it: what's round his feet is drawn over them
    draw(p) {
      if (o.x !== undefined && isWet(o.x, o.y)) for (let n = 0; n < count; n++) if (Math.abs(list[n * 3] - o.x) <= 11 && Math.abs(list[n * 3 + 1] - o.y) <= SUBMERGED) paint(p, n);
      drawDroplets(p);
    },
  };
}

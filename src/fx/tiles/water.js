// What touches the water: rain, blows and wading feet leave rings and low swells on it. The water itself, its colours and light, is
// drawn by the shader in tiles/water-shader.ts; this draws only what lies on top, and repaints the water round a wader's feet.
import { Rng, TAU } from "../../../vendor/pixelfx/src/core/index.js";
import { air } from "../lib/air.js";
import { C, CREST_DRIFT, CREST_WIDTH, FRAMES_A_SECOND, LIGHT_BEND, LIGHT_DRIFT, SIZE, TONES, WINDY_DRIFT, WINDY_WIDTH, createLightLines, createSwell, lookOfWater } from "./water-look.js";

export const meta = {
  name: "Water",
  desc: "What touches the water: rings and low swells from rain, blows and wading feet.",
  tags: ["water", "tile", "ambient", "loop"],
  size: [960, 540],
  origin: [0, 0],
  duration: 1000,
  loop: true,
  fps: 30,
  options: { pixels: null, seed: 1 },
};

const WRAP = SIZE - 1;
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

export function create(o) {
  const lightLines = createLightLines(o.seed), swell = createSwell(o.seed), list = o.pixels, count = list.length / 3, rng = new Rng(o.seed + 5), rings = [], wet = new Set(), index = new Map();
  for (let n = 0; n < count; n++) {
    const key = list[n * 3 + 1] * 4096 + list[n * 3];
    wet.add(key);
    index.set(key, n);
  }
  const { base, alpha, rim, lit } = lookOfWater(list, o.seed);

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

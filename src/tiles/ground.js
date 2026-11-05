// Lays tiles out as one picture. The grid says what each cell is; where two groups meet, the line between them runs through the
// middle of the cells and wanders with the noise, so no tile edge shows. Each pixel then takes its group's color and whatever
// mark its tile's variant has there.
import { clamp, fbm, rand } from "../../vendor/pixelfx/src/core/index.js";
import { BANK, BED, BED_STONE, BED_WEED, GRASSES, GROUPS, ROCK, TILE } from "./groups.js";

const SHORE_SHELF = 4; // px of plain shelf at the shore before the bed starts to rise and fall
const MOUNDS = 90; // how much the bed rises under the water in places, in px of depth
const BED_STEP = 7; // px of depth to a step of the bed's color
const WANDER = 0.62; // how far a border strays from straight
const COBBLE = 15; // px between the middles of laid stones
const WATER_REACH = 170; // px from water that the ground is still damp
const SHORE = 40; // px from land from which water counts as full depth
const FLATTENS = 1.7; // the floor is seen at a slant, so a round hole looks flatter up and down the screen
const FACE = 19; // px tall a cliff stands
const SHADOW = 7, SIDE_SHADOW = 5; // px of shade a cliff lays on the low ground below it, and to the side away from the sun
const CREST = 4, CREST_LIGHT = 1.16, CREST_STOPS = 12; // px wide the lit crest of high ground is, how much it brightens, and how far short of a slope it stops
const FOOT_SHADE = 3; // px of light shade round the foot of high ground
const OVERHANG = 3; // px the turf can hang down over a cliff's edge
const SLOPE_LOOK = 6; // px below a cliff's lip to look for a slope, since the lip wanders
const SLOPE_LONG = 26; // px a slope runs down, in its own ground
const SLOPE_SHADE = 0.5, SLOPE_DARK = 0.86; // how thick the shade lies at the top of a slope, thinning out as it runs down, and how dark
const TAPER = 26; // px either side of a slope over which a cliff sinks into the ground
export const WALL = { EDGE: 1, FACE: 2 }; // what stops a walker: the rim of high ground, or the rock of a cliff
const CLOD_SPREAD = 7, CLOD_CHANCE = 0.16; // px past a tear that clods are thrown, and how thickly they lie

const groupIndex = Object.fromEntries(GROUPS.map((group, i) => [group.char, i]));

/** Which group each pixel belongs to. */
function layOut(rows, width, height, seed) {
  const cols = rows[0].length, count = rows.length, cells = new Int8Array(cols * count), terrain = new Int8Array(width * height);
  rows.forEach((row, y) => [...row].forEach((char, x) => (cells[y * cols + x] = groupIndex[char])));
  const cell = (x, y) => cells[clamp(y, 0, count - 1) * cols + clamp(x, 0, cols - 1)];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const gx = (x - TILE / 2) / TILE, gy = (y - TILE / 2) / TILE, ix = Math.floor(gx), iy = Math.floor(gy), u = gx - ix, v = gy - iy;
      const a = cell(ix, iy), b = cell(ix + 1, iy), c = cell(ix, iy + 1), d = cell(ix + 1, iy + 1);
      let found = Math.min(a, b, c, d);
      const wander = fbm(x / 11, y / 11, seed, 3) * WANDER * 1.5;
      for (let g = found + 1; g <= Math.max(a, b, c, d); g++) {
        if (g !== a && g !== b && g !== c && g !== d) continue; // a group that isn't here can't turn up along the border
        // +1 where a corner is this group or higher, -1 where not, blended across the tile
        const at = (corner) => (corner >= g ? 1 : -1);
        const blend = at(a) * (1 - u) * (1 - v) + at(b) * u * (1 - v) + at(c) * (1 - u) * v + at(d) * u * v;
        if (blend + wander * (GROUPS[g].wander ?? 1) > 0) found = g;
      }
      terrain[y * width + x] = found;
    }
  return { terrain, cell };
}

/** The land under the water: sand and silt going dark with depth, a little lit where it rises, with weed and stones on it. */
function bedColor(depth, x, y, seed) {
  const patch = fbm(x / 8, y / 5, seed + 13, 2), rise = fbm((x - 3) / 26, (y - 3) / 15, seed + 12, 2) - fbm(x / 26, y / 15, seed + 12, 2), speck = rand(x, y, seed + 14);
  if (depth > 6 && fbm(x / 6, y / 4, seed + 15, 2) > 0.28) return BED_WEED[speck < 0.3 ? 1 : 0];
  if (rand(x >> 2, y >> 1, seed + 16) < 0.012) return BED_STONE[y & 1];
  return BED[clamp(Math.round(depth / BED_STEP + patch * 1.6 + rise * 8), 0, BED.length - 1)];
}

/** How many pixels each water pixel is from land, as far as SHORE. */
function shoreDistance(terrain, width, height) {
  const water = GROUPS.findIndex((group) => group.active), distance = new Uint8Array(width * height).fill(255), edge = [];
  for (let i = 0; i < terrain.length; i++)
    if (terrain[i] !== water) {
      distance[i] = 0;
      edge.push(i);
    }
  for (let n = 0; n < edge.length; n++) {
    const i = edge[n], x = i % width, next = distance[i] + 1;
    if (next > SHORE + 1) continue;
    for (const to of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width])
      if (to >= 0 && to < distance.length && distance[to] > next) {
        distance[to] = next;
        edge.push(to);
      }
  }
  return distance;
}

/** Worn cobbles of uneven size: for any pixel, the stone it's on and how far it is from the joint. */
function createCobbles(seed) {
  const points = new Map();
  const pointAt = (cx, cy) => {
    const key = (cx + 512) * 4096 + cy + 512;
    let point = points.get(key);
    if (!point) {
      point = {
        x: (cx + 0.5 + (rand(cx, cy, seed) - 0.5) * 0.74) * COBBLE,
        y: (cy + 0.5 + (rand(cx, cy, seed + 1) - 0.5) * 0.74) * COBBLE,
        tone: rand(cx, cy, seed + 2),
        size: 0.82 + rand(cx, cy, seed + 3) * 0.42,
      };
      points.set(key, point);
    }
    return point;
  };
  return (x, y) => {
    const cx = Math.floor(x / COBBLE), cy = Math.floor(y / COBBLE);
    let stone = null, near = 1e9, next = 1e9;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const point = pointAt(cx + dx, cy + dy), d = Math.hypot(x - point.x, (y - point.y) * 1.16) / point.size;
        if (d < near) {
          next = near;
          near = d;
          stone = point;
        } else if (d < next) next = d;
      }
    return { stone, gap: next - near };
  };
}

/** One light for every stone: the top left of each catches it, the bottom right falls into shade, the joints are dark. */
function cobbleColor(group, cobbles, x, y, seed) {
  const { stone, gap } = cobbles(x, y), C = group.ramp, T = group.tones;
  if (gap < 1.15) return C[0];
  const reach = (COBBLE / 2) * stone.size, lit = -(((x - stone.x) / reach) * 0.62 + ((y - stone.y) / reach) * 0.78);
  if (gap < 2.5) return lit > 0.14 ? C[stone.tone > 0.6 ? 4 : 3] : lit < -0.14 ? C[1] : T[1];
  if (gap < 4.5 && lit > 0.42) return C[3];
  if (gap < 4.5 && lit < -0.42) return T[0] === C[1] ? C[1] : C[2];
  const speck = rand(x, y, seed + 9);
  if (speck < 0.022) return C[1];
  if (speck > 0.985) return C[3];
  return T[stone.tone > 0.68 ? 2 : stone.tone < 0.3 ? 0 : 1];
}

/** Which pixels are raised, with an edge that wanders a little as the tile borders do, and which belong to slopes. */
function layHeights(levels, width, height, seed) {
  const cols = levels[0].length, count = levels.length, at = (x, y) => levels[clamp(y, 0, count - 1)][clamp(x, 0, cols - 1)], high = (x, y) => (at(x, y) === "^" ? 1 : -1);
  const raised = new Uint8Array(width * height), slopes = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const gx = (x - TILE / 2) / TILE, gy = (y - TILE / 2) / TILE, ix = Math.floor(gx), iy = Math.floor(gy), u = gx - ix, v = gy - iy;
      const blend = high(ix, iy) * (1 - u) * (1 - v) + high(ix + 1, iy) * u * (1 - v) + high(ix, iy + 1) * (1 - u) * v + high(ix + 1, iy + 1) * u * v;
      raised[y * width + x] = blend + fbm(x / 9, y / 9, seed + 80, 2) * 0.5 > 0 ? 1 : 0;
      slopes[y * width + x] = at(x >> 4, y >> 4) === "/" ? 1 : 0;
    }
  return { raised, slopes };
}

/** Rough blocks of rock stood on end, lit from the left, in the light at the top of the cliff and in shade at its foot. */
function rockColor(rocks, x, y, down, seed) {
  const { stone, gap } = rocks(x * 1.2, y * 0.6);
  if (gap < 1 || down > 0.92) return ROCK[0];
  const lit = stone.x - x * 1.2 > 2 ? 1 : 0, speck = rand(x, y, seed + 91), step = (down < 0.3 ? 3 : down < 0.7 ? 2 : 1) + lit - (stone.tone < 0.35 ? 1 : 0);
  return speck < 0.03 ? ROCK[1] : ROCK[clamp(step, 1, 4)];
}

const darken = (color, by) => (((color >>> 24) << 24) | (Math.min(255, ((color >>> 16) & 255) * by) << 16) | (Math.min(255, ((color >>> 8) & 255) * by) << 8) | Math.min(255, (color & 255) * by)) >>> 0;

/**
 * Raises the ground, as drawing: the map stays flat. Where high ground ends towards us a cliff stands below it, on the low ground,
 * with the turf hanging over its lip and shade at its foot; its other sides show as a thin dark edge. Hands back what stops a walker.
 */
function raiseGround(pixels, terrain, { raised, slopes }, width, height, seed) {
  const walls = new Uint8Array(width * height), earth = GROUPS.findIndex((group) => group.id === "dirt"), rocks = createCobbles(seed + 90), isHigh = (x, y) => x >= 0 && y >= 0 && x < width && y < height && raised[y * width + x];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (raised[i]) continue;
      if (isHigh(x, y + 1) || isHigh(x - 1, y) || isHigh(x + 1, y)) {
        if (slopes[Math.min(height - 1, y + SLOPE_LOOK) * width + x]) continue;
        pixels[i] = ROCK[0];
        walls[i] = WALL.EDGE;
      } else if (!slopes[Math.min(height - 1, y + SLOPE_LOOK) * width + x])
        for (let k = 2; k <= SIDE_SHADOW; k++) {
          // the side away from the sun lies in shade, and the others a little, so the rise stands off the ground below it
          if (isHigh(x - k, y)) pixels[i] = darken(pixels[i], k < 4 ? 0.62 : 0.78);
          else if (k <= FOOT_SHADE && (isHigh(x + k, y) || isHigh(x, y + k))) pixels[i] = darken(pixels[i], 0.8);
          else continue;
          break;
        }
    }
  // its crest catches the light: a bright line right at the edge, and a broken band behind it
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!raised[i]) continue;
      let crest = 0;
      for (let k = 1; k <= CREST && !crest; k++) if (!isHigh(x - k, y) || !isHigh(x + k, y) || !isHigh(x, y - k) || !isHigh(x, y + k)) crest = k;
      if (!crest) continue;
      let onSlope = false;
      for (let d = -CREST_STOPS; d <= CREST_STOPS && !onSlope; d += 4) onSlope = !!slopes[Math.min(height - 1, y + CREST + SLOPE_LOOK) * width + clamp(x + d, 0, width - 1)];
      if (onSlope) continue;
      if (crest === 1) pixels[i] = GROUPS[terrain[i]].ramp[3];
      else if (rand(x, y, seed + 95) < (crest === 2 ? 0.8 : 0.4)) pixels[i] = darken(pixels[i], CREST_LIGHT);
    }
  for (let x = 0; x < width; x++)
    for (let y = 0; y < height - 1; y++) {
      if (!isHigh(x, y) || isHigh(x, y + 1)) continue;
      const row = Math.min(height - 1, y + SLOPE_LOOK) * width;
      if (slopes[row + x]) {
        // the ground simply runs down here, as it is, with only a little shade to show the fall
        for (let k = 1; k <= SLOPE_LONG && y + k < height; k++) {
          const i = (y + k) * width + x;
          if (rand(x, y + k, seed + 94) < (1 - k / SLOPE_LONG) * SLOPE_SHADE) pixels[i] = darken(pixels[i], SLOPE_DARK);
        }
        continue;
      }
      // beside a slope the cliff sinks into the ground, so one runs into the other
      let near = TAPER;
      for (let d = 1; d < TAPER; d++)
        if (slopes[row + clamp(x - d, 0, width - 1)] || slopes[row + clamp(x + d, 0, width - 1)]) {
          near = d;
          break;
        }
      const top = GROUPS[terrain[y * width + x]].ramp, tall = Math.round((FACE + fbm(x / 13, 0, seed + 92, 2) * 5) * (near / TAPER) ** 0.7), hang = 1 + Math.floor(rand(x >> 1, seed + 93) * OVERHANG);
      pixels[y * width + x] = top[3];
      walls[y * width + x] = WALL.EDGE;
      for (let k = 1; k <= tall && y + k < height && !isHigh(x, y + k); k++) {
        const i = (y + k) * width + x;
        terrain[i] = earth; // nothing grows on rock, and no blow tears it
        walls[i] = WALL.FACE;
        pixels[i] = k < hang ? top[2] : k === hang ? top[0] : rockColor(rocks, x, y + k, k / tall, seed);
      }
      for (let k = 1; k <= SHADOW && y + tall + k < height; k++) {
        const i = (y + tall + k) * width + x;
        if (!raised[i]) pixels[i] = darken(pixels[i], k < 3 ? 0.6 : k < 6 ? 0.76 : 0.88);
      }
    }
  return walls;
}

/**
 * Live grass for every grass tile: tufts of blades, each as x, y, height, tone, phase, kind and fan. Where the large patches are
 * lush it stands to the knight's knee; elsewhere it's short and thin. How wet the ground is decides the kind, so each stands
 * where it belongs: by water, in the open, in between. Only tiles wholly grass grow it, so it stops short of paths.
 */
function plantGrass(terrain, lushAt, width, height, seed) {
  const blades = [], grass = GROUPS.findIndex((group) => group.grows), water = GROUPS.findIndex((group) => group.active), cols = Math.floor(width / TILE), rows = Math.ceil(height / TILE);
  const isGrass = (x, y) => x >= 0 && y >= 0 && x < width && y < height && terrain[y * width + x] === grass, pools = [];
  for (let y = TILE >> 1; y < height; y += TILE) for (let x = TILE >> 1; x < width; x += TILE) if (terrain[y * width + x] === water) pools.push([x, y]);
  const moistureAt = (x, y) => {
    const nearest = pools.reduce((best, [px, py]) => Math.min(best, Math.hypot(x - px, y - py)), Infinity);
    return clamp(Math.max(0, 1 - nearest / WATER_REACH) * 0.62 + fbm(x / 96, y / 96, seed + 60, 2) * 0.62 + 0.3);
  };
  for (let cy = 0; cy < rows; cy++)
    for (let cx = 0; cx <= cols; cx++) {
      const lush = lushAt[Math.min(height - 1, cy * TILE + 8) * width + Math.min(width - 1, cx * TILE + 8)], tufts = lush > 0.1 ? 5 : lush > -0.1 ? 2 : rand(cx, cy, seed + 40) > 0.5 ? 1 : 0;
      for (let t = 0; t < tufts; t++) {
        const r = (n) => rand(cx, cy, t, n, seed), x = cx * TILE + Math.floor(r(1) * TILE), y = cy * TILE + Math.floor(r(2) * TILE);
        if (!isGrass(x, y) || !isGrass(x - 3, y) || !isGrass(x + 3, y) || !isGrass(x, y + 2)) continue;
        const moisture = moistureAt(x, y) + (r(5) - 0.5) * 0.03, kind = Math.max(0, GRASSES.findIndex(({ moisture: [low, high] }) => moisture >= low && moisture < high)), type = GRASSES[kind];
        const [low, high] = lush > 0.1 ? type.tall : type.short, tall = low + r(3) * (high - low), count = type.blades[0] + Math.floor(r(4) * (type.blades[1] - type.blades[0] + 1));
        for (let b = 0; b < count; b++) {
          const off = (r(10 + b) - 0.5) * type.spread;
          blades.push(x + Math.round(off), y + Math.round((r(20 + b) - 0.5) * 2), tall * (0.6 + r(30 + b) * 0.5), Math.floor(r(40 + b) * 3), r(50 + b) * 6.28, kind, (off / (type.spread / 2 || 1)) * type.fan);
        }
      }
    }
  return Float32Array.from(blades);
}

export function paintGround(rows, seed, width, height, levels = /** @type {string[] | null} */ (null)) {
  const { terrain, cell } = layOut(rows, width, height, seed), pixels = new Uint32Array(width * height), shore = shoreDistance(terrain, width, height);
  const waterIndex = GROUPS.findIndex((group) => group.active), water = [], cobbles = createCobbles(seed);
  const patchAt = new Float32Array(width * height), lushAt = new Float32Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      patchAt[y * width + x] = fbm(x / 21, y / 21, seed + 1, 3);
      lushAt[y * width + x] = fbm(x / 46, y / 46, seed + 2, 2);
    }
  // each tile picks its variant here, with the large patches deciding which kind: tufts gather, flowers come in drifts
  const variantOf = (group, cx, cy) => {
    const lush = lushAt[clamp(cy * TILE + 8, 0, height - 1) * width + clamp(cx * TILE + 8, 0, width - 1)], pick = rand(cx, cy, seed + GROUPS.indexOf(group));
    const wanted = lush > 0.16 ? ["flowers", "tufts", "tufts", "worn", "pebbles"] : lush > -0.14 ? ["tufts", "tufts", "pebbles", "worn", "plain"] : ["tufts", "plain", "plain", "cracks"];
    const kind = wanted[Math.floor(pick * wanted.length)], options = group.variants.filter((v) => v.kind === kind);
    if (!options.length) return null;
    return options[Math.floor(rand(cx, cy, seed + 31) * options.length)].pixels;
  };

  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x, g = terrain[i], group = GROUPS[g];
      if (group.active) {
        if (shore[i] >= SHORE_SHELF) shore[i] = Math.max(SHORE_SHELF, shore[i] - Math.max(0, fbm(x / 26, y / 15, seed + 12, 2)) * MOUNDS);
        water.push(x, y, Math.min(shore[i], SHORE));
        // the bed under the water: it shows through at the edge, where the water is thin
        pixels[i] = bedColor(shore[i], x, y, seed);
        continue;
      }
      const patch = patchAt[i], C = group.ramp, step = patch > 0.16 ? 2 : patch < -0.16 ? 0 : 1;
      let color = group.laid ? cobbleColor(group, cobbles, x, y, seed) : group.tones[step];
      const cx = x >> 4, cy = y >> 4, whole = cell(cx, cy) === g, mark = whole ? variantOf(group, cx, cy) : null;
      if (mark?.[(y & 15) * TILE + (x & 15)]) color = mark[(y & 15) * TILE + (x & 15)];
      // where this group lies over a lower one: a lit lip, and the shade it throws on what's below
      const below = y < height - 1 ? terrain[i + width] : g, above = y > 0 ? terrain[i - width] : g, side = x > 0 ? terrain[i - 1] : g;
      if (below < g) color = C[group.rim ? 1 : 0];
      else if (above < g || side < g) color = C[3];
      const twoUp = y > 1 ? terrain[i - 2 * width] : g;
      if (above > g || twoUp > g) color = C[1];
      // land stops at water in a low earth bank
      for (let k = 1; k <= BANK.length; k++) if (y + k < height && terrain[i + k * width] === waterIndex) color = BANK[k - 1];
      pixels[i] = color;
    }
  const heights = levels ? layHeights(levels, width, height, seed) : null, walls = heights ? raiseGround(pixels, terrain, heights, width, height, seed) : new Uint8Array(width * height);
  for (let i = 0; i < shore.length; i++) if (shore[i] > SHORE) shore[i] = SHORE;
  return { pixels, terrain, walls, raised: heights?.raised ?? new Uint8Array(width * height), depth: shore, water: Uint16Array.from(water), blades: plantGrass(terrain, lushAt, width, height, seed) };
}

/**
 * A blow tears the turf open where it lands: a picture of bare earth, lit like a hollow, with clods thrown out round it, to lay
 * over the ground for a while. Only grass tears; what's on stone, earth or water stays clear. Null if none of it is on grass.
 */
export function tearGround(terrain, width, height, x, y, size, seed) {
  const { ramp: C, tones: T } = GROUPS.find((group) => group.id === "dirt"), grass = GROUPS.findIndex((group) => group.grows), far = Math.ceil(size * 1.4 + CLOD_SPREAD);
  const left = Math.max(0, Math.round(x - far)), right = Math.min(width - 1, Math.round(x + far)), top = Math.max(0, Math.round(y - far / FLATTENS)), bottom = Math.min(height - 1, Math.round(y + far / FLATTENS));
  if (left > right || top > bottom) return null;
  const w = right - left + 1, h = bottom - top + 1, pixels = new Uint32Array(w * h);
  let torn = false;
  for (let py = top; py <= bottom; py++)
    for (let px = left; px <= right; px++) {
      if (terrain[py * width + px] !== grass) continue;
      const i = (py - top) * w + px - left, dx = px - x, dy = (py - y) * FLATTENS, d = Math.hypot(dx, dy), edge = size * (0.78 + fbm(px / 5, py / 5, seed, 2) * 0.55), speck = rand(px, py, seed + 1);
      if (d > edge) {
        if (d < edge + CLOD_SPREAD && speck < CLOD_CHANCE * (1 - (d - edge) / CLOD_SPREAD)) pixels[i] = T[speck < 0.05 ? 2 : 0];
        continue;
      }
      torn = true;
      // the upper lip throws shade into the hollow, the lower one catches the light, and the middle is dug deepest
      if (d > edge - 2) pixels[i] = dy < 0 ? C[0] : C[3];
      else pixels[i] = speck < 0.06 ? C[1] : d < edge * 0.45 ? C[1] : d < edge * 0.75 ? T[0] : T[1];
    }
  return torn ? { x: left, y: top, w, h, pixels } : null;
}

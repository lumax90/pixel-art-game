// Lays tiles out as one picture. The grid says what each cell is; where two groups meet, the line between them runs through the
// middle of the cells and wanders with the noise, so no tile edge shows. Each pixel then takes its group's color and whatever
// mark its tile's variant has there.
import { clamp, fbm, rand } from "../../vendor/pixelfx/src/core/index.js";
import { BANK, BED, GRASSES, GROUPS, TILE } from "./groups.js";

const WANDER = 0.62; // how far a border strays from straight
const COBBLE = 15; // px between the middles of laid stones
const WATER_REACH = 170; // px from water that the ground is still damp
const SHORE = 40; // px from land from which water counts as full depth

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

export function paintGround(rows, seed, width, height) {
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
        water.push(x, y, Math.min(shore[i], SHORE));
        // the bed under the water: it shows through at the edge, where the water is thin
        pixels[i] = BED[shore[i] < 5 ? 0 : shore[i] < 11 ? 1 : 2];
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
  for (let i = 0; i < shore.length; i++) if (shore[i] > SHORE) shore[i] = SHORE;
  return { pixels, terrain, depth: shore, water: Uint16Array.from(water), blades: plantGrass(terrain, lushAt, width, height, seed) };
}

// Turns a piece of the real world into a map: Copernicus elevation and ESA WorldCover land cover, read straight from their open buckets,
// squeezed so each sample becomes one tile. Heights become levels, land cover becomes ground, and where the land is gentle the step
// between two levels is a slope you can walk up, so only real walls stay cliffs. Run it with:
//   node tools/maps/build.mjs <name> <west> <south> <east> <north> <tiles wide> <demUrl> <coverUrl>
import { writeFileSync } from "node:fs";
import { fromUrl } from "geotiff";

const [name, west, south, east, north, wide, demUrl, coverUrl] = process.argv.slice(2).map((part, i) => (i >= 1 && i <= 5 ? Number(part) : part));
const LEVELS = 4, GENTLE = 70; // game levels, few and clear; and m a tile that a slope can climb: steeper is a cliff
const ROCK_STEEP = 36; // m a tile from which bare ground is rock, not scree
const MEADOW_FROM = 420; // m up from which grass gives way to mountain meadow
const CLEAN = 2; // passes that clear lone specks out of the land cover

const kmWide = (east - west) * 111.3 * Math.cos((((south + north) / 2) * Math.PI) / 180), kmTall = (north - south) * 111.3, tall = Math.round((wide * kmTall) / kmWide);

async function read(url, resampleMethod) {
  const image = await (await fromUrl(url)).getImage(), [x0, y0, x1, y1] = image.getBoundingBox(), w = image.getWidth(), h = image.getHeight();
  const window = [Math.floor(((west - x0) / (x1 - x0)) * w), Math.floor(((y1 - north) / (y1 - y0)) * h), Math.ceil(((east - x0) / (x1 - x0)) * w), Math.ceil(((y1 - south) / (y1 - y0)) * h)];
  return (await image.readRasters({ window, width: wide, height: tall, resampleMethod }))[0];
}

const height = await read(demUrl, "bilinear"), cover = Uint8Array.from(await read(coverUrl, "nearest"));
const at = (x, y) => Math.max(0, Math.min(tall - 1, y)) * wide + Math.max(0, Math.min(wide - 1, x));

// a lone tile of one cover among another is noise at this scale
for (let pass = 0; pass < CLEAN; pass++) {
  const before = cover.slice();
  for (let y = 0; y < tall; y++)
    for (let x = 0; x < wide; x++) {
      const counts = new Map();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) counts.set(before[at(x + dx, y + dy)], (counts.get(before[at(x + dx, y + dy)]) ?? 0) + 1);
      const [top, votes] = [...counts].reduce((best, next) => (next[1] > best[1] ? next : best));
      if (votes >= 5 && top !== before[at(x, y)] && (counts.get(before[at(x, y)]) ?? 0) <= 2) cover[at(x, y)] = top;
    }
}

const land = Array.from(height).sort((a, b) => a - b), step = land[Math.floor(land.length * 0.985)] / LEVELS, levelOf = (x, y) => Math.max(0, Math.min(LEVELS, Math.floor(height[at(x, y)] / step)));
const steepness = (x, y) => Math.max(Math.abs(height[at(x + 1, y)] - height[at(x - 1, y)]), Math.abs(height[at(x, y + 1)] - height[at(x, y - 1)])) / 2;

function groundOf(x, y) {
  const kind = cover[at(x, y)], metres = height[at(x, y)], steep = steepness(x, y);
  if (kind === 80) return "~";
  if (kind === 70) return "*";
  if (kind === 60) return steep > ROCK_STEEP ? "r" : "s";
  if (kind === 50) return ".";
  if (kind === 100 || metres > MEADOW_FROM) return "m";
  return ",";
}

const rows = [], levels = [];
for (let y = 0; y < tall; y++) {
  let ground = "", level = "";
  for (let x = 0; x < wide; x++) {
    ground += groundOf(x, y);
    const here = levelOf(x, y), rises = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => levelOf(x + dx, y + dy) > here);
    level += rises && steepness(x, y) <= GENTLE && ground[x] !== "~" ? String.fromCharCode(97 + here) : String(here);
  }
  rows.push(ground);
  levels.push(level);
}
// where to start: the lowest open ground nearest the middle of the map
let start = null, best = Infinity;
for (let y = 0; y < tall; y++)
  for (let x = 0; x < wide; x++) {
    if (rows[y][x] !== ",") continue;
    const cost = Math.hypot(x - wide / 2, y - tall / 2) + height[at(x, y)] / 12;
    if (cost < best) [best, start] = [cost, { x, y }];
  }

writeFileSync(`src/maps/${name}.json`, JSON.stringify({ name, rows, levels, start, heights: Array.from(height, Math.round), metresWide: Math.round((kmWide * 1000) / wide) }));
const counts = {};
for (const row of rows) for (const char of row) counts[char] = (counts[char] ?? 0) + 1;
console.log(name, `${kmWide.toFixed(1)} x ${kmTall.toFixed(1)} km`, `${wide}x${tall}`, `${step.toFixed(0)} m a level`, "start", start, JSON.stringify(counts));

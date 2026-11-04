// Shows the tiles the way a player sees them, a full screen with the knight on it: node scripts/preview-tiles.mjs [seed] [zoom]
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { composite, createFrame, createFx } from "../vendor/pixelfx/src/core/index.js";
import { canvas, save, upscale } from "../vendor/pixelfx/tools/lib/fxlib.mjs";
import * as knight from "../src/fx/characters/knight.js";
import * as grass from "../src/fx/tiles/grass.js";
import * as water from "../src/fx/tiles/water.js";
import { paintGround } from "../src/tiles/ground.js";
import { TEST_MAP } from "../src/tiles/test-map.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), ".."), W = 480, H = 270;
const seed = Number(process.argv[2] ?? 1), zoom = Number(process.argv[3] ?? 2), start = performance.now();
const ground = paintGround(TEST_MAP, seed, W, H), painted = performance.now() - start, frame = createFrame(W, H);
frame.color.set(ground.pixels);
const pool = createFx(water, { x: 125, y: 66, pixels: ground.water, seed }), hero = createFx(knight, { x: 250, y: 150, facing: 0.5 });
const lawn = createFx(grass, { x: 250, y: 150, blades: ground.blades });
for (let t = 0; t < 40; t++) (pool.update(1 / 30), hero.update(1 / 30), lawn.update(1 / 30));
const s0 = performance.now();
pool.draw(frame, "back");
const waterMs = performance.now() - s0, s1 = performance.now();
lawn.draw(frame, "back");
const grassMs = performance.now() - s1;
hero.draw(frame);
lawn.draw(frame, "front");
console.log(`grass ${grassMs.toFixed(2)} ms over ${ground.blades.length / 7} blades`);
const pixels = composite(frame, new Uint8ClampedArray(W * H * 4), 0xff000000 | 0), sheet = canvas(W * zoom, H * zoom);
sheet.paste(upscale(pixels, W, H, zoom), W * zoom, H * zoom, 0, 0);
console.log(save(join(ROOT, "records", "tiles", "ground.png"), sheet.png()));

// the pond up close, a second apart, to judge how it moves
const crop = { x: 40, y: 20, w: 190, h: 120 }, strip = canvas((crop.w * 3 + 6) * 3, crop.h * 3 + 6);
for (let n = 0; n < 3; n++) {
  const shot = createFrame(W, H);
  shot.color.set(ground.pixels);
  for (let t = 0; t < 30; t++) {
    pool.options.x += 0.7;
    pool.update(1 / 30);
  }
  pool.draw(shot, "back");
  pool.draw(shot, "front");
  const whole = composite(shot, new Uint8ClampedArray(W * H * 4), 0xff000000 | 0), part = new Uint8ClampedArray(crop.w * crop.h * 4);
  for (let y = 0; y < crop.h; y++) part.set(whole.subarray(((crop.y + y) * W + crop.x) * 4, ((crop.y + y) * W + crop.x + crop.w) * 4), y * crop.w * 4);
  strip.paste(upscale(part, crop.w, crop.h, 3), crop.w * 3, crop.h * 3, n * (crop.w * 3 + 6), 3);
}
console.log(save(join(ROOT, "records", "tiles", "water.png"), strip.png()));
console.log(`ground ${painted.toFixed(0)} ms, water ${waterMs.toFixed(2)} ms a tick over ${ground.water.length / 3} px`);

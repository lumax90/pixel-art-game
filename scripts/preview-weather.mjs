// Shows the ground in rain and in snow, with the knight, the way a player sees it: node scripts/preview-weather.mjs [zoom]
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { composite, createFrame, createFx } from "../vendor/pixelfx/src/core/index.js";
import { canvas, save, upscale } from "../vendor/pixelfx/tools/lib/fxlib.mjs";
import * as knight from "../src/fx/characters/knight.js";
import { air } from "../src/fx/lib/air.js";
import * as grass from "../src/fx/tiles/grass.js";
import * as water from "../src/fx/tiles/water.js";
import * as snowCover from "../src/fx/weather/snow-cover.js";
import * as splashes from "../src/fx/weather/splashes.js";
import { GROUPS } from "../src/tiles/groups.js";
import { paintGround } from "../src/tiles/ground.js";
import { TEST_MAP } from "../src/tiles/test-map.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), ".."), W = 480, H = 270, zoom = Number(process.argv[2] ?? 2);
const ground = paintGround(TEST_MAP, 1, W, H), info = { terrain: ground.terrain, width: W, height: H, water: GROUPS.findIndex((group) => group.active), x: 0, y: 0, seed: 1 };

function picture(values, extra) {
  Object.assign(air, values);
  const frame = createFrame(W, H), under = [createFx(water, { pixels: ground.water, pokes: [[170, 80, 2.2]], seed: 1 }), ...extra.map((mod) => createFx(mod, info)), createFx(grass, { x: 250, y: 150, blades: ground.blades })];
  const hero = createFx(knight, { x: 250, y: 150, facing: 0.5 });
  frame.color.set(ground.pixels);
  for (let t = 0; t < 30; t++) for (const fx of [...under, hero]) fx.update(1 / 30);
  for (const fx of under) fx.draw(frame, "back");
  hero.draw(frame);
  for (const fx of under) fx.draw(frame, "front");
  return upscale(composite(frame, new Uint8ClampedArray(W * H * 4), 0xff000000 | 0), W, H, zoom);
}

const sheet = canvas(W * zoom, H * zoom * 2 + 6);
sheet.paste(picture({ rain: 0.9, wind: 0.2, x: 0.2 }, [splashes]), W * zoom, H * zoom, 0, 0);
sheet.paste(picture({ rain: 0, snowCover: 0.75, wind: 0.2, x: 0.2 }, [snowCover]), W * zoom, H * zoom, 0, H * zoom + 6);
console.log(save(join(ROOT, "records", "tiles", "weather.png"), sheet.png()));

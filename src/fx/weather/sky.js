// The package's weather, over a world seen from above. Its effects are side-on scenes of 320 x 180 with a strip of floor along
// the bottom, so this plays one on a private frame, leaves out the floor, and tiles what's left across the view. It leans
// with the wind and thins out with `amount`.
import { clearFrame, createFrame, createFx, smooth, wrap } from "../../../vendor/pixelfx/src/core/index.js";
import * as blizzard from "../../../vendor/pixelfx/src/fx/weather/blizzard.js";
import * as rain from "../../../vendor/pixelfx/src/fx/weather/rain.js";
import * as snow from "../../../vendor/pixelfx/src/fx/weather/snow.js";
import { air } from "../lib/air.js";

export const meta = {
  name: "Sky",
  desc: "A weather effect from the package, without its floor, tiled over whatever part of the world is in view.",
  tags: ["weather", "overlay", "loop"],
  size: [960, 540],
  origin: [0, 0],
  duration: 1000,
  loop: true,
  fps: 30,
  options: { sky: "rain", amount: 1, seed: 1 },
};

const TILE_W = 320, TILE_H = 180, ORIGIN_Y = 170;
const STAGGER = 137; // px each row of tiles is pushed sideways, so the seams don't line up
const FADE_IN = 1.5;
const LEAN = 0.55; // px sideways per px down, in full wind

// from, to: the rows of the scene to use. solid: only its hard pixels, leaving out the haze that would show the seams
const SKIES = {
  rain: { effect: rain, from: 0, to: 158, solid: true },
  snow: { effect: snow, from: 0, to: 158, solid: true },
  blizzard: { effect: blizzard, from: 0, to: 150, solid: true },
};

export function create(o) {
  const { effect, from, to, solid } = SKIES[o.sky], tile = createFrame(TILE_W, TILE_H), rows = to - from;
  const scene = createFx(effect, { x: TILE_W / 2, y: ORIGIN_Y, seed: o.seed });
  let t = 0;

  return {
    update(dt) {
      t += dt;
      scene.update(dt);
    },
    draw(p) {
      clearFrame(tile);
      scene.draw(tile);
      const strength = p.fade * smooth(0, FADE_IN, t) * o.amount, { w, h, ox, oy } = p, colors = tile.color, lights = tile.light, lean = air.x * LEAN;
      p.fade = 1;
      for (let y = 0; y < h; y++) {
        const worldY = oy + y, row = Math.floor(worldY / rows), start = (wrap(worldY, rows) + from) * TILE_W, shift = row * STAGGER + Math.round(worldY * lean);
        for (let x = 0; x < w; x++) {
          const worldX = ox + x, at = start + wrap(worldX + shift, TILE_W), color = colors[at], light = lights[at];
          if (color) {
            const alpha = color >>> 24;
            if (alpha === 255) p.put(worldX, worldY, color, strength);
            else if (!solid) p.blendPx(worldX, worldY, color, (alpha / 255) * strength);
          }
          if (light) p.add(worldX, worldY, light & 0xffffff, strength);
        }
      }
    },
  };
}

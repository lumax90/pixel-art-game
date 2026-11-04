// Snow lying on the ground, in small patches that start in the sheltered hollows of the noise, grow while it snows and shrink
// again in the thaw. Only the pixels that can ever hold snow are kept, so it costs no more than the patches it draws.
import { fbm, hex } from "../../../vendor/pixelfx/src/core/index.js";
import { air } from "../lib/air.js";

export const meta = {
  name: "Snow cover",
  desc: "Small patches of lying snow that grow and melt with the weather.",
  tags: ["weather", "snow", "overlay", "loop"],
  size: [960, 540],
  origin: [0, 0],
  duration: 1000,
  loop: true,
  fps: 30,
  options: { terrain: null, width: 0, height: 0, water: 0, seed: 1 },
};

const LARGEST_SHARE = 0.16; // of the ground that can lie under snow, however long it snows
const EDGE = 0.05; // how much of a patch's growth shows as its shaded rim
const WHITE = hex("#f0f6fb"), BLUE = hex("#c6d8ea"), SHADE = hex("#9db6d0");

export function create(o) {
  const { terrain, width, height, water, seed } = o, found = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (terrain[y * width + x] === water) continue;
      const deep = fbm(x / 15, y / 9, seed, 3) * 0.5 + 0.5;
      if (deep > 1 - LARGEST_SHARE - 0.26) found.push([x, y, deep]);
    }
  found.sort((a, b) => b[2] - a[2]);
  const count = Math.min(found.length, Math.round(width * height * LARGEST_SHARE)), xs = new Uint16Array(count), ys = new Uint16Array(count);
  for (let n = 0; n < count; n++) [xs[n], ys[n]] = found[n];

  return {
    update() {},
    drawBack(p) {
      const shown = Math.floor(count * air.snowCover), rim = Math.floor(count * Math.max(0, air.snowCover - EDGE)), { C, w, h, ox, oy } = p;
      for (let n = 0; n < shown; n++) {
        const sx = xs[n] - ox, sy = ys[n] - oy;
        if (sx >= 0 && sy >= 0 && sx < w && sy < h) C[sy * w + sx] = n >= rim ? SHADE : (xs[n] + ys[n] * 3) % 11 === 0 ? BLUE : WHITE;
      }
    },
    draw() {},
  };
}

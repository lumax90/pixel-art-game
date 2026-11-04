// Rain hitting the ground. Not every drop splashes: only a fixed few at a time, so a downpour costs the same however heavy it
// looks, and the eye fills in the rest.
import { Rng, TAU, hex } from "../../../vendor/pixelfx/src/core/index.js";
import { air } from "../lib/air.js";

export const meta = {
  name: "Rain splashes",
  desc: "A limited number of small crowns and rings where rain meets the ground.",
  tags: ["weather", "rain", "overlay", "loop"],
  size: [960, 540],
  origin: [0, 0],
  duration: 1000,
  loop: true,
  fps: 30,
  options: { terrain: null, width: 0, height: 0, water: 0, seed: 1 },
};

const MOST = 46; // splashes at once, in the heaviest rain
const LIFE = 0.3;
const WIDEN = 11; // px a second
const THROW = 7; // px a droplet goes up
const POINTS = 6;
const LIGHT = hex("#d4e6f0"), PALE = hex("#9fbccb");

export function create(o) {
  const rng = new Rng(o.seed), splashes = [], { terrain, width, height, water } = o;
  let due = 0;
  return {
    update(dt) {
      due += ((air.rain * MOST) / LIFE) * dt;
      for (; due >= 1; due--) {
        if (splashes.length >= MOST) continue;
        const x = rng.int(0, width - 1), y = rng.int(0, height - 1);
        if (terrain[y * width + x] !== water) splashes.push({ x, y, age: 0 });
      }
      for (let n = splashes.length - 1; n >= 0; n--) {
        splashes[n].age += dt;
        if (splashes[n].age > LIFE) splashes.splice(n, 1);
      }
    },
    draw(p) {
      for (const { x, y, age } of splashes) {
        const u = age / LIFE, r = 1 + age * WIDEN, color = u < 0.5 ? LIGHT : PALE, up = Math.sin(u * Math.PI) * THROW;
        for (let k = 0; k < POINTS; k++) {
          const a = (k / POINTS) * TAU;
          p.put(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.5), color);
        }
        if (u < 0.75) {
          p.put(x - 2, Math.round(y - up), LIGHT);
          p.put(x + 2, Math.round(y - up * 0.8), LIGHT);
        }
      }
    },
  };
}

// What touches the land from above, drawn on the game's picture plane over the 3D ground: rings where something falls on water, wading steps with their
// droplets, and the small crowns of rain on dry ground. The game says where, since only it knows what lies there.
import { TAU, hex } from "../../../vendor/pixelfx/src/core/index.js";
import { C } from "./water-look.js";

export const meta = {
  name: "Land touches",
  desc: "Rings on water, wading splashes and rain crowns on the 3D land.",
  tags: ["water", "rain", "tile", "loop"],
  size: [960, 540],
  origin: [0, 0],
  duration: 1000,
  loop: true,
  fps: 30,
  options: { pokes: null },
};

const RING_LIFE = 0.8, RING_WIDEN = 15, RING_POINTS = 10; // seconds; px a second; points on the smallest ring
const CROWN_LIFE = 0.3, CROWN_WIDEN = 11, CROWN_THROW = 7, CROWN_POINTS = 6; // the same for rain on dry ground; px a droplet goes up
const DROPLETS = 5, DROPLET_LIFE = 0.3, DROPLET_RISE = 9, DROPLET_REACH = 8;
const LIGHT = hex("#d4e6f0"), PALE = hex("#9fbccb");

export function create(o) {
  const touches = [];
  return {
    update(dt) {
      // [x, y, size]: a ring. With a kind: "crown" is rain on dry ground, "step" a wading foot
      for (const [x, y, size, kind] of o.pokes?.splice(0) ?? []) touches.push({ x, y, size, kind, age: 0 });
      for (let n = touches.length - 1; n >= 0; n--) {
        const touch = touches[n];
        touch.age += dt;
        if (touch.age > (touch.kind === "crown" ? CROWN_LIFE : RING_LIFE * touch.size)) touches.splice(n, 1);
      }
    },
    drawBack(p) {
      for (const { x, y, age, size, kind } of touches) {
        if (kind === "crown") continue;
        const life = age / (RING_LIFE * size), r = 1 + RING_WIDEN * RING_LIFE * size * Math.sqrt(life);
        for (let wave = 0; wave < 2; wave++) {
          const ring = r - wave * 3.5, points = Math.ceil(Math.max(RING_POINTS, ring * 3));
          if (ring <= 0) continue;
          for (let k = 0; k < points; k++) {
            const a = (k / points) * TAU;
            if (Math.sin(a * 5 + x) < life * 1.5 - 0.9) continue;
            p.put(Math.round(x + Math.cos(a) * ring), Math.round(y + Math.sin(a) * ring * 0.5), C[wave === 0 && life < 0.45 ? 6 : wave === 0 ? 5 : 4]);
          }
        }
      }
    },
    draw(p) {
      for (const { x, y, age, kind } of touches) {
        if (kind === "crown") {
          const u = age / CROWN_LIFE, r = 1 + age * CROWN_WIDEN, color = u < 0.5 ? LIGHT : PALE, up = Math.sin(u * Math.PI) * CROWN_THROW;
          for (let k = 0; k < CROWN_POINTS; k++) {
            const a = (k / CROWN_POINTS) * TAU;
            p.put(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.5), color);
          }
          if (u < 0.75) {
            p.put(Math.round(x) - 2, Math.round(y - up), LIGHT);
            p.put(Math.round(x) + 2, Math.round(y - up * 0.8), LIGHT);
          }
        } else if (kind === "step" && age < DROPLET_LIFE) {
          const u = age / DROPLET_LIFE;
          for (let k = 0; k < DROPLETS; k++) {
            const a = ((k + 0.5) / DROPLETS) * TAU + x, out = DROPLET_REACH * u * (0.7 + (k % 2) * 0.4);
            p.put(Math.round(x + Math.cos(a) * out), Math.round(y + Math.sin(a) * out * 0.5 - Math.sin(u * Math.PI) * DROPLET_RISE), C[k % 2 ? 7 : 6]);
          }
        }
      }
    },
  };
}

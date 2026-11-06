// Prints a walker leaves, by what the ground is: a pressed sole in dry earth, a deep one with a thrown-up lip in mud, a faint
// flattening of grass, and wet marks on stone after wading. They hold for a while and fade, sooner in the rain. Stone keeps none.
import { FLOOR_SLANT, clamp, hex } from "../../../vendor/pixelfx/src/core/index.js";
import { air } from "../lib/air.js";

export const meta = {
  name: "Footprints",
  desc: "Prints in earth, mud and grass, and wet marks on stone, that hold for a while and fade.",
  tags: ["ground", "tile", "footprints", "loop"],
  size: [960, 540],
  origin: [0, 0],
  duration: 1000,
  loop: true,
  fps: 30,
  options: { pokes: null },
};

const LOOKS = {
  dirt: { sole: hex("#54392a"), lip: hex("#94744f"), alpha: 0.7, life: 9 },
  mud: { sole: hex("#33241d"), lip: hex("#7a6048"), alpha: 0.9, life: 15 },
  grass: { sole: hex("#2f6233"), lip: 0, alpha: 0.42, life: 4 },
  wet: { sole: hex("#3b3d4a"), lip: 0, alpha: 0.6, life: 5 },
  snow: { sole: hex("#9db0cc"), lip: hex("#f4f8fc"), alpha: 0.85, life: 14 },
};
const MOST = 80; // prints kept at once; the oldest goes first
const SOLE = 2, HEEL = -3, GAP = -1, HALF_WIDE = 1; // px along the foot, from its middle, and to each side
const APART = 3; // px each foot lands from the line he walks
const HOLDS = 0.5; // of its life that a print stays as it was
const FADE_STEPS = 6; // fading goes by steps, so the picture only changes now and then
const RAIN_WASHES = 3; // how much faster a downpour wears prints away

/** The pixels of a boot pressed into the floor there, and those of the lip it pushes up on the near side. */
function pressBoot(x, y, facing, side) {
  const along = Math.cos(facing), across = Math.sin(facing), footX = x - across * side * APART, footY = y + along * side * APART * FLOOR_SLANT, cells = new Map();
  for (let u = HEEL; u <= SOLE; u += 0.5)
    for (let v = -HALF_WIDE; v <= HALF_WIDE; v += 0.5) {
      if (Math.round(u) === GAP || (u <= HEEL + 0.5 && Math.abs(v) === HALF_WIDE) || (u >= SOLE && Math.abs(v) === HALF_WIDE)) continue;
      const px = Math.round(footX + along * u - across * v), py = Math.round(footY + (across * u + along * v) * FLOOR_SLANT);
      cells.set(py * 4096 + px, [px, py]);
    }
  const sole = [...cells.values()], lip = [];
  for (const [px, py] of sole) if (!cells.has((py + 1) * 4096 + px)) lip.push([px, py + 1]);
  return { sole, lip };
}

export function create(o) {
  const prints = [];
  return {
    update(dt) {
      for (const [x, y, facing, side, kind] of o.pokes?.splice(0) ?? []) {
        prints.push({ ...pressBoot(x, y, facing, side), look: LOOKS[kind], age: 0 });
        if (prints.length > MOST) prints.shift();
      }
      for (let n = prints.length - 1; n >= 0; n--) {
        prints[n].age += dt * (1 + air.rain * RAIN_WASHES);
        if (prints[n].age >= prints[n].look.life) prints.splice(n, 1);
      }
    },
    drawBack(p) {
      for (const { sole, lip, look, age } of prints) {
        const left = clamp((1 - age / look.life) / (1 - HOLDS)), alpha = look.alpha * (Math.ceil(left * FADE_STEPS) / FADE_STEPS);
        for (const [x, y] of sole) p.blendPx(x, y, look.sole, alpha);
        if (look.lip) for (const [x, y] of lip) p.blendPx(x, y, look.lip, alpha * 0.7);
      }
    },
    draw() {},
  };
}

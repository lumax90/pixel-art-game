// Draws the training dummy from a character map, so the sprite stays editable as text.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePNG } from "../vendor/pixelfx/tools/lib/png.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public/assets/character/dummy.png");

const COLORS = {
  k: [42, 29, 26], // outline
  w: [138, 90, 52], // wood
  W: [95, 59, 34], // wood, shaded
  s: [224, 189, 107], // straw
  S: [184, 140, 69], // straw, shaded
  r: [200, 64, 47], // rope
  c: [217, 201, 163], // cloth
  C: [168, 149, 111], // cloth, shaded
};

const ART = [
  "......kkkk......",
  ".....kcccck.....",
  "....kccccCCk....",
  "....kckcckCk....",
  "....kccccCCk....",
  "....kckkkcCk....",
  ".....kccCCk.....",
  "......krrk......",
  ".kkkkkkwWkkkkkk.",
  "kwwwwwwwWwwwwWWk",
  ".kkkkkkwWkkkkkk.",
  "....kssssSSk....",
  "...kssssSsSSk...",
  "...ksSssssSSk...",
  "...krrrrrrrrk...",
  "...kssSssSsSk...",
  "...kssssSsSSk...",
  "....kkssSSkk....",
  "......kwWk......",
  "......kwWk......",
  "......kwWk......",
  "......kwWk......",
  ".....kkwWkk.....",
  "....kWWWWWWk....",
];

const w = ART[0].length, h = ART.length;
const data = new Uint8ClampedArray(w * h * 4);
ART.forEach((row, y) => {
  if (row.length !== w) throw new Error(`row ${y} is ${row.length} wide, expected ${w}`);
  [...row].forEach((ch, x) => {
    if (ch === ".") return;
    data.set([...COLORS[ch], 255], (y * w + x) * 4);
  });
});

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, encodePNG(w, h, data));
console.log(`dummy ${w}x${h} -> ${OUT}`);

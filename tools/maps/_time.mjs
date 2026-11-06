import { readFileSync } from "node:fs";
import { paintGround } from "../../src/tiles/ground.js";
const map = JSON.parse(readFileSync("src/maps/geiranger.json", "utf8"));
const w = map.rows[0].length * 16, h = map.rows.length * 16, t = performance.now();
const g = paintGround(map.rows, 7, w, h, map.levels);
console.log("painted", w, h, Math.round(performance.now() - t), "ms", "water", g.water.length / 3, "blades", g.blades.length / 7);
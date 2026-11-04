// Renders one of our own effects to a contact sheet and times it: node scripts/preview-fx.mjs poison/poison-arrow [frames] [zoom] [options as JSON]
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clearFrame, createFrame, createFx } from "../vendor/pixelfx/src/core/index.js";
import { contactSheet, loadEffect, renderFrames, save } from "../vendor/pixelfx/tools/lib/fxlib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const [id, frames = "16", zoom = "2", json = "{}"] = process.argv.slice(2);
const options = JSON.parse(json);

const fx = await loadEffect(id, join(ROOT, "src/fx"));
const sheet = contactSheet(fx, renderFrames(fx, { options }), { max: Number(frames), zoom: Number(zoom), width: 1500 });
console.log(save(join(ROOT, "records", id, "contact.png"), sheet));

const { meta } = fx, [w, h] = meta.size, [x, y] = meta.origin;
const frame = createFrame(w, h), live = createFx(fx.mod, { x, y, ...options }), costs = [];
for (let t = 0; t < meta.duration; t += 1 / 60) {
  const start = performance.now();
  live.update(1 / 60);
  clearFrame(frame);
  live.draw(frame, "back");
  live.draw(frame, "front");
  costs.push(performance.now() - start);
}
costs.sort((a, b) => a - b);
const pick = (q) => costs[Math.floor(costs.length * q)].toFixed(2);
console.log(`ms per frame: median ${pick(0.5)}, p95 ${pick(0.95)}, max ${costs[costs.length - 1].toFixed(2)}`);

const end = createFrame(w, h);
live.draw(end);
console.log(`pixels left at the end: ${end.color.filter(Boolean).length} color, ${end.light.filter(Boolean).length} light`);

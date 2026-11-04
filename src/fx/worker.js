// One of the workers effects run on. It keeps its own effects and draws them into three pictures, sent back each tick:
// what goes behind the sprites, what goes in front, and the light over everything.
import { breeze, clearFrame, createFrame, createFx, painterFor } from "../../vendor/pixelfx/src/core/index.js";
import { CATALOG } from "./catalog.js";
import { air, gustAt } from "./lib/air.js";
import { GasField } from "./lib/gas-field.js";

let back, front, light, surfaces, gas;
const live = new Map();
let dirty = false;

function createSurface(buffer, w, h) {
  const canvas = new OffscreenCanvas(w, h), context = canvas.getContext("2d", { willReadFrequently: true });
  const pixels = new ImageData(new Uint8ClampedArray(buffer.buffer), w, h);
  return () => {
    context.putImageData(pixels, 0, 0);
    return canvas.transferToImageBitmap();
  };
}

function init({ w, h, hasGas, worldW, worldH }) {
  back = createFrame(w, h);
  front = createFrame(w, h);
  light = new Uint32Array(w * h);
  surfaces = [back.color, front.color, light].map((buffer) => createSurface(buffer, w, h));
  if (hasGas) gas = new GasField(worldW, worldH);
}

function run(command) {
  const { type, id, ...values } = command;
  if (type === "spawn") live.set(id, createFx(CATALOG[command.fx], { ...command.options, gas }));
  else if (type === "move") Object.assign(live.get(id)?.options ?? {}, values);
  else if (type === "poke") (live.get(id)?.options.pokes)?.push(command.at);
  else if (type === "stop") live.get(id)?.stop();
}

function mergeLight() {
  const a = back.light, b = front.light, out = light;
  for (let i = 0; i < out.length; i++) {
    const p = a[i] & 0xffffff, q = b[i] & 0xffffff;
    if (!p && !q) {
      out[i] = 0;
      continue;
    }
    const r = Math.min(255, (p & 255) + (q & 255));
    const g = Math.min(255, ((p >>> 8) & 255) + ((q >>> 8) & 255));
    const bl = Math.min(255, (p >>> 16) + (q >>> 16));
    out[i] = (0xff000000 | r | (g << 8) | (bl << 16)) >>> 0;
  }
}

function tick({ dt, commands, ox, oy, anchor, weather }) {
  const start = performance.now();
  Object.assign(air, weather);
  Object.assign(breeze, { worldX: air.x, worldY: air.y, gust: gustAt(0, 0) });
  back.ox = front.ox = ox;
  back.oy = front.oy = oy;
  commands.forEach(run);
  for (const [id, fx] of live) {
    fx.update(dt);
    if (fx.done()) live.delete(id);
  }
  gas?.update(dt);
  const active = live.size > 0 || !!gas?.active;
  if (!active && !dirty) {
    postMessage({ count: 0, active, cost: 0, bitmaps: null, ox, oy, anchor });
    return;
  }
  clearFrame(back);
  clearFrame(front);
  for (const fx of live.values()) fx.draw(back, "back");
  if (gas) {
    gas.draw(painterFor(back));
    gas.veil(painterFor(front));
  }
  for (const fx of live.values()) fx.draw(front, "front");
  mergeLight();
  const bitmaps = surfaces.map((surface) => surface());
  dirty = active;
  postMessage({ count: live.size, active, cost: performance.now() - start, bitmaps, ox, oy, anchor }, bitmaps);
}

self.onmessage = ({ data }) => (data.type === "init" ? init(data) : tick(data));

// One of the workers effects run on. It keeps its own effects and draws them into three pictures: what goes behind the sprites,
// what goes in front, and the light over everything. A picture is only sent when it has changed since the last one.
import { breeze, clearFrame, createFrame, createFx, painterFor } from "../../vendor/pixelfx/src/core/index.js";
import { CATALOG } from "./catalog.js";
import { air, gustAt } from "./lib/air.js";
import { GasField } from "./lib/gas-field.js";

let back, front, light, surfaces, gas;
const live = new Map(), names = new Map();
let dirty = false;

function createSurface(buffer, w, h) {
  const canvas = new OffscreenCanvas(w, h), context = canvas.getContext("2d", { willReadFrequently: true });
  const pixels = new ImageData(new Uint8ClampedArray(buffer.buffer), w, h);
  let sent = null;
  return {
    filled: false,
    /** The picture as it is now, or null if the game already has it. */
    take() {
      // the fingerprint, and the box of what's on it: only that much is copied, as most of what's drawn is small
      let print = 0, left = w, right = -1, top = h, bottom = -1;
      for (let y = 0, i = 0; y < h; y++)
        for (let x = 0; x < w; x++, i++) {
          const pixel = buffer[i];
          print = Math.imul(print ^ pixel, 16777619);
          if (!pixel) continue;
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          bottom = y;
        }
      this.filled = right >= 0;
      if (print === sent) return null;
      sent = print;
      if (this.filled) context.putImageData(pixels, 0, 0, left, top, right - left + 1, bottom - top + 1);
      return canvas.transferToImageBitmap();
    },
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
  if (type === "spawn") {
    live.set(id, createFx(CATALOG[command.fx], { ...command.options, gas }));
    names.set(id, command.fx);
  }
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
  const spent = new Map();
  const timed = (id, work) => {
    const from = performance.now();
    work();
    spent.set(id, (spent.get(id) ?? 0) + performance.now() - from);
  };
  for (const [id, fx] of live) {
    timed(id, () => fx.update(dt));
    if (fx.done()) live.delete(id);
  }
  timed("gas", () => gas?.update(dt));
  const active = live.size > 0 || !!gas?.active;
  if (!active && !dirty) {
    postMessage({ count: 0, active, cost: 0, bitmaps: null, ox, oy, anchor });
    return;
  }
  clearFrame(back);
  clearFrame(front);
  for (const [id, fx] of live) timed(id, () => fx.draw(back, "back"));
  if (gas)
    timed("gas", () => {
      gas.draw(painterFor(back));
      gas.veil(painterFor(front));
    });
  for (const [id, fx] of live) timed(id, () => fx.draw(front, "front"));
  let bitmaps;
  timed("picture", () => {
    mergeLight();
    bitmaps = surfaces.map((surface) => surface.take());
  });
  dirty = active;
  const [heaviest, heaviestCost] = [...spent].reduce((worst, next) => (next[1] > worst[1] ? next : worst), ["", 0]);
  for (const id of names.keys()) if (!live.has(id)) names.delete(id);
  postMessage({ count: live.size, active, cost: performance.now() - start, heaviest: names.get(heaviest) ?? heaviest, heaviestCost, bitmaps, filled: surfaces.map((surface) => surface.filled), ox, oy, anchor }, bitmaps.filter(Boolean));
}

self.onmessage = ({ data }) => (data.type === "init" ? init(data) : tick(data));

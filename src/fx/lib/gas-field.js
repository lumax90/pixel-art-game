import { Rng, TAU, clamp, fit } from "../../../vendor/pixelfx/src/core/index.js";
import { air } from "./air.js";
import { Fluid } from "./fluid.js";

export const SY = 0.55; // how flat the floor looks: floor distances in y are drawn this much shorter
export const CELL = 3; // px of floor per fluid cell
export const GAS_PALETTE = ["#0f1c16", "#173a26", "#25602c", "#4a9428", "#86c82c", "#c4ea4e", "#efffa0"];

const STEP = 1 / 30;
const ROW = CELL * SY; // px of screen per row of cells
const THICK = 9; // px gas stands above the floor at full density
const FULL = 0.7; // density that counts as full
const VEIL = 0.3; // how much of the gas also passes in front of whoever stands in it
const STIRS = 4; // little pushes a step, to keep it moving once a burst is spent
const WIND_PUSH = 0.7; // how hard full wind pushes the gas each step
const FLOW = { drag: 0.988, fade: 0.9945, thin: 0.0011, cap: 1.3, swirl: 14 };

/** One fluid for all the gas on the floor: clouds that meet mix, and the cost doesn't grow with how many there are. */
export class GasField {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.fluid = new Fluid(Math.ceil(width / CELL) + 2, Math.ceil(height / ROW) + 2);
    this.colors = fit(GAS_PALETTE, 7);
    this.rng = new Rng(11);
    this.clock = 0;
    this.active = false;
    this.dense = new Float32Array(width * height);
    this.tint = new Float32Array(width * height);
    this.layer = new Uint32Array(width * height);
    this.box = { x0: 0, x1: -1, y0: 0, y1: -1 }; // the part of the layer holding gas
  }

  /** The cell under a point on the screen. */
  cellAt(x, y) {
    return [x / CELL, y / ROW];
  }

  densityAt(cx, cy) {
    const { w, h, d } = this.fluid, x = Math.round(cx), y = Math.round(cy);
    return x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x];
  }

  /** Add gas at a cell: see Fluid.splat. */
  splat(cx, cy, r, stuff) {
    this.fluid.splat(cx, cy, r, stuff);
    this.active = true;
  }

  update(dt) {
    if (!this.active) return;
    this.clock += dt;
    while (this.clock >= STEP) {
      this.clock -= STEP;
      this.stir();
      this.blow();
      this.active = this.fluid.step(STEP, FLOW);
    }
  }

  /** The wind carries the gas along. */
  blow() {
    const { fluid } = this, { u, v, d, w, x0, x1, y0, y1 } = fluid, pushX = air.x * WIND_PUSH, pushY = air.y * WIND_PUSH * SY;
    if (!pushX && !pushY) return;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        if (d[i] < 0.02) continue;
        u[i] += pushX;
        v[i] += pushY;
      }
  }

  stir() {
    const { fluid, rng } = this;
    for (let i = 0; i < STIRS; i++) {
      const x = rng.range(fluid.x0, fluid.x1), y = rng.range(fluid.y0, fluid.y1);
      if (this.densityAt(x, y) < 0.08) continue;
      // two opposite pushes side by side: an eddy, which stirs the gas without shoving the cloud off to one side
      const a = rng.range(0, TAU), s = rng.range(10, 24), vx = Math.cos(a) * s, vy = Math.sin(a) * s;
      fluid.splat(x - vy * 0.2, y + vx * 0.2, 3, { vx, vy });
      fluid.splat(x + vy * 0.2, y - vx * 0.2, 3, { vx: -vx, vy: -vy });
    }
  }

  /**
   * Draws the gas as a low landscape on the floor. Density is blown up to one value per pixel and read as height; the
   * floor is then walked from far to near, each pixel raising a little column, so nearer puffs overlap the ones behind
   * them. The dye marbling through the gas lifts it up the palette, which is what shows the flow.
   */
  draw(p) {
    const { fluid, width: W, height: H, dense, tint, layer, box, colors: C } = this;
    for (let y = box.y0; y <= box.y1; y++) layer.fill(0, y * W + box.x0, y * W + box.x1 + 1);
    box.y1 = -1;
    if (!this.active) return;
    const grid = fluid.d, dye = fluid.dye, GW = fluid.w, GH = fluid.h;
    const x0 = Math.max(3, (fluid.x0 - 1) * CELL), x1 = Math.min(W - 1, (fluid.x1 + 2) * CELL);
    const y0 = Math.max(3, Math.floor((fluid.y0 - 1) * ROW)), y1 = Math.min(H - 1, Math.ceil((fluid.y1 + 2) * ROW));
    for (let y = y0 - 3; y <= y1; y++) {
      const fy = y / ROW, iy = Math.min(GH - 2, fy | 0), ty = fy - iy;
      for (let x = x0 - 3; x <= x1; x++) {
        const fx = x / CELL, ix = Math.min(GW - 2, fx | 0), tx = fx - ix, i = iy * GW + ix, at = y * W + x;
        const a = grid[i], b = grid[i + 1], c = grid[i + GW], d = grid[i + GW + 1];
        if (a + b + c + d < 0.03) {
          dense[at] = 0;
          continue;
        }
        const wa = (1 - tx) * (1 - ty), wb = tx * (1 - ty), wc = (1 - tx) * ty, wd = tx * ty;
        dense[at] = a * wa + b * wb + c * wc + d * wd;
        tint[at] = dye[i] * wa + dye[i + 1] * wb + dye[i + GW] * wc + dye[i + GW + 1] * wd;
      }
    }
    box.x0 = x0;
    box.x1 = x1;
    box.y0 = Math.max(0, y0 - THICK);
    box.y1 = y1;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x, v = dense[i];
        if (v < 0.03) continue;
        const body = Math.min(1, v / FULL), rise = Math.min(y, Math.round(body * THICK));
        const slope = clamp((v - dense[i - 2 * W - 2]) * 1.5, -0.14, 0.14);
        const marble = Math.min(1, tint[i] / (v + 0.04)) * 0.42;
        const lit = clamp(body * 0.34 + marble + slope, 0, 0.99);
        const alpha = body < 0.09 ? 0.14 : body < 0.2 ? 0.26 : body < 0.4 ? 0.4 : 0.52;
        const c = C[1 + ((lit * 5.99) | 0)] & 0xffffff, pixel = (((alpha * 255) | 0) << 24) | c;
        for (let k = 0; k <= rise; k++) layer[i - k * W] = pixel;
        // the bright marbling glows faintly from inside
        if (lit > 0.5) p.add(x, y - rise, C[5], 0.1);
      }
    this.present(p, 1);
  }

  /** What passes in front of the sprites: the same gas as the last draw(), much thinner. */
  veil(p) {
    this.present(p, VEIL);
  }

  // whole-number blending over the frame, by hand: this runs on thousands of pixels, twice a tick
  present(p, alphaScale) {
    const { width: W, layer, box } = this, scale = Math.round(alphaScale * p.fade * 256), frame = p.C, FW = p.w, ox = p.ox, oy = p.oy;
    for (let y = box.y0; y <= box.y1; y++) {
      const by = y - oy;
      if (by < 0 || by >= p.h) continue;
      for (let x = box.x0; x <= box.x1; x++) {
        const pixel = layer[y * W + x];
        if (!pixel) continue;
        const bx = x - ox, a = ((pixel >>> 24) * scale) >> 8;
        if (bx < 0 || bx >= FW || !a) continue;
        const i = by * FW + bx, under = frame[i], keep = ((under >>> 24) * (255 - a)) >> 8, out = a + keep;
        if (!keep) {
          frame[i] = (a << 24) | (pixel & 0xffffff);
          continue;
        }
        const r = ((pixel & 255) * a + (under & 255) * keep) / out;
        const g = (((pixel >>> 8) & 255) * a + ((under >>> 8) & 255) * keep) / out;
        const b = (((pixel >>> 16) & 255) * a + ((under >>> 16) & 255) * keep) / out;
        frame[i] = (out << 24) | (b << 16) | (g << 8) | r;
      }
    }
  }
}

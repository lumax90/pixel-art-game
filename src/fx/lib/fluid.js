// A small grid fluid after Jos Stam's Stable Fluids: velocity and density carried along by the flow, with pressure
// keeping the flow swirling instead of piling up. Plain arrays and loops, so it can run every frame. Only the window
// of cells round the gas is worked on, so an empty grid costs nothing however big it is.

const SOLVER_STEPS = 10;
const EDGE_CELLS = 3; // gas thins out over this many cells, so it never piles up against the grid's border
const WINDOW_MARGIN = 6; // cells of empty air kept in the window round the gas, for it to flow into
const EMPTY = 0.004;

const smoothstep = (x) => x * x * (3 - 2 * x);

export class Fluid {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    const field = () => new Float32Array(w * h);
    this.u = field(); this.v = field(); this.d = field(); this.dye = field();
    this.u0 = field(); this.v0 = field(); this.d0 = field(); this.dye0 = field();
    this.p = field(); this.div = field(); this.curl = field();
    this.expansion = field();
    this.edge = field();
    this.x0 = 1; this.x1 = 0; this.y0 = 1; this.y1 = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const e = Math.min(x, y, w - 1 - x, h - 1 - y) / EDGE_CELLS;
        this.edge[y * w + x] = smoothstep(Math.min(1, e));
      }
  }

  /**
   * Add a soft blob at (x, y), in cells: `density` of gas, `dye` (a second colour carried by the same flow, which
   * marbles through the gas and shows how it's moving), a push of (vx, vy) cells/s, and `expansion`, which makes the
   * gas swell out of that spot the way a burst does.
   */
  splat(x, y, r, { density = 0, dye = 0, vx = 0, vy = 0, expansion = 0 }) {
    const { w, h, d, u, v } = this, R = Math.ceil(r * 2);
    const x0 = Math.max(1, Math.floor(x - R)), x1 = Math.min(w - 2, Math.ceil(x + R));
    const y0 = Math.max(1, Math.floor(y - R)), y1 = Math.min(h - 2, Math.ceil(y + R));
    for (let yy = y0; yy <= y1; yy++)
      for (let xx = x0; xx <= x1; xx++) {
        const dx = xx - x, dy = yy - y, k = Math.exp(-(dx * dx + dy * dy) / (r * r)), i = yy * w + xx;
        d[i] += density * k;
        this.dye[i] += dye * k;
        u[i] += vx * k;
        v[i] += vy * k;
        this.expansion[i] += expansion * k;
      }
  }

  // fits the working window round the gas; false when there's none left
  findWindow() {
    const { w, h, d } = this;
    let x0 = w, x1 = -1, y0 = h, y1 = -1;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (d[y * w + x] < EMPTY) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    if (x1 < 0) return false;
    this.x0 = Math.max(1, x0 - WINDOW_MARGIN);
    this.x1 = Math.min(w - 2, x1 + WINDOW_MARGIN);
    this.y0 = Math.max(1, y0 - WINDOW_MARGIN);
    this.y1 = Math.min(h - 2, y1 + WINDOW_MARGIN);
    return true;
  }

  /**
   * Advance by dt seconds and return whether any gas is left. drag and fade are how much velocity and gas survive one
   * step, thin is taken off every cell, which eats the wispy fringe and so stops a cloud spreading for ever, cap is the
   * most gas a cell can hold, and swirl keeps eddies alive.
   */
  step(dt, { drag, fade, thin, cap, swirl }) {
    if (!this.findWindow()) {
      this.u.fill(0); this.v.fill(0); this.p.fill(0); this.d.fill(0); this.dye.fill(0); this.expansion.fill(0);
      return false;
    }
    this.confineVorticity(dt, swirl);
    this.advect(dt);
    this.project();
    const { w, u, v, d, dye, edge, x0, x1, y0, y1 } = this;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x, e = edge[i], before = d[i], after = Math.min(cap, Math.max(0, before * fade * e - thin));
        u[i] *= drag * e;
        v[i] *= drag * e;
        d[i] = after;
        dye[i] = before > 0 ? dye[i] * (after / before) : 0;
      }
    this.expansion.fill(0);
    return true;
  }

  // numerical smearing eats small eddies; this hands their spin back, which is what makes gas curl
  confineVorticity(dt, strength) {
    const { w, h, u, v, curl, x0, x1, y0, y1 } = this;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        curl[i] = 0.5 * (v[i + 1] - v[i - 1] - u[i + w] + u[i - w]);
      }
    for (let y = Math.max(2, y0 + 1); y <= Math.min(h - 3, y1 - 1); y++)
      for (let x = Math.max(2, x0 + 1); x <= Math.min(w - 3, x1 - 1); x++) {
        const i = y * w + x, c = curl[i];
        const nx = Math.abs(curl[i + 1]) - Math.abs(curl[i - 1]), ny = Math.abs(curl[i + w]) - Math.abs(curl[i - w]);
        const len = Math.hypot(nx, ny) + 1e-5;
        u[i] += (dt * strength * ny * c) / len;
        v[i] -= (dt * strength * nx * c) / len;
      }
  }

  // removes whatever part of the flow would compress the gas, leaving it free to swirl; expansion is what's let through
  project() {
    const { w, u, v, p, div, expansion, x0, x1, y0, y1 } = this;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        div[i] = expansion[i] - 0.5 * (u[i + 1] - u[i - 1] + v[i + w] - v[i - w]);
      }
    // checkerboard order: a plain sweep leans towards where it started, and the whole cloud drifts that way
    for (let n = 0; n < SOLVER_STEPS * 2; n++)
      for (let y = y0; y <= y1; y++)
        for (let x = x0 + ((y + n + x0) & 1); x <= x1; x += 2) {
          const i = y * w + x;
          p[i] = (div[i] + p[i - 1] + p[i + 1] + p[i - w] + p[i + w]) * 0.25;
        }
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        u[i] -= 0.5 * (p[i + 1] - p[i - 1]);
        v[i] -= 0.5 * (p[i + w] - p[i - w]);
      }
  }

  // each cell looks back along the flow and takes what was there a moment ago
  advect(dt) {
    const { w, h, u, v, d, dye, u0, v0, d0, dye0, x0, x1, y0, y1 } = this;
    u0.set(u); v0.set(v); d0.set(d); dye0.set(dye);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        let px = x - dt * u0[i], py = y - dt * v0[i];
        px = px < 0.5 ? 0.5 : px > w - 1.5 ? w - 1.5 : px;
        py = py < 0.5 ? 0.5 : py > h - 1.5 ? h - 1.5 : py;
        const ix = px | 0, iy = py | 0, fx = px - ix, fy = py - iy, j = iy * w + ix;
        const a = (1 - fx) * (1 - fy), b = fx * (1 - fy), c = (1 - fx) * fy, e = fx * fy;
        u[i] = a * u0[j] + b * u0[j + 1] + c * u0[j + w] + e * u0[j + w + 1];
        v[i] = a * v0[j] + b * v0[j + 1] + c * v0[j + w] + e * v0[j + w + 1];
        d[i] = a * d0[j] + b * d0[j + 1] + c * d0[j + w] + e * d0[j + w + 1];
        dye[i] = a * dye0[j] + b * dye0[j + 1] + c * dye0[j + w] + e * dye0[j + w + 1];
      }
  }
}

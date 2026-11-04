import { Lights, Particles, P, Rng, clamp, fit, hex, smooth, TAU, WHITE } from "../../../vendor/pixelfx/src/core/index.js";
import { CELL, GAS_PALETTE, GasField, SY } from "../lib/gas-field.js";

export const meta = {
  name: "Poison arrow",
  desc: "An arrow drops out of the sky with a green sac tied behind its head. It stabs the floor, the sac bursts, and poison gas boils out over the ground, rolling and curling like a real fluid before it thins away.",
  tags: ["poison", "arrow", "gas", "fluid", "area", "ground", "one-shot"],
  size: [232, 284],
  origin: [116, 224],
  duration: 8,
  loop: false,
  fps: 30,
  bg: "dark",
  options: {
    palette: GAS_PALETTE,
    wood: ["#3a2414", "#6e4422", "#a8723c", "#d8a868"],
    steel: ["#2e3648", "#5a6680", "#9aa6ba", "#dfe7f2"],
    seed: 7,
  },
};

const HIT = 0.6; // the arrow lands
const SKY = 170; // how high it starts, px
const LEAN = 0.16; // how far it leans off vertical
const LENGTH = 30;

const FLUID_STEP = 1 / 30;
const WISP_HEIGHT = 8; // px over the floor that wisps lift off from

const BURST_END = HIT + 0.9;
const FADE_FROM = 4.4; // gas starts thinning for good
const STUCK_FADE = 6.6; // the arrow fades out

const JETS = 11;

const fall = (t) => clamp(t / HIT) ** 2.4;

export function create(o) {
  const C = fit(o.palette, 7), W = fit(o.wood, 4), S = fit(o.steel, 4), R = new Rng(o.seed);
  // the game hands in the one field all gas shares; on its own, for previews, the effect keeps a private one
  const ownField = !o.gas, gas = o.gas ?? new GasField(meta.size[0], meta.size[1]), [midX, midY] = gas.cellAt(o.x, o.y);
  const ps = new Particles({ rng: R, ground: () => 40, sparks: [C[6], C[5], C[3]] }), lights = new Lights();
  const drops = [], stains = [], jets = [];
  for (let i = 0; i < JETS; i++) {
    const a = (i / JETS) * TAU + R.range(-0.2, 0.2), power = R.range(0.45, 1.3);
    jets.push({ a, x: Math.cos(a) * power, y: Math.sin(a) * power, delay: R.range(0, 0.22) });
  }
  // the jets are uneven but mustn't add up to a push one way, or the whole cloud slides off the arrow
  const meanX = jets.reduce((sum, jet) => sum + jet.x, 0) / JETS, meanY = jets.reduce((sum, jet) => sum + jet.y, 0) / JETS;
  for (const jet of jets) {
    jet.x -= meanX;
    jet.y -= meanY;
  }

  let t = 0, burst = false, clock = 0;

  function burstSac() {
    burst = true;
    lights.add(0, -3, 74, C[5], 1, 0.5);
    lights.add(0, -3, 26, WHITE, 0.9, 0.16);
    for (let i = 0; i < 46; i++) {
      const a = R.range(0, TAU), sp = R.range(18, 80);
      drops.push({ x: 0, y: 0, z: 3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: R.range(50, 210), c: R.chance(0.3) ? C[6] : C[4] });
    }
    for (let i = 0; i < 26; i++) {
      const a = R.range(0, TAU), r = R.range(6, 34);
      stains.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * SY, rx: R.range(1.5, 6), ry: R.range(1, 3), life: R.range(2.4, 5.4) });
    }
  }

  // the sac empties out over half a second: a swelling core with uneven jets, so the cloud grows tongues
  function feedBurst() {
    const k = 1 - smooth(HIT, BURST_END, t);
    gas.splat(midX, midY, 5, { density: 0.5 * k, expansion: 1.5 * k });
    jets.forEach((jet, i) => {
      if (t < HIT + jet.delay) return;
      // every other jet carries dye, and they twist opposite ways: neighbours shear into curls
      const spin = i % 2 ? 1 : -1, dye = i % 2 ? 0.34 * k : 0;
      const x = midX + Math.cos(jet.a) * 6, y = midY + Math.sin(jet.a) * 6;
      gas.splat(x, y, 2.6, { density: 0.1 * k, dye, vx: (jet.x - spin * 0.7 * jet.y) * 20 * k, vy: (jet.y + spin * 0.7 * jet.x) * 20 * k });
    });
  }

  function stepBurst() {
    if (burst && t < BURST_END) feedBurst();
    if (t > HIT + 0.5 && t < FADE_FROM + 1) wisp();
  }

  // thin curls lifting off the thick parts of the cloud
  function wisp() {
    if (!R.chance(0.45)) return;
    const a = R.range(0, TAU), r = R.range(0, 26), x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (gas.densityAt(midX + x, midY + y) < 0.22) return;
    ps.spawn(P.VAPOUR, x * CELL, y * CELL * SY - WISP_HEIGHT, R.range(-4, 4), -R.range(6, 15), R.range(0.9, 1.7), C[R.chance(0.5) ? 4 : 3], R.range(2, 4));
  }

  function updateDrops(dt) {
    for (let i = drops.length - 1; i >= 0; i--) {
      const q = drops[i];
      q.vz -= 360 * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.z += q.vz * dt;
      if (q.z > 0) continue;
      gas.splat(midX + q.x / CELL, midY + q.y / CELL, 1.6, { density: 0.14, vx: q.vx * 0.08, vy: q.vy * 0.08 });
      stains.push({ x: q.x, y: q.y * SY, rx: 1.5, ry: 1, life: 1.6 });
      drops.splice(i, 1);
    }
  }

  return {
    update(dt) {
      t += dt;
      if (!burst && t >= HIT) burstSac();
      lights.update(dt);
      ps.update(dt);
      updateDrops(dt);
      clock += dt;
      while (clock >= FLUID_STEP) {
        clock -= FLUID_STEP;
        stepBurst();
      }
      if (ownField) gas.update(dt);
    },
    drawBack(p) {
      if (t < HIT) drawLandingShadow(p, C, t);
      for (const s of stains) drawStain(p, C, s, t - HIT);
      if (burst) drawRipple(p, C, t - HIT);
      if (ownField) gas.draw(p);
    },
    draw(p) {
      if (t < HIT) drawFalling(p, C, W, S, t);
      else if (t < meta.duration - 0.3) drawStuck(p, C, W, S, t - HIT);
      if (ownField) gas.veil(p);
      ps.draw(p);
      for (const q of drops) drawDrop(p, q);
      lights.draw(p);
      if (t >= HIT && t < HIT + 0.07) drawFlash(p, C);
      if (burst) glowCloud(p, C, t);
    },
  };
}

const headPoint = (t) => {
  const z = SKY * (1 - fall(t));
  return [z * LEAN, -z];
};

function drawArrow(p, C, W, S, tipX, tipY, bend, withSac) {
  const dx = LEAN, dy = -1, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len, side = [-uy, ux];
  const at = (s, o = 0) => [tipX + ux * s + side[0] * o + side[0] * bend * (s / LENGTH), tipY + uy * s + side[1] * o + side[1] * bend * (s / LENGTH)];
  const [ax, ay] = at(7), [bx, by] = at(LENGTH);
  p.line(ax, ay, bx, by, W[2]);
  p.line(ax + 1, ay, bx + 1, by, W[1]);
  // the fletching
  for (let s = LENGTH - 8; s <= LENGTH; s++) {
    const spread = 1 + (s - LENGTH + 8) * 0.3;
    const [x0, y0] = at(s, -spread), [x1, y1] = at(s - 3, 0), [x2, y2] = at(s, spread);
    p.line(x0, y0, x1, y1, W[3]);
    p.line(x2, y2, x1, y1, W[1]);
  }
  // the broadhead: lit side and shaded side, white point
  const [sx, sy] = at(0), [lx, ly] = at(6, -3), [rx, ry] = at(6, 3), [cx, cy] = at(6);
  p.tri(sx, sy, lx, ly, cx, cy, S[3]);
  p.tri(sx, sy, rx, ry, cx, cy, S[1]);
  p.px(sx, sy, WHITE);
  if (!withSac) return;
  // the poison sac tied on behind the head, a fat wet drop with a glint
  const [mx, my] = at(10);
  p.circle(mx, my, 4, (d) => (d > 0.8 ? C[1] : d > 0.5 ? C[3] : C[4]));
  p.px(mx - 1, my - 2, C[6]);
  p.px(mx - 2, my - 1, WHITE);
  p.line(...at(13, -2), ...at(13, 2), W[0]);
  p.glow(mx, my, 16, C[5], 0.3);
}

function drawFalling(p, C, W, S, t) {
  const [x, y] = headPoint(t), u = fall(t);
  // the air it tears through, longer the faster it goes
  const trail = 8 + 70 * u;
  for (let i = -1; i <= 1; i++) {
    const x0 = x + i * 2 + LEAN * LENGTH, y0 = y - LENGTH + Math.abs(i) * 6;
    p.line(x0, y0, x0 + LEAN * trail, y0 - trail, i ? C[3] : C[5], (s) => (1 - s) * 0.7);
  }
  drawArrow(p, C, W, S, x, y, 0, true);
}

function drawLandingShadow(p, C, t) {
  const u = fall(t), r = 16 - 11 * u;
  p.ellipse(0, 0, r, r * SY, hex("#04030a"), 0.2 + 0.5 * u);
  const ring = 26 - 21 * u;
  ellipseDots(p, ring, C[4], 0.5 * smooth(0, 0.3, t));
}

function ellipseDots(p, r, c, a) {
  const n = Math.ceil(r * 6);
  for (let i = 0; i < n; i++) {
    const g = (i / n) * TAU;
    p.dot(Math.cos(g) * r, Math.sin(g) * r * SY, c, a);
  }
}

function drawStuck(p, C, W, S, age) {
  const fade = 1 - smooth(STUCK_FADE - HIT, meta.duration - 0.4 - HIT, age);
  if (fade <= 0) return;
  const bend = 3.4 * Math.exp(-age * 5) * Math.sin(age * 46);
  const savedFade = p.fade;
  p.fade *= fade;
  drawArrow(p, C, W, S, 0, 3, bend, false);
  // what's left of the sac, a torn scrap
  p.px(0, -9, C[2]);
  p.px(1, -8, C[1]);
  p.px(-1, -7, C[1]);
  p.fade = savedFade;
}

function drawFlash(p, C) {
  p.circle(0, -3, 11, (d) => (d < 0.55 ? WHITE : C[6]));
}

function drawRipple(p, C, age) {
  if (age > 0.5) return;
  const k = age / 0.5, r = 8 + 54 * (1 - (1 - k) ** 3);
  ellipseDots(p, r, k < 0.3 ? C[6] : C[4], 1 - k);
}

function drawStain(p, C, s, age) {
  if (age < 0 || age > s.life) return;
  const a = 0.6 * (1 - smooth(s.life * 0.6, s.life, age));
  p.ellipse(s.x, s.y, s.rx, s.ry, (d) => (d > 0.7 ? C[3] : C[1]), a);
}

function drawDrop(p, q) {
  const x = q.x, y = q.y * SY - q.z;
  p.line(x, y, x - q.vx * 0.012, y - (q.vy * SY - q.vz) * 0.012, q.c);
}

function glowCloud(p, C, t) {
  const k = 0.13 * smooth(HIT, HIT + 0.5, t) * (1 - smooth(FADE_FROM - 0.5, meta.duration - 1, t));
  p.glow(0, -2, 62, C[4], k);
}

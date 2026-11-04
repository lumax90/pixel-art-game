import { clamp, fit, hex, skeleton, smooth, TAU } from "../../../vendor/pixelfx/src/core/index.js";
import { air, gustAt } from "../lib/air.js";
import { SY } from "../lib/gas-field.js";

export const meta = {
  name: "Knight",
  desc: "A knight in plate with a sword and kite shield, drawn from a live skeleton every tick. He turns to any angle, walks with planted feet, and his cape and plume trail behind however he moves.",
  tags: ["character", "knight", "skeleton", "cloth", "loop"],
  size: [112, 92],
  origin: [56, 72],
  duration: 2.4,
  loop: true,
  fps: 30,
  bg: "ground",
  options: {
    steel: ["#2e3648", "#5a6680", "#9aa6ba", "#dfe7f2"],
    cloth: ["#3a0f1c", "#6e1a28", "#a82c34", "#d8524a"],
    gold: ["#5a3a14", "#b8862a", "#ffd84a"],
    ink: "#0e0c14",
    facing: 0.5, // radians on the floor: 0 right, pi/2 towards us
    pace: 0, // px/s to walk on the spot, for previews: in the game he walks because he moves
    spin: 0, // radians/s to keep turning, for previews
    guard: false, // fighting: sword and shield up
    stroke: 0, // which of STROKES to play when strokeId changes
    strokeId: 0,
    connects: false, // this stroke lands, so it freezes for a moment on contact
  },
};

// Where the body wants to be: the sword hand (forward, sideways to his near side, height), the blade (turned round him by a,
// raised by p), the shield hand likewise and how far the shield turns outward, and how he carries himself. All in his own terms.
const GUARD = { hf: 4, hs: 7.6, hy: -17, a: 0.14, p: 0.96, sf: 7, ss: -5, sy: -21, out: 0.3, crouch: 1.6, lean: 0, twist: 0, stance: 3, step: 0 };
const EASY = { hf: 2.5, hs: 7.4, hy: -17, a: 0.2, p: -1.15, sf: 0.5, ss: -7, sy: -15, out: 1.25, crouch: 0.5, lean: -0.3, twist: 0, stance: 1.2, step: 0 };

const GUARD_UP_RATE = 14, GUARD_DOWN_RATE = 2.4;
const STROKE_FADE = 0.16; // how long he takes to come back to his stance
const BLADE_REACH = 3; // px from the fist to where the blade starts

// The combo. `keys` are [time, pose], `hit` is the moment of contact, which the game also reads to land the blow.
export const STROKES = [
  {
    // forehand, from over his near shoulder across to the far side
    length: 0.46, hit: 0.2, freeze: 0.06,
    keys: [
      [0.13, { hf: -3, hs: 9, hy: -25, a: 2.1, p: 0.55, lean: -1.5, crouch: 2.5, twist: 0.5, step: 1 }],
      [0.2, { hf: 12, hs: 2, hy: -22, a: 0, p: 0.12, lean: 3, crouch: 3, twist: -0.35, step: 6 }],
      [0.27, { hf: 7, hs: -7, hy: -19, a: -1.7, p: -0.1, lean: 3.5, crouch: 3.5, twist: -0.7, step: 6 }],
    ],
  },
  {
    // backhand, straight back the way the last one went
    length: 0.42, hit: 0.17, freeze: 0.06,
    keys: [
      [0.1, { hf: 6, hs: -7, hy: -24, a: -2, p: 0.5, lean: 0, crouch: 2.5, twist: -0.6, step: 2 }],
      [0.17, { hf: 12, hs: 3, hy: -24, a: 0.1, p: 0.2, lean: 2.5, crouch: 2.8, twist: 0.1, step: 5 }],
      [0.24, { hf: 3, hs: 10, hy: -22, a: 1.9, p: 0.1, lean: 2, crouch: 3, twist: 0.6, step: 5 }],
    ],
  },
  {
    // the finisher: up over his head and down, with his whole weight behind it
    length: 0.72, hit: 0.3, freeze: 0.11,
    keys: [
      [0.22, { hf: -1, hs: 5, hy: -39, a: 0, p: 2.3, lean: -3, crouch: 2, twist: 0.35, step: -1 }],
      [0.3, { hf: 13, hs: 3, hy: -16, a: 0, p: -0.35, lean: 6, crouch: 6, twist: -0.3, step: 9 }],
      [0.56, { hf: 12, hs: 3, hy: -14, a: 0, p: -0.55, lean: 5, crouch: 5.5, twist: -0.2, step: 8 }],
    ],
  },
];

/** A stroke's pose at time s, between its keys. */
function strokePose(keys, s) {
  if (s <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [at, pose] = keys[i], [from, last] = keys[i - 1];
    if (s > at) continue;
    const u = smooth(from, at, s), out = {};
    for (const key in pose) out[key] = last[key] + (pose[key] - last[key]) * u;
    return out;
  }
  return keys[keys.length - 1][1];
}

const REST_TURN = 0.628; // the rig stands 36 degrees round from its yaw: hips, chest and head all agree at this turn
const HEIGHT = 0.92; // heights on screen, the floor already being drawn SY flat

const JUMP = 24; // px in a step that can only be a teleport
const TURN_RATE = 12;
const SPEED_RATE = 14;
const STRIDE = 28; // px walked per full step cycle
const REACH = 6.5; // how far a foot lands from under the hips

const LX = -0.6, LY = -0.8; // light from the top left

const CAPE_COLS = 3, CAPE_ROWS = 5;
const CAPE_TOP = 31, CAPE_BACK = 3.6, CAPE_WIDE = 4.6, CAPE_SEG = 5.4, CAPE_FLARE = 0.16;
const CAPE_DAMP = 0.955, CAPE_WIND = 1.5, CAPE_GRAVITY = 340, CAPE_PASSES = 3;
const CAPE_BLOWN = 220; // what full wind does to the cape
const PLUME_BLOWN = 1.1; // and to the plume, px per link
const LEGS_BELOW = 6; // the skirt always hangs over the thighs, however far forward a knee comes

const PLUME_NODES = 6;
const SWORD = 21;
const RUN_FROM = 95, RUN_SPAN = 40; // px/s: walking ends, running is in full swing
const RUN_STRIDE = 12, RUN_REACH = 0.5;
const SHIELD = [[-6, -9], [6, -9], [7, -3], [0, 11], [-7, -3]];

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** A body part as a capsule with its ink, lit from one side, written directly: this runs for every part of every knight. */
function limb(p, ax, ay, bx, by, ra, rb, ramp, ink) {
  const reach = Math.max(ra, rb) + 1, dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1e-6;
  const x0 = Math.floor(Math.min(ax, bx) - reach), x1 = Math.ceil(Math.max(ax, bx) + reach);
  const y0 = Math.floor(Math.min(ay, by) - reach), y1 = Math.ceil(Math.max(ay, by) + reach);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5 - ax, py = y + 0.5 - ay, u = clamp((px * dx + py * dy) / len2);
      const r = ra + (rb - ra) * u, ex = px - dx * u, ey = py - dy * u, d2 = ex * ex + ey * ey;
      if (d2 > (r + 1) * (r + 1)) continue;
      if (d2 > r * r) {
        p.put(p.tx + x, p.ty + y, ink);
        continue;
      }
      const lit = (ex * LX + ey * LY) / r;
      p.put(p.tx + x, p.ty + y, ramp[lit > 0.42 ? 3 : lit > -0.12 ? 2 : lit > -0.62 ? 1 : 0]);
    }
}

function createCape(facing) {
  const fx = Math.cos(facing), fz = Math.sin(facing), nodes = [];
  for (let c = 0; c < CAPE_COLS; c++) {
    nodes.push([]);
    for (let r = 0; r < CAPE_ROWS; r++) {
      const h = CAPE_TOP - r * CAPE_SEG, side = (c - 1) * CAPE_WIDE, x = -fx * CAPE_BACK - fz * side, z = -fz * CAPE_BACK + fx * side;
      nodes[c].push({ x, z, h, px: x, pz: z, ph: h });
    }
  }
  return nodes;
}

function pull(a, b, length, pinned) {
  const dx = b.x - a.x, dz = b.z - a.z, dh = b.h - a.h, d = Math.hypot(dx, dz, dh) || 1e-6, k = (d - length) / d;
  const share = pinned ? 1 : 0.5;
  b.x -= dx * k * share;
  b.z -= dz * k * share;
  b.h -= dh * k * share;
  if (pinned) return;
  a.x += dx * k * share;
  a.z += dz * k * share;
  a.h += dh * k * share;
}

export function create(o) {
  const S = fit(o.steel, 4), C = fit(o.cloth, 4), G = fit(o.gold, 3), INK = hex(o.ink);
  const dark = [S[0], S[0], S[1], S[2]], blade = [S[1], S[2], S[3], S[3]], brass = [G[0], G[1], G[1], G[2]];
  const cape = createCape(o.facing);
  let t = 0, facing = o.facing, phase = 0, vx = 0, vy = 0, lastX = o.x ?? 0, lastY = o.y ?? 0;
  let guard = o.guard ? 1 : 0, seenStroke = 0, stroke = null, strokeTime = 0, hold = 0;

  function moveCape(dt) {
    const fx = Math.cos(facing), fz = Math.sin(facing), gust = Math.sin(t * 2.3) * 14, dt2 = dt * dt;
    const blow = gustAt(o.x ?? 0, o.y ?? 0) * CAPE_BLOWN;
    const windX = -vx * CAPE_WIND - fx * 30 - fz * gust + air.x * blow, windZ = (-vy / SY) * CAPE_WIND - fz * 30 + fx * gust + (air.y / SY) * blow;
    cape.forEach((strand, c) => {
      const top = strand[0], side = (c - 1) * CAPE_WIDE;
      top.x = -fx * CAPE_BACK - fz * side;
      top.z = -fz * CAPE_BACK + fx * side;
      for (let r = 1; r < CAPE_ROWS; r++) {
        const n = strand[r], x = n.x, z = n.z, h = n.h;
        n.x += (x - n.px) * CAPE_DAMP + windX * dt2;
        n.z += (z - n.pz) * CAPE_DAMP + windZ * dt2;
        n.h += (h - n.ph) * CAPE_DAMP - CAPE_GRAVITY * dt2;
        n.px = x;
        n.pz = z;
        n.ph = h;
      }
    });
    for (let pass = 0; pass < CAPE_PASSES; pass++) {
      for (const strand of cape) for (let r = 1; r < CAPE_ROWS; r++) pull(strand[r - 1], strand[r], CAPE_SEG, true);
      for (let r = 1; r < CAPE_ROWS; r++)
        for (let c = 1; c < CAPE_COLS; c++) pull(cape[c - 1][r], cape[c][r], CAPE_WIDE * (1 + r * CAPE_FLARE), false);
    }
    // it can't swing through his back
    for (const strand of cape)
      for (let r = 1; r < CAPE_ROWS; r++) {
        const n = strand[r], ahead = n.x * fx + n.z * fz + CAPE_BACK;
        if (ahead <= 0) continue;
        n.x -= fx * ahead;
        n.z -= fz * ahead;
        // moved with him, not flung: verlet would read the shove as speed
        n.px -= fx * ahead;
        n.pz -= fz * ahead;
      }
  }

  function moveStroke(dt) {
    if (o.strokeId !== seenStroke) {
      seenStroke = o.strokeId;
      stroke = STROKES[o.stroke];
      strokeTime = 0;
      hold = o.connects ? stroke.freeze : 0;
    }
    const up = o.guard || !!stroke;
    guard += (Number(up) - guard) * (1 - Math.exp(-dt * (up ? GUARD_UP_RATE : GUARD_DOWN_RATE)));
    if (!stroke) return;
    // on contact the stroke stops dead for a moment: that is what makes the blow feel heavy
    if (hold > 0 && strokeTime >= stroke.hit) {
      hold -= dt;
      return;
    }
    strokeTime += dt;
    if (strokeTime >= stroke.length) stroke = null;
  }

  /** How he stands right now: at ease or on guard, with any stroke in progress on top. */
  function stanceNow() {
    const q = {};
    for (const key in GUARD) q[key] = EASY[key] + (GUARD[key] - EASY[key]) * guard;
    if (!stroke) return { q, attacking: 0 };
    const { length, keys } = stroke, pose = strokePose(keys, strokeTime);
    const attacking = smooth(0, keys[0][0], strokeTime) * (1 - smooth(length - STROKE_FADE, length, strokeTime));
    for (const key in pose) q[key] += (pose[key] - q[key]) * attacking;
    return { q, attacking };
  }

  function rigPose(q, attacking) {
    const speed = Math.hypot(vx, vy), run = clamp((speed - RUN_FROM) / RUN_SPAN), gait = clamp(speed / 36) * (1 - attacking);
    const swing = Math.cos(phase) * gait, reach = REACH * (1 + run * RUN_REACH);
    const lift = (a) => Math.max(0, -Math.sin(a)) * (3 + run * 2) * gait;
    const fwdX = Math.cos(REST_TURN), fwdZ = Math.sin(REST_TURN);
    // the rig's hands and feet are given before it is turned: forward and sideways here are along its own body
    const X = (f, s) => f * fwdX - s * fwdZ, Z = (f, s) => f * fwdZ + s * fwdX;
    const breath = Math.sin(t * 2.2) * 0.4 * (1 - gait);
    const planted = q.stance * (1 - gait), near = swing * reach + planted + q.step, far = -swing * reach - planted - q.step * 0.3;
    const sword = q.hf - swing * (3.5 + run * 5), shield = q.sf + swing * (1.2 + run * 2);
    return {
      turn: REST_TURN + q.twist,
      yaw: facing - REST_TURN,
      crouch: q.crouch + breath + gait * (0.5 + 0.5 * Math.cos(phase * 2)) + run,
      lean: q.lean + gait * 1.6 + run * 3.4,
      ffx: X(near, 2.8), fzz: Z(near, 2.8), ffy: -4 - lift(phase),
      fbx: X(far, -2.8), bzz: Z(far, -2.8), fby: -4 - lift(phase + Math.PI),
      fx: X(sword, q.hs), fz: Z(sword, q.hs), fy: q.hy,
      bx: X(shield, q.ss), bz: Z(shield, q.ss), by: q.sy,
    };
  }

  function parts(p) {
    const { q, attacking } = stanceNow();
    const J = skeleton(rigPose(q, attacking)).joints, Fx = Math.cos(facing), Fz = Math.sin(facing), Nx = -Fz, Nz = Fx;
    const list = [];
    const put = (z, draw) => list.push({ z, draw });
    const sx = (j) => Math.round(j[0]), sy = (j) => Math.round(j[1] * HEIGHT + j[2] * SY);
    const bone = (a, b, ra, rb, ramp, bias = 0) => {
      const ax = sx(a), ay = sy(a), bx = sx(b), by = sy(b);
      put((a[2] + b[2]) / 2 + bias, () => limb(p, ax, ay, bx, by, ra, rb, ramp, INK));
    };
    const off = (j, f, up, n) => [j[0] + Fx * f + Nx * n, j[1] - up, j[2] + Fz * f + Nz * n];

    leg(J.hipF, J.kneeF, J.ankleF);
    leg(J.hipN, J.kneeN, J.ankleN);
    function leg(hip, knee, ankle) {
      bone(hip, knee, 3, 2.4, S, -LEGS_BELOW);
      bone(knee, ankle, 2.3, 1.8, S, -LEGS_BELOW);
      bone(knee, knee, 1.9, 1.9, blade, 0.5 - LEGS_BELOW);
      const heel = off(ankle, -1, -1.2, 0);
      bone(heel, off(heel, 5, -0.4, 0), 1.8, 1.4, dark, 0.2 - LEGS_BELOW);
    }

    // behind him unless his back is to us; side on it still goes behind
    put(Fz < -0.25 ? 6 : -14, () => drawCape(p, cape, C, G, INK, Fz));

    bone(off(J.chest, 0, 1.5, 0), J.waist, 5.1, 4.2, C, 3);
    const skirtTop = [J.waist[0], J.waist[1] + 1, J.waist[2]], hemShift = -vx * 0.035;
    put(3.5, () => drawSkirt(p, sx(skirtTop), sy(skirtTop), hemShift, Fx, Fz, C, G, INK));
    bone(off(J.waist, 0, -0.5, 4.3), off(J.waist, 0, -0.5, -4.3), 1, 1, brass, 3.6);
    const stripeTop = off(J.chest, 4.4, 2, 0), stripeEnd = off(J.waist, 4.2, 0, 0);
    if (Fz > -0.15) put(3.55, () => p.line(sx(stripeTop), sy(stripeTop), sx(stripeEnd), sy(stripeEnd), G[1]));

    arm(J.shoulderF, J.elbowF, J.handF, 4.5);
    arm(J.shoulderN, J.elbowN, J.handN, 5);
    function arm(shoulder, elbow, hand, plate) {
      bone(shoulder, elbow, 2.5, 2, S, 1);
      bone(elbow, hand, 2, 1.7, S, 1);
      bone(hand, hand, 2, 2, dark, 1.2);
      bone(shoulder, shoulder, 3.5, 3.5, blade, plate);
    }

    const hand = J.handN, flat = Math.cos(q.p), ca = Math.cos(q.a), sa = Math.sin(q.a);
    const dir = [(Fx * ca + Nx * sa) * flat, -Math.sin(q.p), (Fz * ca + Nz * sa) * flat];
    const along = (s) => [hand[0] + dir[0] * s, hand[1] + dir[1] * s, hand[2] + dir[2] * s];
    const blade0 = along(BLADE_REACH), tip = along(SWORD), pommel = along(-BLADE_REACH);
    bone(pommel, blade0, 0.8, 0.8, brass, 1.4);
    bone(blade0, tip, 1.1, 0.5, blade, 1.5);
    // the crossguard lies across the blade: a blade pointing straight up borrows his shoulders' line
    const crossLength = Math.hypot(dir[0], dir[2]), upright = crossLength < 0.25;
    const crossX = upright ? Nx : -dir[2] / crossLength, crossZ = upright ? Nz : dir[0] / crossLength;
    const cross = (s) => [blade0[0] + crossX * s, blade0[1], blade0[2] + crossZ * s];
    bone(cross(3.4), cross(-3.4), 0.7, 0.7, brass, 1.6);

    const faceOn = Math.cos(q.out), side = Math.sin(q.out);
    const shieldAt = off(J.handF, 1.2, -1, -1.6), nx = Fx * faceOn - Nx * side, nz = Fz * faceOn - Nz * side, tx = -nz, tz = nx;
    const corners = SHIELD.map(([u, v]) => {
      const c = [shieldAt[0] + tx * u, shieldAt[1] + v, shieldAt[2] + tz * u];
      return [sx(c), sy(c)];
    });
    put(shieldAt[2] + 2, () => drawShield(p, corners, nz > -0.05, C, S, G, INK));

    const head = J.head, helm = [head[0], head[1] - 1.2, head[2]], chin = [head[0], head[1] + 1.8, head[2]];
    const plume = [];
    for (let k = 0; k < PLUME_NODES; k++) {
      const up2 = 5 + k * 2.1 - k * k * 0.4, back = k * 2.3 + Math.sin(t * 5 + k) * 0.3;
      plume.push(off(helm, -back, up2, 0));
      plume[k][0] += (air.x * PLUME_BLOWN - vx * 0.015) * k;
      plume[k][2] += ((air.y * PLUME_BLOWN - vy * 0.015) / SY) * k;
    }
    put(Fz > 0.15 ? 5.5 : 7.5, () => {
      for (let k = PLUME_NODES - 1; k > 0; k--)
        limb(p, sx(plume[k - 1]), sy(plume[k - 1]), sx(plume[k]), sy(plume[k]), 2.5 - k * 0.3, 2.2 - k * 0.3, C, INK);
    });
    const hx = sx(helm), hy = sy(helm), hx2 = sx(chin), hy2 = sy(chin);
    put(7, () => {
      limb(p, hx, hy, hx2, hy2, 3.9, 3.5, S, INK);
      if (Fz < -0.3) return;
      const ring = (a, r, up3) => {
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        return [Math.round(helm[0] + x), Math.round((helm[1] - up3) * HEIGHT + (helm[2] + z) * SY)];
      };
      for (let a = -0.75; a <= 0.76; a += 0.25) {
        const [x, y] = ring(facing + a, 3.9, -0.8);
        p.px(x, y, INK);
      }
      const [topX, topY] = ring(facing, 3.7, 3.4), [noseX, noseY] = ring(facing, 4, -3);
      p.line(topX, topY, noseX, noseY, G[2]);
    });

    list.sort((a, b) => a.z - b.z);
    return list;
  }

  return {
    update(dt) {
      t += dt;
      const aim = o.facing + o.spin * t, smooth = 1 - Math.exp(-dt * SPEED_RATE);
      facing += wrap(aim - facing) * (1 - Math.exp(-dt * TURN_RATE));
      // put down somewhere else, he didn't run there: nothing should stream out behind him
      if (Math.hypot((o.x ?? 0) - lastX, (o.y ?? 0) - lastY) > JUMP) {
        lastX = o.x ?? 0;
        lastY = o.y ?? 0;
        vx = vy = 0;
      }
      const seenX = o.pace ? Math.cos(aim) * o.pace : ((o.x ?? 0) - lastX) / dt, seenY = o.pace ? Math.sin(aim) * o.pace : ((o.y ?? 0) - lastY) / dt;
      vx += (seenX - vx) * smooth;
      vy += (seenY - vy) * smooth;
      lastX = o.x ?? 0;
      lastY = o.y ?? 0;
      const speed = Math.hypot(vx, vy), stride = STRIDE + clamp((speed - RUN_FROM) / RUN_SPAN) * RUN_STRIDE;
      phase = (phase + (speed / stride) * TAU * dt) % TAU;
      moveStroke(dt);
      moveCape(dt);
    },
    drawBack(p) {
      p.place(Math.round(o.x ?? 0), Math.round(o.y ?? 0));
      const shadow = hex("#04030a"), wide = 12, deep = wide * SY;
      for (let y = -deep; y <= deep; y++)
        for (let x = -wide; x <= wide; x++) if ((x / wide) ** 2 + (y / deep) ** 2 <= 1) p.blend(x, y, shadow, 0.42);
    },
    draw(p) {
      p.place(Math.round(o.x ?? 0), Math.round(o.y ?? 0));
      for (const part of parts(p)) part.draw();
    },
  };
}

function drawCape(p, cape, C, G, INK, Fz) {
  const X = (n) => Math.round(n.x), Y = (n) => Math.round(-n.h * HEIGHT + n.z * SY);
  const inside = Fz > 0.45; // seen from the front it's the shaded inner side
  for (let r = 0; r < CAPE_ROWS - 1; r++)
    for (let c = 0; c < CAPE_COLS - 1; c++) {
      const a = cape[c][r], b = cape[c + 1][r], d = cape[c + 1][r + 1], e = cape[c][r + 1];
      const tone = inside ? (c ? 0 : 1) : (c ? 1 : 2) + (r % 2 ? 0 : 1);
      p.poly([[X(a), Y(a)], [X(b), Y(b)], [X(d), Y(d)], [X(e), Y(e)]], C[tone]);
    }
  const left = cape[0].map((n) => [X(n), Y(n)]), right = cape[CAPE_COLS - 1].map((n) => [X(n), Y(n)]);
  const hem = cape.map((strand) => strand[CAPE_ROWS - 1]).map((n) => [X(n), Y(n)]);
  p.polyline(left, INK);
  p.polyline(right, INK);
  p.polyline(hem, inside ? G[0] : G[1]);
}

function drawSkirt(p, x, y, shift, Fx, Fz, C, G, INK) {
  const drop = 8, wide = 5.6, hem = [];
  const top = [[x - 4, y], [x + 4, y]];
  for (let i = 0; i <= 6; i++) {
    const a = Math.PI - (i / 6) * Math.PI;
    hem.push([Math.round(x + shift + Math.cos(a) * wide), Math.round(y + drop + Math.sin(a) * wide * SY * 0.6)]);
  }
  const shape = [...top, ...hem];
  p.poly(shape, (px) => C[px < x - 2 ? 3 : px < x + 2 ? 2 : 1]);
  p.polyline([top[1], ...hem, top[0]], INK);
  p.polyline(hem, G[1]);
  if (Fz > -0.15) p.line(x + Math.round(Fx * 4), y, x + shift + Math.round(Fx * 5), y + drop + 1, G[2]);
}

function drawShield(p, pts, front, C, S, G, INK) {
  const closed = [...pts, pts[0]], mid = [
    [Math.round((pts[0][0] + pts[1][0]) / 2), Math.round((pts[0][1] + pts[1][1]) / 2)],
    pts[3],
  ];
  if (front) {
    p.poly(pts, C[2]);
    p.poly([pts[0], mid[0], mid[1], pts[4]], S[3]);
    p.polyline(closed, G[1]);
  } else {
    p.poly(pts, S[0]);
    p.polyline(closed, S[1]);
  }
  const outer = closed.map(([x, y]) => {
    const cx = (pts[0][0] + pts[1][0]) / 2, cy = (pts[0][1] + pts[3][1]) / 2;
    return [x + Math.sign(x - cx), y + Math.sign(y - cy)];
  });
  p.polyline(outer, INK);
}

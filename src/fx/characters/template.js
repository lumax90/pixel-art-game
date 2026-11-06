// The template character on the motion engine, as an effect. The pose is worked out anew every frame.
import { hex } from "../../../vendor/pixelfx/src/core/index.js";
import { createAnimator } from "../../motion/animator.js";
import { createCape } from "../../motion/cape.js";
import { wear } from "../../motion/items.js";
import { assemble, sizeBody } from "../../motion/body.js";
import clips from "../../motion/clips.json";
import { screenExact } from "../../motion/draw.js";
import { barbarian } from "../../motion/looks/barbarian.js";
import { template } from "../../motion/looks/template.js";
import { warrior } from "../../motion/looks/warrior.js";
import { drawTemplate } from "../../motion/template-look.js";
import { SY } from "../lib/gas-field.js";
import { STROKES } from "./knight.js";

export const meta = {
  name: "Template",
  desc: "The shared body as one shape with colored regions, moved by the motion engine.",
  tags: ["character", "template", "loop"],
  size: [112, 92],
  origin: [56, 72],
  duration: 2.4,
  loop: true,
  fps: 60,
  bg: "ground",
  options: { look: "template", gear: [], height: 32, facing: 0.5, stance: "Idle_Loop", sword: false, guard: false, stroke: 0, strokeId: 0, act: null, actId: 0, vx: null, vy: null, ground: null }, // ground: how far the ground under him rises per px across and along // vx, vy: px/s on screen, from a game that knows them; otherwise worked out from where he goes
};

const SPEED_RATE = 16, CARRY_RATE = 14;
const LEGS = 0.5, SLOPE_ON_SCREEN = 0.91; // of his height, what follows the slope under him; and how a rise in the world compares to one in his own drawing
const STRIDE = 0.74; // of the run clip's reach: a step about his own height long, not one and a half
const LEAN = 0.00025, MOST_LEAN = 0.22, LEAN_RATE = 12; // he tips towards wherever his speed is changing: into a turn, forward setting off, back braking. Px sideways for each px up, per px/s²
const STROKE_CLIP = "Sword_Attack", STROKE_LANDS = 0.4; // seconds into the clip that the sword is moving fastest: played so that this falls on the game's hit
const SHADOW = hex("#04030a");
const LOOKS = { template, barbarian, warrior };

export function create(o) {
  const floorZ = () => (o.y ?? 0) / SY;
  let look, body, animator, seenLook, worn = null, seenGear = null, cape = null, carrying = 1, leanX = 0, leanZ = 0, oldVx = 0, oldVz = 0, vx = 0, vz = 0, seenX = o.x ?? 0, seenZ = floorZ(), sinceMoved = 0, pose = null, seenAct = 0, seenStroke = 0, seenStance = o.stance;
  /** Where a point of him lands on screen. On a slope his legs follow it, so a foot comes down on the ground; his body stays upright. */
  const onGround = (point) => {
    const follow = o.ground ? Math.max(0, 1 - point[2] / (o.height * LEGS)) * SLOPE_ON_SCREEN : 0, rise = follow ? (o.ground[0] * point[0] + o.ground[1] * point[1]) * follow : 0;
    return screenExact([point[0] + leanX * point[2], point[1] + leanZ * point[2], point[2] + rise], SY);
  };
  /** Takes on a body: another character is the same moves on other measures. */
  const become = () => {
    seenLook = o.look;
    look = LOOKS[o.look];
    body = sizeBody(look.build, o.height);
    animator = createAnimator(clips, body, { idle: seenStance, gaits: ["Jog_Fwd_Loop"], stride: STRIDE }); // he only ever runs: the sprint clip's planted foot slides at any pace
    seenGear = null;
  };
  become();

  return {
    update(dt) {
      if (o.look !== seenLook) become();
      const x = o.x ?? 0, z = floorZ();
      sinceMoved += dt;
      if (o.vx !== null) {
        vx = o.vx;
        vz = o.vy / SY;
      } else if (x !== seenX || z !== seenZ) {
        const keep = Math.exp(-sinceMoved * SPEED_RATE);
        vx = vx * keep + ((x - seenX) / sinceMoved) * (1 - keep);
        vz = vz * keep + ((z - seenZ) / sinceMoved) * (1 - keep);
        seenX = x;
        seenZ = z;
        sinceMoved = 0;
      } else if (sinceMoved > 0.12) vx = vz = 0;
      const tip = (change) => Math.max(-MOST_LEAN, Math.min(MOST_LEAN, (change / dt) * LEAN)), settle = 1 - Math.exp(-dt * LEAN_RATE);
      leanX += (tip(vx - oldVx) - leanX) * settle;
      leanZ += (tip(vz - oldVz) - leanZ) * settle;
      oldVx = vx;
      oldVz = vz;
      const stance = o.guard && o.sword ? "Sword_Idle" : o.stance;
      if (stance !== seenStance) animator.stand((seenStance = stance));
      if (o.actId !== seenAct) {
        seenAct = o.actId;
        animator.play(o.act, { holds: o.act === "Death01" });
      }
      if (o.strokeId !== seenStroke) {
        seenStroke = o.strokeId;
        animator.play(STROKE_CLIP, { rate: STROKE_LANDS / STROKES[o.stroke].hit });
      }
      pose = animator.update(dt, vx, vz, o.facing);
      carrying += ((animator.busy ? 0 : 1) - carrying) * (1 - Math.exp(-dt * CARRY_RATE));
      const gear = o.gear.join();
      if (gear !== seenGear) {
        seenGear = gear;
        worn = wear(look, o.gear);
        cape = worn.cape ? createCape(o.height / 38) : null;
      }
      cape?.update(dt, assemble(body, pose, animator.lowerYaw, animator.upperYaw).chest, o.facing, vx, vz, 0, 0);
    },
    drawBack(p) {
      p.place(Math.round(o.x ?? 0), Math.round(o.y ?? 0));
      const wide = (6 * o.height) / 28, deep = wide * SY;
      for (let y = -Math.ceil(deep); y <= deep; y++)
        for (let x = -Math.ceil(wide); x <= wide; x++) if ((x / wide) ** 2 + (y / deep) ** 2 <= 1) p.blend(x, y, SHADOW, 0.34);
    },
    draw(p) {
      if (!pose) return;
      p.place(Math.round(o.x ?? 0), Math.round(o.y ?? 0));
      drawTemplate(p, assemble(body, pose, animator.lowerYaw, animator.upperYaw), body, SY, worn, onGround, o.sword, cape, carrying);
    },
  };
}

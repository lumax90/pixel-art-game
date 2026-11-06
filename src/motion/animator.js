// Chooses what a body is doing and mixes it: the gaits by speed, played just fast enough that the feet keep pace with the ground, and
// whatever action is asked for on top. Knows nothing of any game: it's told how the character moves and hands back frames.
import { assemble, createFrame, mixFrames } from "./body.js";
import { BONE, FIRST_LEG_BONE, NUMBERS_A_FRAME } from "./bones.js";

const clamp = (x, low = 0, high = 1) => Math.min(high, Math.max(low, x));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const settle = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));

const STILL = 8; // px/s under which he's standing
const FADE_IN = 0.09, FADE_OUT = 0.16; // seconds an action takes to take over and to let go
const HIP_LIMIT = 1.15; // radians the legs can go off from the way he faces when walking sideways
const LEGS_TURN = 12, CHEST_TURN = 16;
const MOVE_RATE = 14;
const CONTACT = 0.04; // of his height: how far off the floor a foot still counts as planted
const GAIT_FADE = 0.15; // seconds one gait takes to hand over to another: only then are two clips mixed, since two strides averaged are a shorter one and the feet slide

/** The point of a looping gait where the left foot is furthest ahead, so that gaits can be started in step. */
function stepOf(clip) {
  let best = -Infinity, at = 0;
  for (let frame = 0; frame < clip.frames; frame++) {
    const base = frame * NUMBERS_A_FRAME + 3, ahead = (bone) => clip.data[base + bone * 3];
    const lead = ahead(BONE.thighL) + ahead(BONE.shinL) - ahead(BONE.thighR) - ahead(BONE.shinR);
    if (lead > best) [best, at] = [lead, frame];
  }
  return at / clip.frames;
}

/** Frame `out` of a clip at `phase` (0 to 1), between its two nearest frames. */
function sample(out, clip, phase) {
  const place = (((phase % 1) + 1) % 1) * clip.frames, first = Math.floor(place), u = place - first, a = first * NUMBERS_A_FRAME, b = ((first + 1) % clip.frames) * NUMBERS_A_FRAME, data = clip.data;
  for (let i = 0; i < NUMBERS_A_FRAME; i++) out[i] = data[a + i] + (data[b + i] - data[a + i]) * u;
  return out;
}

/**
 * How fast the floor goes by under a planted foot in this gait, on this body: what the gait must be played at for that foot to stay put.
 * Measured from the feet, since a clip's own speed belongs to the legs it was made for.
 */
function groundSpeedOf(clip, body) {
  const pose = createFrame(), legs = [];
  for (let frame = 0; frame < clip.frames; frame++) legs.push(assemble(body, sample(pose, clip, frame / clip.frames), 0, 0).legs.map(({ ankle, toe }) => ({ height: Math.min(ankle[2] - body.ankle, toe[2]), along: ankle[0] })));
  const floor = Math.min(...legs.flat().map(({ height }) => height)) + CONTACT * body.height, seconds = clip.length / clip.frames;
  let total = 0, counted = 0;
  legs.forEach((now, frame) => {
    const next = legs[(frame + 1) % clip.frames];
    now.forEach((foot, side) => {
      const pace = (foot.along - next[side].along) / seconds;
      if (foot.height < floor && next[side].height < floor && pace > 0) {
        total += pace;
        counted++;
      }
    });
  });
  return total / counted;
}

/**
 * clips: from tools/motion/extract.mjs. body: the sized body that will play them, whose legs set how far a stride goes.
 * set: { idle, gaits: [slowest..fastest clip names], stride: how far the legs reach in a gait, as a share of the clip's: shorter steps come quicker for the same speed }.
 */
export function createAnimator(clips, body, set) {
  const stride = set.stride ?? 1, swinging = [BONE.thighL, BONE.shinL, BONE.thighR, BONE.shinR];
  const gaits = set.gaits.map((name) => ({ clip: clips[name], speed: groundSpeedOf(clips[name], body) * stride, step: stepOf(clips[name]) }));
  const out = createFrame(), rest = createFrame(), low = createFrame(), high = createFrame(), moving = createFrame(), base = createFrame(), action = createFrame();
  let idle = clips[set.idle], phase = 0, idleTime = 0, walking = 0, lowerYaw = 0, upperYaw = 0, playing = null, seeded = false, oldGait = gaits[0], gait = gaits[0], handedOver = 1;

  return {
    /** Which stance he stands in when nothing else is going on. */
    stand(name) {
      idle = clips[name];
    },
    /** Starts a clip over everything else. `onEnd` runs as it lets go. Clips that hold, like dying, stay on their last frame. */
    play(name, { holds = false, rate = 1 } = {}) {
      playing = { clip: clips[name], time: 0, holds, rate };
    },
    get busy() {
      return !!playing;
    },
    /** vx, vz: px/s on the floor. facing: the way he looks. */
    update(dt, vx, vz, facing) {
      if (!seeded) {
        lowerYaw = upperYaw = facing;
        seeded = true;
      }
      const speed = Math.hypot(vx, vz);
      walking = settle(walking, speed > STILL ? 1 : 0, MOVE_RATE, dt);
      idleTime += dt;
      sample(rest, idle, idleTime / idle.length);

      // going back is a walk played backward, going sideways is the legs turned that way under him
      const way = Math.atan2(vz, vx), off = wrap(way - facing), backward = speed > STILL && Math.abs(off) > HIP_LIMIT + 0.2;
      const legsWant = speed > STILL ? facing + clamp(backward ? wrap(off + Math.PI) : off, -HIP_LIMIT, HIP_LIMIT) : facing;
      lowerYaw += wrap(legsWant - lowerYaw) * (1 - Math.exp(-LEGS_TURN * dt));
      upperYaw += wrap(facing - upperYaw) * (1 - Math.exp(-CHEST_TURN * dt));

      // the gait made for this speed, played a little faster or slower to fit it
      const off1 = (candidate) => Math.abs(Math.log(Math.max(speed, 1) / candidate.speed)), nearest = gaits.reduce((best, candidate) => (off1(candidate) < off1(best) ? candidate : best));
      if (speed > STILL && nearest !== gait) {
        oldGait = gait;
        gait = nearest;
        handedOver = 0;
      }
      handedOver = clamp(handedOver + dt / GAIT_FADE);
      const cycle = oldGait.clip.length + (gait.clip.length - oldGait.clip.length) * handedOver, match = oldGait.speed + (gait.speed - oldGait.speed) * handedOver;
      phase += ((backward ? -1 : 1) * (dt / cycle) * speed) / Math.max(match, 1);
      mixFrames(moving, sample(low, oldGait.clip, phase + oldGait.step), sample(high, gait.clip, phase + gait.step), handedOver);
      for (const bone of swinging) moving[3 + bone * 3] *= stride;
      mixFrames(base, rest, moving, walking);

      if (playing) {
        playing.time += dt * playing.rate;
        const { clip, time, holds } = playing, ended = time >= clip.length;
        // stops on its last frame: a step past it would mix back into the first
        sample(action, clip, Math.min(time / clip.length, (clip.frames - 1) / clip.frames));
        const fade = holds ? clamp(time / FADE_IN) : clamp(time / FADE_IN) * clamp((clip.length - time) / FADE_OUT);
        // on the move, the legs keep walking and only the upper body acts
        const legs = fade * (1 - walking);
        mixFrames(out, base, action, fade, 0, FIRST_LEG_BONE);
        mixFrames(out, base, action, legs, FIRST_LEG_BONE);
        if (ended && !holds) playing = null;
      } else out.set(base);
      return out;
    },
    get lowerYaw() {
      return lowerYaw;
    },
    get upperYaw() {
      return upperYaw;
    },
  };
}

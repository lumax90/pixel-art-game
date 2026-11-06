// A body: its proportions, and how a frame of motion becomes joints. Points are [x, z, h]: across the floor, along the floor
// towards us, and up from it, in px from the character's feet.
import { BONE, FIRST_LEG_BONE, NUMBERS_A_FRAME } from "./bones.js";

/** How a body is built, as shares of its height. Another character is this list with other numbers, and plays the same clips. */
export const HUMAN = {
  thigh: 0.245, shin: 0.245, ankle: 0.06, foot: 0.11,
  spine: 0.27, neck: 0.19, shoulder: 0.14, hip: 0.07,
  upperArm: 0.175, forearm: 0.16, hand: 0.05, headRadius: 0.1,
};

/** The same build in px, for a character this tall. */
export function sizeBody(build, height) {
  return { ...Object.fromEntries(Object.entries(build).map(([part, share]) => [part, share * height])), height };
}

const reach = (from, frame, bone, length, turn) => {
  const at = 3 + bone * 3, f = frame[at], s = frame[at + 1], h = frame[at + 2], cos = Math.cos(turn), sin = Math.sin(turn);
  return [from[0] + (f * cos - s * sin) * length, from[1] + (f * sin + s * cos) * length, from[2] + h * length];
};

/** Where the joints of `body` are in a frame, with the legs turned to `lowerYaw` on the floor and everything above them to `upperYaw`. */
export function assemble(body, frame, lowerYaw, upperYaw) {
  const stands = body.thigh + body.shin + body.ankle, cos = Math.cos(lowerYaw), sin = Math.sin(lowerYaw), f = frame[0] * stands, s = frame[1] * stands;
  const pelvis = [f * cos - s * sin, f * sin + s * cos, frame[2] * stands], chest = reach(pelvis, frame, BONE.spine, body.spine, upperYaw), head = reach(chest, frame, BONE.neck, body.neck, upperYaw);
  const arm = (shoulderBone, upperArm, forearm, hand, thumb) => {
    const shoulder = reach(chest, frame, shoulderBone, body.shoulder, upperYaw), elbow = reach(shoulder, frame, upperArm, body.upperArm, upperYaw), wrist = reach(elbow, frame, forearm, body.forearm, upperYaw);
    return { shoulder, elbow, wrist, knuckle: reach(wrist, frame, hand, body.hand, upperYaw), thumb: reach(wrist, frame, thumb, 1, upperYaw) };
  };
  const leg = (hipBone, thigh, shin, foot) => {
    const hip = reach(pelvis, frame, hipBone, body.hip, lowerYaw), knee = reach(hip, frame, thigh, body.thigh, lowerYaw), ankle = reach(knee, frame, shin, body.shin, lowerYaw);
    return { hip, knee, ankle, toe: reach(ankle, frame, foot, body.foot, lowerYaw) };
  };
  const aimOf = (bone) => upperYaw + Math.atan2(frame[3 + bone * 3 + 1], frame[3 + bone * 3]);
  return {
    pelvis, chest, head, chestYaw: aimOf(BONE.chestAim), headYaw: aimOf(BONE.headAim), headAim: reach([0, 0, 0], frame, BONE.headAim, 1, upperYaw),
    arms: [arm(BONE.shoulderL, BONE.upperArmL, BONE.forearmL, BONE.handL, BONE.thumbL), arm(BONE.shoulderR, BONE.upperArmR, BONE.forearmR, BONE.handR, BONE.thumbR)],
    legs: [leg(BONE.hipL, BONE.thighL, BONE.shinL, BONE.footL), leg(BONE.hipR, BONE.thighR, BONE.shinR, BONE.footR)],
  };
}

export const createFrame = () => new Float32Array(NUMBERS_A_FRAME);

/** Writes the mix of two frames, from bone `from` to bone `to`, into `out`. The root counts as the first bone of the legs. */
export function mixFrames(out, a, b, k, from = 0, to = 999) {
  const first = 3 + from * 3, last = Math.min(NUMBERS_A_FRAME, 3 + to * 3);
  for (let i = first; i < last; i++) out[i] = a[i] + (b[i] - a[i]) * k;
  if (from <= FIRST_LEG_BONE && to > FIRST_LEG_BONE) for (let i = 0; i < 3; i++) out[i] = a[i] + (b[i] - a[i]) * k;
  return out;
}

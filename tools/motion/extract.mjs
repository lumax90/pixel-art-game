// Turns a humanoid animation pack into the motion engine's clips: which way each bone points on each frame, in the body's own terms.
// Bone lengths are left out, so any body can play any clip. Run it with:
//   node tools/motion/extract.mjs <pack.glb> <pack with root motion.glb> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { AIM, BONES, KEEP } from "../../src/motion/bones.js";

const FPS = 30;
const DIGITS = 1000;

function readGlb(path) {
  const data = readFileSync(path), jsonLength = data.readUInt32LE(12), json = JSON.parse(data.toString("utf8", 20, 20 + jsonLength));
  const start = 20 + jsonLength + 8;
  const read = (index) => {
    const accessor = json.accessors[index], view = json.bufferViews[accessor.bufferView], at = start + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const size = { SCALAR: 1, VEC3: 3, VEC4: 4 }[accessor.type], out = new Float32Array(accessor.count * size), stride = view.byteStride ?? size * 4;
    for (let i = 0; i < accessor.count; i++) for (let k = 0; k < size; k++) out[i * size + k] = data.readFloatLE(at + i * stride + k * 4);
    return out;
  };
  return { json, read };
}

const multiply = (a, b) => {
  const out = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
};

function compose([tx, ty, tz], [x, y, z, w], [sx, sy, sz]) {
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return Float64Array.of((1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0, 2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0, 2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0, tx, ty, tz, 1);
}

function createTrack(glb, animation) {
  const tracks = new Map();
  let duration = 0;
  for (const channel of animation.channels) {
    const sampler = animation.samplers[channel.sampler], times = glb.read(sampler.input), values = glb.read(sampler.output);
    duration = Math.max(duration, times[times.length - 1]);
    if (!tracks.has(channel.target.node)) tracks.set(channel.target.node, {});
    tracks.get(channel.target.node)[channel.target.path] = { times, values, size: channel.target.path === "rotation" ? 4 : 3 };
  }
  return { tracks, duration };
}

function sampleTrack({ times, values, size }, t) {
  let next = times.findIndex((time) => time > t);
  if (next < 0) return Array.from(values.subarray(values.length - size));
  if (next === 0) return Array.from(values.subarray(0, size));
  const from = next - 1, u = (t - times[from]) / (times[next] - times[from]), a = values.subarray(from * size, from * size + size), b = values.subarray(next * size, next * size + size);
  const sign = size === 4 && a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1, out = Array.from(a, (value, k) => value + (b[k] * sign - value) * u);
  if (size !== 4) return out;
  const length = Math.hypot(...out);
  return out.map((value) => value / length);
}

function worldOf(glb, track, t) {
  const { nodes, scenes, scene } = glb.json, world = new Map();
  const visit = (index, parent) => {
    const node = nodes[index], parts = track?.tracks.get(index), place = compose(parts?.translation ? sampleTrack(parts.translation, t) : (node.translation ?? [0, 0, 0]), parts?.rotation ? sampleTrack(parts.rotation, t) : (node.rotation ?? [0, 0, 0, 1]), parts?.scale ? sampleTrack(parts.scale, t) : (node.scale ?? [1, 1, 1]));
    const matrix = parent ? multiply(parent, place) : place;
    world.set(node.name, matrix);
    for (const child of node.children ?? []) visit(child, matrix);
  };
  for (const root of scenes[scene ?? 0].nodes) visit(root, null);
  return world;
}

const place = (matrix) => [matrix[12], matrix[13], matrix[14]];
/** A direction carried by a joint's turning. */
const turn = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2], m[1] * v[0] + m[5] * v[1] + m[9] * v[2], m[2] * v[0] + m[6] * v[1] + m[10] * v[2]];
/** The same, back the other way, for a joint that only turns. */
const unturn = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[4] * v[0] + m[5] * v[1] + m[6] * v[2], m[8] * v[0] + m[9] * v[1] + m[10] * v[2]];
const minus = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit = (a) => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

const [source, rootMotion, out] = process.argv.slice(2), glb = readGlb(source), moving = readGlb(rootMotion);
const animations = glb.json.animations, poseName = animations.find((animation) => animation.name === "A_TPose");
const restMatrices = worldOf(glb, createTrack(glb, poseName), 0), rest = new Map([...restMatrices].map(([name, matrix]) => [name, place(matrix)])), up = [0, 1, 0];
// the pack's character looks along its toes, whichever way the file happens to have it
const toes = unit(minus(rest.get("ball_l"), rest.get("foot_l"))), ahead = unit([toes[0], 0, toes[2]]), right = cross(up, ahead), stands = dot(rest.get("pelvis"), up);
const inBody = (v) => [dot(v, ahead), dot(v, right), dot(v, up)];
const thighRight = dot(minus(rest.get("thigh_r"), rest.get("thigh_l")), right);
const side = thighRight > 0 ? 1 : -1; // the body's own right has to come out on the +side
const toBody = (v) => {
  const [f, s, h] = inBody(v);
  return [f, s * side, h];
};
const round = (value) => Math.round(value * DIGITS) / DIGITS;
const scaleOf = (m) => Math.hypot(m[0], m[1], m[2]) || 1;
// the way a joint faces, held in its own terms: what's "ahead" for it standing at rest stays ahead for it however it turns
const restAim = (name) => {
  const matrix = restMatrices.get(name), scale = scaleOf(matrix);
  return unturn(matrix, ahead).map((value) => value / (scale * scale));
};

const clips = {};
for (const animation of animations) {
  if (!KEEP.includes(animation.name)) continue;
  const track = createTrack(glb, animation), frames = Math.max(1, Math.round(track.duration * FPS)), data = [];
  for (let frame = 0; frame < frames; frame++) {
    const matrices = worldOf(glb, track, (frame / frames) * track.duration), world = new Map([...matrices].map(([name, matrix]) => [name, place(matrix)])), pelvis = toBody(world.get("pelvis"));
    data.push(round(pelvis[0] / stands), round(pelvis[1] / stands), round(pelvis[2] / stands));
    for (const [from, to] of BONES) data.push(...unit(toBody(to === AIM ? turn(matrices.get(from), restAim(from)) : minus(world.get(to), world.get(from)))).map(round));
  }
  // how fast the pack's character really travels doing this, in pelvis heights a second
  const twin = moving.json.animations.find((other) => other.name === animation.name), twinTrack = createTrack(moving, twin), start = place(worldOf(moving, twinTrack, 0).get("root")), end = place(worldOf(moving, twinTrack, twinTrack.duration).get("root"));
  clips[animation.name] = { length: round(track.duration), speed: round(Math.hypot(end[0] - start[0], end[2] - start[2]) / track.duration / stands), frames, data };
}
writeFileSync(out, JSON.stringify(clips));
console.log(Object.entries(clips).map(([name, clip]) => `${name}: ${clip.frames}f ${clip.length}s speed ${clip.speed}`).join("\n"));

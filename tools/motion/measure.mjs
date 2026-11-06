// Measures a real body from a rigged model, so that a character's build comes from anatomy and not from a guess: the length of every
// bone, and how thick the flesh is along it, as shares of the body's height. Run it with:
//   node tools/motion/measure.mjs <model.gltf> <hair.gltf> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const STATIONS = 5; // places along a limb where its thickness is taken
const DIGITS = 1000;
const PICK_THICK = 0.97; // of the flesh round a station that counts: a stray vertex shouldn't set the width
const TRUNK_SLICES = 12, HEAD_SLICES = 9, HAIR_SLICES = 10;

const [source, hairSource, out] = process.argv.slice(2);
function openModel(path) {
  const json = JSON.parse(readFileSync(path, "utf8")), buffers = json.buffers.map((buffer) => (buffer.uri.startsWith("data:") ? Buffer.from(buffer.uri.split(",")[1], "base64") : readFileSync(join(dirname(path), buffer.uri))));
  const read = (index) => {
    const accessor = json.accessors[index], view = json.bufferViews[accessor.bufferView], data = buffers[view.buffer], start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[accessor.type], type = accessor.componentType, bytes = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[type], stride = view.byteStride ?? size * bytes, result = new Float64Array(accessor.count * size);
    const get = { 5121: (at) => data.readUInt8(at), 5123: (at) => data.readUInt16LE(at), 5125: (at) => data.readUInt32LE(at), 5126: (at) => data.readFloatLE(at) }[type], scale = accessor.normalized && type !== 5126 ? 1 / (2 ** (bytes * 8) - 1) : 1;
    for (let i = 0; i < accessor.count; i++) for (let k = 0; k < size; k++) result[i * size + k] = get(start + i * stride + k * bytes) * scale;
    return result;
  };
  return { json, read };
}
/** Where a joint is, from the matrix that takes the mesh to it. */
function placeOf(m) {
  const [a, b, c, d, e, f, g, h, i] = [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]], x = -m[12], y = -m[13], z = -m[14];
  const A = e * i - f * h, B = f * g - d * i, C = d * h - e * g, det = a * A + b * B + c * C;
  return [(A * x + (c * h - b * i) * y + (b * f - c * e) * z) / det, (B * x + (a * i - c * g) * y + (c * d - a * f) * z) / det, (C * x + (b * g - a * h) * y + (a * e - b * d) * z) / det];
}

function fleshOf({ json, read }) {
  const skin = json.skins[0], names = skin.joints.map((node) => json.nodes[node].name), flesh = [];
  for (const mesh of json.meshes)
    for (const primitive of mesh.primitives) {
      const positions = read(primitive.attributes.POSITION), bones = read(primitive.attributes.JOINTS_0), weights = read(primitive.attributes.WEIGHTS_0);
      for (let v = 0; v < positions.length / 3; v++) {
        let best = 0;
        for (let k = 1; k < 4; k++) if (weights[v * 4 + k] > weights[v * 4 + best]) best = k;
        flesh.push({ point: [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]], bone: names[bones[v * 4 + best]] });
      }
    }
  return flesh;
}

const model = openModel(source), skin = model.json.skins[0], matrices = model.read(skin.inverseBindMatrices), names = skin.joints.map((node) => model.json.nodes[node].name), joints = new Map(names.map((name, i) => [name, placeOf(matrices.subarray(i * 16, i * 16 + 16))]));
const flesh = fleshOf(model), hairFlesh = fleshOf(openModel(hairSource));
const minus = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], size = (a) => Math.hypot(a[0], a[1], a[2]), unit = (a) => a.map((value) => value / size(a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const heights = flesh.map(({ point }) => point[1]), height = Math.max(...heights) - Math.min(...heights), floor = Math.min(...heights), up = [0, 1, 0];
const toes = unit(minus(joints.get("ball_l"), joints.get("foot_l"))), ahead = unit([toes[0], 0, toes[2]]), right = cross(up, ahead);
const share = (value) => Math.round((value / height) * DIGITS) / DIGITS;
const length = (from, to) => share(size(minus(joints.get(to), joints.get(from))));
const spread = (values) => {
  const sorted = values.map(Math.abs).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * PICK_THICK))] : 0;
};

/** How thick the flesh on `bones` is along a line, across the body and front to back, at each station. */
function thickness(from, to, bones, across = right, pool = flesh) {
  const start = joints.get(from), axis = minus(joints.get(to), start), long = size(axis), along = unit(axis), side = unit(minus(across, along.map((v) => v * dot(across, along)))), depth = cross(along, side), stations = Array.from({ length: STATIONS }, () => ({ sides: [], depths: [] }));
  for (const { point, bone } of pool) {
    if (!bones.includes(bone)) continue;
    const off = minus(point, start), u = dot(off, along) / long;
    if (u < -0.1 || u > 1.1) continue;
    const station = stations[Math.min(STATIONS - 1, Math.max(0, Math.round(u * (STATIONS - 1))))];
    station.sides.push(dot(off, side));
    station.depths.push(dot(off, depth));
  }
  return stations.map(({ sides, depths }) => [share(spread(sides)), share(spread(depths))]);
}

/** Flesh cut into level slices between two heights: for each, where it lies, half its width, half its depth, and how far forward its middle is. */
function slices(points, low, high, count, from) {
  return Array.from({ length: count }, (_, n) => {
    const level = low + ((high - low) * n) / (count - 1), band = (high - low) / (count - 1) / 1.5, offs = points.filter((point) => Math.abs(point[1] - level) <= band).map((point) => minus(point, from));
    const sides = offs.map((off) => dot(off, right)), depths = offs.map((off) => dot(off, ahead));
    if (!offs.length) return [level, 0, 0, 0];
    const front = Math.max(...depths), back = Math.min(...depths), left = Math.min(...sides), rightmost = Math.max(...sides);
    return [level, share((rightmost - left) / 2), share((front - back) / 2), share((front + back) / 2)];
  });
}

const isArm = (bone) => /arm|hand|index|middle|ring|pinky|thumb|Head/.test(bone);
const isHead = (bone) => bone === "Head" || bone === "neck_01";
const spine = { pelvis: joints.get("pelvis"), chest: joints.get("spine_03"), neck: joints.get("neck_01"), head: joints.get("Head") };
// the crotch: where flesh stops on the body's middle line
const crotch = Math.min(...flesh.filter(({ point, bone }) => !isArm(bone) && Math.abs(dot(minus(point, spine.pelvis), right)) < height * 0.008).map(({ point }) => point[1]));
const alongSpine = (level) => (level <= spine.chest[1] ? (level - spine.pelvis[1]) / (spine.chest[1] - spine.pelvis[1]) : 1 + (level - spine.chest[1]) / (spine.neck[1] - spine.chest[1]));
const trunk = slices(flesh.filter(({ bone }) => !isArm(bone)).map(({ point }) => point), crotch, spine.neck[1], TRUNK_SLICES, spine.pelvis).map(([level, ...sizes]) => [Math.round(alongSpine(level) * DIGITS) / DIGITS, ...sizes]);
const skullPoints = flesh.filter(({ bone }) => isHead(bone)).map(({ point }) => point), top = Math.max(...heights), chin = Math.min(...skullPoints.map((point) => point[1]));
const skull = slices(skullPoints, chin, top, HEAD_SLICES, spine.head).map(([level, ...sizes]) => [share(level - spine.head[1]), ...sizes]);
const hairPoints = hairFlesh.map(({ point }) => point), hairLow = Math.min(...hairPoints.map((point) => point[1])), hairHigh = Math.max(...hairPoints.map((point) => point[1]));
const hair = slices(hairPoints, hairLow, hairHigh, HAIR_SLICES, spine.head).map(([level, ...sizes]) => [share(level - spine.head[1]), ...sizes]);

const body = {
  thigh: length("thigh_l", "calf_l"), shin: length("calf_l", "foot_l"), ankle: share(joints.get("foot_l")[1] - floor), foot: share(size(minus(joints.get("ball_leaf_l") ?? joints.get("ball_l"), joints.get("foot_l")))),
  spine: length("pelvis", "spine_03"), neck: length("spine_03", "Head"), shoulder: length("spine_03", "upperarm_l"), hip: length("pelvis", "thigh_l"),
  upperArm: length("upperarm_l", "lowerarm_l"), forearm: length("lowerarm_l", "hand_l"), hand: length("hand_l", "middle_01_l"),
  headRadius: 0, headHigh: share(Math.max(...heights) - joints.get("Head")[1]),
  trunk, skull, hair, neckAt: Math.round((size(minus(spine.neck, spine.chest)) / size(minus(spine.head, spine.chest))) * DIGITS) / DIGITS,
  thighs: thickness("thigh_l", "calf_l", ["thigh_l"]), shins: thickness("calf_l", "foot_l", ["calf_l"]),
  upperArms: thickness("upperarm_l", "lowerarm_l", ["upperarm_l"], [0, 1, 0]), forearms: thickness("lowerarm_l", "hand_l", ["lowerarm_l"], [0, 1, 0]),
  neckThick: thickness("neck_01", "Head", ["neck_01"]).map(([side]) => side).reduce((a, b) => Math.max(a, b)),
};
const headFlesh = flesh.filter(({ bone }) => bone === "Head"), head = joints.get("Head");
body.headRadius = share(Math.max(...headFlesh.map(({ point }) => Math.abs(dot(minus(point, head), right)))));
body.headDeep = share(Math.max(...headFlesh.map(({ point }) => Math.abs(dot(minus(point, head), ahead)))));
writeFileSync(out, JSON.stringify(body, null, 1));

console.log(`height ${height.toFixed(3)} joints ${names.length} vertices ${flesh.length}`);
console.log(JSON.stringify(body));

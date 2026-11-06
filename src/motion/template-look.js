import { gripOf } from "./draw.js";

// The template body: no anatomy, no rigid parts. Every pixel is decided once, by whichever part is nearest, so the body is a single shape
// with colored regions and no lines inside it. A limb pointing at the camera gets shorter and fatter, the way one drawn by hand does.
const SHOULDER_CAP = 2.2; // px above the chest, on a body 28 tall, that a shoulder can rise: where they sit standing, so only a shrug in a run is cut
const HEAD_LEAN = 0.3; // how much of the head's place comes from the neck; the rest follows the trunk, so it stays on the body when the body lies down or tumbles
const FACE_EDGE = 0.4; // how far a point of the head may turn from where it looks and still be face: lower is a bigger face
const MOST_FAT = 0.4; // how much fatter a limb gets when it points straight at the camera
const BEND = 0.35; // how much of each bone, from the joint, takes part in the curve that replaces the joint
const CURVE_STEPS = 4;
const SOFT = 1.2; // px on a body 28 tall: how wide the bones of one limb melt into each other
const OVER = 0.8; // px nearer than what they're put on, for pieces worn over the body
const CARRY_LEAN = 0.3; // how far forward of upright a long weapon is carried
const CARRY_ACROSS = 0.55; // how far across the body one held in both hands slants
const READY_OUT = 5.5, READY_SIDE = 2, READY_DROP = 3; // px on a body 28 tall: where the weapon hand waits, from the chest: forward, to its own side, down
const ELBOW_OUT = 0.7; // how much elbows go outwards as well as down when hands hold something
const SHIELD_LEAN = 0.6; // how far round a shield turns from the way he faces to the side it's carried on
const SHIELD_OUT = 1.2, SHIELD_STEP = 0.4, RIM = 0.72, BOSS = 0.12; // px on a body 28 tall out from the arm; px between the points laid; where on it, as a share of its size, rim and boss begin
const BEARD_LINE = -0.12; // how far down the head, as seen level, a face turns to beard
const SHADE = 0.3; // of a shape, along its lower left, that's a step darker

function createCanvas(size) {
  return { size, originX: size >> 1, originY: Math.round(size * 0.82), near: new Float32Array(size * size), color: new Uint32Array(size * size), used: new Uint8Array(size * size) };
}
const canvases = new Map();

/** A shape between two screen points, as near as `nearness`. Only what's nearer than what's already there shows. */
function lay(canvas, a, b, ra, rb, nearA, nearB, colors) {
  const { size, originX, originY, near, color, used } = canvas, reach = Math.max(ra, rb) + 1, dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy || 1e-6;
  const x0 = Math.max(-originX, Math.floor(Math.min(a[0], b[0]) - reach)), x1 = Math.min(size - originX - 1, Math.ceil(Math.max(a[0], b[0]) + reach)), y0 = Math.max(-originY, Math.floor(Math.min(a[1], b[1]) - reach)), y1 = Math.min(size - originY - 1, Math.ceil(Math.max(a[1], b[1]) + reach));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5 - a[0], py = y + 0.5 - a[1], u = Math.min(1, Math.max(0, (px * dx + py * dy) / length2)), r = ra + (rb - ra) * u, ex = px - dx * u, ey = py - dy * u, d2 = ex * ex + ey * ey;
      if (d2 > r * r) continue;
      const z = nearA + (nearB - nearA) * u, at = (y + originY) * size + x + originX;
      if (used[at] && near[at] >= z) continue;
      near[at] = z;
      used[at] = 1;
      color[at] = colors[(-ex + ey * 0.7) / Math.max(r, 0.5) > 1 - SHADE * 2 ? 1 : 0];
    }
}

/** One flat triangle of a sheet, on screen, with the nearness of each corner. */
function layTriangle(canvas, a, b, c, tone) {
  const { size, originX, originY, near, color, used } = canvas, area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (Math.abs(area) < 1e-3) return;
  const x0 = Math.max(-originX, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(size - originX - 1, Math.ceil(Math.max(a[0], b[0], c[0]))), y0 = Math.max(-originY, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(size - originY - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5, wb = ((px - a[0]) * (c[1] - a[1]) - (py - a[1]) * (c[0] - a[0])) / area, wc = ((b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0])) / area, wa = 1 - wb - wc;
      if (wa < 0 || wb < 0 || wc < 0) continue;
      const z = a[2] * wa + b[2] * wb + c[2] * wc, at = (y + originY) * size + x + originX;
      if (used[at] && near[at] >= z) continue;
      near[at] = z;
      used[at] = 1;
      color[at] = tone;
    }
}

/** A cape as what it is, a thin sheet: flat between its strands, and darker on every other fold. */
function layCape(canvas, strands, screen, colors) {
  const corner = (node) => [...screen([node.x, node.z, node.h]), node.z];
  for (let column = 0; column < strands.length - 1; column++)
    for (let row = 0; row < strands[column].length - 1; row++) {
      const a = corner(strands[column][row]), b = corner(strands[column + 1][row]), c = corner(strands[column][row + 1]), d = corner(strands[column + 1][row + 1]), tone = colors[column % 2];
      layTriangle(canvas, a, b, c, tone);
      layTriangle(canvas, b, d, c, tone);
    }
}

/** A shield as a flat plate on the forearm, turned out to the side it's on, foreshortened as it turns. */
function layShield(canvas, shield, center, facing, side, screen, k, regions) {
  const { size, originX, originY, near, color, used } = canvas, length = Math.hypot(facing[0] + side[0] * SHIELD_LEAN, facing[1] + side[1] * SHIELD_LEAN) || 1;
  const out = [(facing[0] + side[0] * SHIELD_LEAN) / length, (facing[1] + side[1] * SHIELD_LEAN) / length], across = [-out[1], out[0]], middle = [center[0] + out[0] * SHIELD_OUT * k, center[1] + out[1] * SHIELD_OUT * k, center[2]], wide = shield.wide * k, tall = shield.tall * k, power = shield.square ? 4 : 2;
  for (let u = -wide; u <= wide; u += SHIELD_STEP)
    for (let v = -tall; v <= tall; v += SHIELD_STEP) {
      const reach = Math.abs(u / wide) ** power + Math.abs(v / tall) ** power;
      if (reach > 1) continue;
      const point = [middle[0] + across[0] * u, middle[1] + across[1] * u, middle[2] + v], [sx, sy] = screen(point), x = Math.floor(sx), y = Math.floor(sy);
      if (x < -originX || x >= size - originX || y < -originY || y >= size - originY) continue;
      const at = (y + originY) * size + x + originX, z = point[1] + OVER;
      if (used[at] && near[at] > z) continue;
      near[at] = z;
      used[at] = 1;
      color[at] = regions[reach < BOSS ? shield.boss : reach > RIM ? shield.rim : shield.colors][v < 0 ? 1 : 0];
    }
}

const mixNode = (a, b, u) => a.map((part, i) => part + (b[i] - part) * u);

/** Two bones as one line that runs through a curve where they meet, instead of turning on a joint. Nodes are [x, y, nearness, radius]. */
function curve(start, joint, end, colorsA, colorsB) {
  const from = mixNode(joint, start, BEND), to = mixNode(joint, end, BEND), segments = [[start, from, colorsA]];
  let last = from;
  for (let step = 1; step <= CURVE_STEPS; step++) {
    const u = step / CURVE_STEPS, next = mixNode(mixNode(from, joint, u), mixNode(joint, to, u), u);
    segments.push([last, next, u <= 0.5 ? colorsA : colorsB]);
    last = next;
  }
  segments.push([to, end, colorsB]);
  return segments;
}

/** Segments in a row as one shape. Those of one color are one bone; where bones meet they melt together by `soft` px. */
function layLine(canvas, segments, soft) {
  const { size, originX, originY, near, color, used } = canvas, nodes = segments.flatMap(([a, b]) => [a, b]), reach = Math.max(...nodes.map((node) => node[3])) + soft + 1;
  const x0 = Math.max(-originX, Math.floor(Math.min(...nodes.map((node) => node[0])) - reach)), x1 = Math.min(size - originX - 1, Math.ceil(Math.max(...nodes.map((node) => node[0])) + reach));
  const y0 = Math.max(-originY, Math.floor(Math.min(...nodes.map((node) => node[1])) - reach)), y1 = Math.min(size - originY - 1, Math.ceil(Math.max(...nodes.map((node) => node[1])) + reach));
  const melt = (a, b) => {
    const h = Math.max(soft - Math.abs(a - b), 0) / soft;
    return Math.min(a, b) - (h * h * soft) / 4;
  };
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      let field = Infinity, bone = Infinity, boneColors = null, inside = false, bestZ = 0, closest = Infinity, ownColors = null, shade = 0;
      for (let n = 0; n < segments.length; n++) {
        const segment = segments[n], a = segment[0], b = segment[1], colors = segment[2];
        if (colors !== boneColors) {
          field = boneColors ? melt(field, bone) : bone;
          bone = Infinity;
          boneColors = colors;
        }
        const dx = b[0] - a[0], dy = b[1] - a[1], px = x + 0.5 - a[0], py = y + 0.5 - a[1], u = Math.min(1, Math.max(0, (px * dx + py * dy) / (dx * dx + dy * dy || 1e-6))), r = a[3] + (b[3] - a[3]) * u, ex = px - dx * u, ey = py - dy * u, d = Math.sqrt(ex * ex + ey * ey) - r, z = a[2] + (b[2] - a[2]) * u;
        bone = Math.min(bone, d);
        // of what covers this pixel the nearest shows, so a folded knee keeps the shin in front of the thigh or behind it
        if (d <= 0 ? !inside || z > bestZ : !inside && d < closest) {
          if (d <= 0) inside = true;
          closest = d;
          bestZ = z;
          ownColors = colors;
          shade = (-ex + ey * 0.7) / Math.max(r, 0.5);
        }
      }
      if (melt(field, bone) > 0) continue;
      const at = (y + originY) * size + x + originX;
      if (used[at] && near[at] >= bestZ) continue;
      near[at] = bestZ;
      used[at] = 1;
      color[at] = ownColors[shade > 1 - SHADE * 2 ? 1 : 0];
    }
}

/** The head as a ball seen from the floor's slant: whatever part of it turns towards `aim` is face, the rest is the back of the head. */
function layHead(canvas, center, r, z, aim, slant, back, face, beard) {
  const { size, originX, originY, near, color, used } = canvas, level = Math.sqrt(1 - slant * slant), reach = Math.ceil(r);
  for (let y = Math.max(-originY, center[1] - reach); y <= Math.min(size - originY - 1, center[1] + reach); y++)
    for (let x = Math.max(-originX, center[0] - reach); x <= Math.min(size - originX - 1, center[0] + reach); x++) {
      const across = (x + 0.5 - center[0]) / r, down = (y + 0.5 - center[1]) / r, d2 = across * across + down * down, at = (y + originY) * size + x + originX;
      if (d2 > 1 || (used[at] && near[at] >= z)) continue;
      const out = Math.sqrt(1 - d2), rises = out * slant - down * level, looks = across * aim[0] + (down * slant + out * level) * aim[1] + rises * aim[2];
      near[at] = z;
      used[at] = 1;
      color[at] = (looks > FACE_EDGE ? (beard && rises < BEARD_LINE ? beard : face) : back)[-across + down * 0.7 > 1 - SHADE * 2 ? 1 : 0];
    }
}

const towards = (from, to) => {
  const way = [to[0] - from[0], to[1] - from[1], to[2] - from[2]], length = Math.hypot(...way) || 1;
  return way.map((part) => part / length);
};

const between = (a, b, u) => a.map((part, i) => part + (b[i] - part) * u);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Inverse kinematics for a limb of two bones: puts its end on `target`, as near as it reaches, with the joint bent towards `pole`. */
function twoBone(root, target, upper, fore, pole) {
  const way = towards(root, target), distance = Math.min(Math.hypot(target[0] - root[0], target[1] - root[1], target[2] - root[2]), (upper + fore) * 0.999), along = (upper * upper - fore * fore + distance * distance) / (2 * distance || 1), out = Math.sqrt(Math.max(upper * upper - along * along, 0));
  const across = dot(pole, way), bend = towards([0, 0, 0], [pole[0] - way[0] * across, pole[1] - way[1] * across, pole[2] - way[2] * across]);
  return {
    elbow: [root[0] + way[0] * along + bend[0] * out, root[1] + way[1] * along + bend[1] * out, root[2] + way[2] * along + bend[2] * out],
    wrist: [root[0] + way[0] * distance, root[1] + way[1] * distance, root[2] + way[2] * distance],
  };
}

/** A body in a look from src/motion/looks: its shape, its colors, what it carries and what it wears. Look colors are ready to put. */
export function drawTemplate(p, joints, body, slant, look, place, armed = false, cape = null, carrying = 0) {
  const { thick: THICK, colors: regions, headRise, weapon, pieces } = look;
  const k = body.height / 28, size = Math.ceil(body.height * 2.4), { pelvis, chest, head } = joints;
  const trunk = towards(pelvis, chest), neck = towards(chest, head), up = towards([0, 0, 0], trunk.map((part, i) => part + (neck[i] - part) * HEAD_LEAN));
  const rise = THICK.head * k * headRise, top = [chest[0] + up[0] * rise, chest[1] + up[1] * rise, chest[2] + up[2] * rise];
  // whatever part of him is lowest is on the floor, whether that's a foot or, in a roll, his head: the clip's leaps were made for longer legs
  const lowest = Math.min(
    ...joints.legs.flatMap(({ knee, ankle, toe }) => [knee[2] - THICK.shinTop * k, ankle[2] - body.ankle, toe[2]]),
    ...joints.arms.flatMap(({ elbow, wrist }) => [elbow[2] - THICK.upperArmEnd * k, wrist[2] - THICK.forearmEnd * k]),
    pelvis[2] - THICK.hips * k, chest[2] - THICK.chest * k, top[2] - THICK.head * k,
  );
  const screen = (point) => place([point[0], point[1], point[2] - lowest]);
  if (!canvases.has(size)) canvases.set(size, createCanvas(size));
  const canvas = canvases.get(size);
  canvas.used.fill(0);
  const limb = (from, to, length, ra, rb, colors) => {
    const a = screen(from), b = screen(to), shown = Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.max(length, 0.5), fat = 1 + (1 - Math.min(1, shown)) * MOST_FAT;
    lay(canvas, a, b, ra * k * fat, rb * k * fat, from[1], to[1], colors);
  };
  /** A bone's two ends as nodes, fatter the more it points at the camera. */
  const bone = (from, to, length, ra, rb) => {
    const a = screen(from), b = screen(to), fat = 1 + (1 - Math.min(1, Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.max(length, 0.5))) * MOST_FAT;
    return [[a[0], a[1], from[1], ra * k * fat], [b[0], b[1], to[1], rb * k * fat]];
  };
  /** Two bones running into each other, the joint's radius the mean of theirs. */
  const flow = (a, b, colorsA, colorsB) => curve(a[0], mixNode(a[1], b[0], 0.5), b[1], colorsA, colorsB);
  const waist = between(pelvis, chest, 0.45), shoulderOf = (raised) => [raised[0], raised[1], Math.min(raised[2], chest[2] + SHOULDER_CAP * k)];
  joints.legs.forEach(({ hip, knee, ankle, toe }, side) => {
    const name = side ? "R" : "L", foot = bone(ankle, toe, body.foot, THICK.foot, THICK.foot);
    layLine(canvas, [...flow(bone(hip, knee, body.thigh, THICK.thighTop, THICK.thighEnd), bone(knee, ankle, body.shin, THICK.shinTop, THICK.shinEnd), regions[`thigh${name}`], regions[`shin${name}`]), [foot[0], foot[1], regions[`foot${name}`]]], SOFT * k);
  });
  layLine(canvas, flow(bone(pelvis, waist, body.spine * 0.45, THICK.hips, THICK.waist), bone(waist, chest, body.spine * 0.55, THICK.waist, THICK.chest), regions.hips, regions.chest), SOFT * k);
  const facing = [Math.cos(joints.chestYaw), Math.sin(joints.chestYaw)], leftward = towards(chest, shoulderOf(joints.arms[0].shoulder)), flat = Math.hypot(leftward[0], leftward[1]) || 1, left = [leftward[0] / flat, leftward[1] / flat];
  let arms = joints.arms, from, way, tip, long;
  if (armed) {
    // long weapons are carried; a blow takes them back into the clip. Held in both hands, the other hand finds its place on the shaft by itself
    const bothHands = weapon.hands === 2 && !look.shield, holding = carrying * (weapon.carry ?? 0), { from: clipHand, way: held } = gripOf(joints.arms[1]).blade, across = bothHands ? CARRY_ACROSS : 0;
    const carried = towards([0, 0, 0], [facing[0] * CARRY_LEAN + left[0] * across, facing[1] * CARRY_LEAN + left[1] * across, 1]), ready = [chest[0] + (facing[0] * READY_OUT - left[0] * READY_SIDE) * k, chest[1] + (facing[1] * READY_OUT - left[1] * READY_SIDE) * k, chest[2] - READY_DROP * k];
    const hand = bothHands ? between(clipHand, ready, holding) : clipHand;
    way = towards([0, 0, 0], between(held, carried, holding));
    long = weapon.long * k;
    const below = long * (weapon.grip ?? 0);
    from = [hand[0] - way[0] * below, hand[1] - way[1] * below, hand[2] - way[2] * below];
    tip = [from[0] + way[0] * long, from[1] + way[1] * long, from[2] + way[2] * long];
    if (bothHands) {
      const [armL, armR] = joints.arms, lean = (side) => [side[0] * ELBOW_OUT, side[1] * ELBOW_OUT, -1];
      const onShaft = twoBone(shoulderOf(armL.shoulder), between(from, tip, weapon.second), body.upperArm, body.forearm, lean(left));
      const weaponArm = twoBone(shoulderOf(armR.shoulder), hand, body.upperArm, body.forearm, lean([-left[0], -left[1]]));
      arms = [{ ...armL, ...onShaft }, { ...armR, elbow: between(armR.elbow, weaponArm.elbow, holding), wrist: between(armR.wrist, weaponArm.wrist, holding) }];
    }
  }
  arms.forEach(({ shoulder: raised, elbow, wrist }, side) => {
    const name = side ? "R" : "L", shoulder = shoulderOf(raised);
    layLine(canvas, flow(bone(shoulder, elbow, body.upperArm, THICK.upperArmTop, THICK.upperArmEnd), bone(elbow, wrist, body.forearm, THICK.forearmTop, THICK.forearmEnd), regions[`upperArm${name}`], regions[`forearm${name}`]), SOFT * k);
  });
  const [armL, armR] = arms, worn = { pelvis, waist, chest, shoulderL: shoulderOf(armL.shoulder), shoulderR: shoulderOf(armR.shoulder), elbowL: armL.elbow, elbowR: armR.elbow, wristL: armL.wrist, wristR: armR.wrist };
  for (const piece of pieces) {
    const a = between(worn[piece.from], worn[piece.to], piece.start), b = between(worn[piece.from], worn[piece.to], piece.end);
    const [[partA, timesA], [partB, timesB]] = piece.size, over = piece.over ?? OVER;
    // whole px, as the head is: a small shape that lands between px changes outline every frame and looks like it's shivering
    lay(canvas, screen(a).map(Math.round), screen(b).map(Math.round), THICK[partA] * timesA * k, THICK[partB] * timesB * k, a[1] + over, b[1] + over, regions[piece.colors]);
  }
  if (cape && look.cape) layCape(canvas, cape.strands, screen, regions[look.cape]);
  if (look.shield) layShield(canvas, look.shield, between(armL.wrist, armL.elbow, 0.35), facing, left, screen, k, regions);
  if (armed) {
    limb(from, tip, long, weapon.thick[0], weapon.thick[1], regions[weapon.colors]);
    if (weapon.blade) {
      // the blade stands off the shaft towards the way he faces, so it turns with him and thins when seen edge on
      const { wide, from: narrow, to: broad, colors } = weapon.blade, along = facing[0] * way[0] + facing[1] * way[1], side = towards([0, 0, 0], [facing[0] - way[0] * along, facing[1] - way[1] * along, -way[2] * along]);
      const seat = between(from, tip, 0.88), edge = [seat[0] + side[0] * wide * k, seat[1] + side[1] * wide * k, seat[2] + side[2] * wide * k];
      lay(canvas, screen(seat).map(Math.round), screen(edge).map(Math.round), narrow * k, broad * k, tip[1], edge[1], regions[colors]);
    }
  }
  layHead(canvas, screen(top).map(Math.round), THICK.head * k, top[1], towards([0, 0, 0], joints.headAim), slant, regions.head, regions.face, regions.beard);

  const { size: wide, originX, originY, used, color } = canvas;
  for (let y = 0; y < wide; y++)
    for (let x = 0; x < wide; x++) if (used[y * wide + x]) p.put(p.tx + x - originX, p.ty + y - originY, color[y * wide + x]);
}

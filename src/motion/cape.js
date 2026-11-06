// A cape: a few strands of linked points hung from the shoulders, thrown about by how the body moves and by the wind.
const COLUMNS = 3, ROWS = 5;
const BACK = 3.6, WIDE = 4.6, SEGMENT = 5.4, FLARE = 0.16; // px on a body 38 tall
const DAMP = 0.955, RUSH = 1.5, GRAVITY = 340, PASSES = 3;
const DRAG = 30, FLUTTER = 14;

function pull(a, b, length, pinned) {
  const dx = b.x - a.x, dz = b.z - a.z, dh = b.h - a.h, d = Math.hypot(dx, dz, dh) || 1e-6, k = (d - length) / d, share = pinned ? 1 : 0.5;
  b.x -= dx * k * share;
  b.z -= dz * k * share;
  b.h -= dh * k * share;
  if (pinned) return;
  a.x += dx * k * share;
  a.z += dz * k * share;
  a.h += dh * k * share;
}

export function createCape(scale) {
  const back = BACK * scale, wide = WIDE * scale, segment = SEGMENT * scale, strands = [];
  let t = 0, seeded = false;
  return {
    strands,
    /** chest: where it hangs from. vx, vz: how the body moves. windX, windZ: px/s² of push. */
    update(dt, chest, facing, vx, vz, windX, windZ) {
      t += dt;
      const fx = Math.cos(facing), fz = Math.sin(facing), gust = Math.sin(t * 2.3) * FLUTTER, dt2 = dt * dt, topH = chest[2] + 2 * scale;
      if (!seeded) {
        seeded = true;
        for (let c = 0; c < COLUMNS; c++) {
          const strand = [];
          for (let r = 0; r < ROWS; r++) {
            const side = (c - 1) * wide, x = chest[0] - fx * back - fz * side, z = chest[1] - fz * back + fx * side, h = topH - r * segment;
            strand.push({ x, z, h, px: x, pz: z, ph: h });
          }
          strands.push(strand);
        }
      }
      const blowX = -vx * RUSH - fx * DRAG - fz * gust + windX, blowZ = -vz * RUSH - fz * DRAG + fx * gust + windZ;
      strands.forEach((strand, c) => {
        const top = strand[0], side = (c - 1) * wide;
        top.x = chest[0] - fx * back - fz * side;
        top.z = chest[1] - fz * back + fx * side;
        top.h = topH;
        for (let r = 1; r < ROWS; r++) {
          const n = strand[r], x = n.x, z = n.z, h = n.h;
          n.x += (x - n.px) * DAMP + blowX * dt2;
          n.z += (z - n.pz) * DAMP + blowZ * dt2;
          n.h += (h - n.ph) * DAMP - GRAVITY * dt2;
          n.px = x;
          n.pz = z;
          n.ph = h;
        }
      });
      for (let pass = 0; pass < PASSES; pass++) {
        for (const strand of strands) for (let r = 1; r < ROWS; r++) pull(strand[r - 1], strand[r], segment, true);
        for (let r = 1; r < ROWS; r++) for (let c = 1; c < COLUMNS; c++) pull(strands[c - 1][r], strands[c][r], wide * (1 + r * FLARE), false);
      }
      // it can't swing through his back
      for (const strand of strands)
        for (let r = 1; r < ROWS; r++) {
          const n = strand[r], ahead = (n.x - chest[0]) * fx + (n.z - chest[1]) * fz + back;
          if (ahead <= 0) continue;
          n.x -= fx * ahead;
          n.z -= fz * ahead;
          // moved with him, not flung: the next step would read the shove as speed
          n.px -= fx * ahead;
          n.pz -= fz * ahead;
        }
    },
  };
}

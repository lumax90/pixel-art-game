// Draws joints. All it needs of what it draws on is a painter placed at the character's feet. Points are [x, z, h] as in body.js.
const LIGHT_X = -0.6, LIGHT_Y = -0.8;
const UP = 0.92; // the camera looks down, so what stands up is drawn a little shorter

/** Where a point lands on screen, in whole px from the feet. */
export const screen = (point, slant) => [Math.round(point[0]), Math.round(point[1] * slant - point[2] * UP)];

/** The same, between px: for shapes laid pixel by pixel, whose length would flicker if their ends snapped. */
export const screenExact = (point, slant) => [point[0], point[1] * slant - point[2] * UP];

/** A body part as a capsule with its ink, lit from one side. a, b are on screen. */
export function limb(p, a, b, ra, rb, colors, ink) {
  const [ax, ay] = a, [bx, by] = b, reach = Math.max(ra, rb) + 1, dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy || 1e-6;
  const x0 = Math.floor(Math.min(ax, bx) - reach), x1 = Math.ceil(Math.max(ax, bx) + reach), y0 = Math.floor(Math.min(ay, by) - reach), y1 = Math.ceil(Math.max(ay, by) + reach);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5 - ax, py = y + 0.5 - ay, u = Math.min(1, Math.max(0, (px * dx + py * dy) / length2)), r = ra + (rb - ra) * u, ex = px - dx * u, ey = py - dy * u, d2 = ex * ex + ey * ey;
      if (d2 > (r + 1) * (r + 1)) continue;
      if (d2 > r * r) {
        p.put(p.tx + x, p.ty + y, ink);
        continue;
      }
      const lit = (ex * LIGHT_X + ey * LIGHT_Y) / r;
      p.put(p.tx + x, p.ty + y, colors[lit > 0.42 ? 3 : lit > -0.12 ? 2 : lit > -0.62 ? 1 : 0]);
    }
}

/** A list of parts to draw from the back forward. */
export function createParts(p, slant, ink, k) {
  const list = [];
  return {
    bone(depth, a, b, ra, rb, colors) {
      list.push({ depth, draw: () => limb(p, screen(a, slant), screen(b, slant), ra * k, rb * k, colors, ink) });
    },
    put(depth, draw) {
      list.push({ depth, draw });
    },
    drawAll() {
      list.sort((a, b) => a.depth - b.depth);
      for (const part of list) part.draw();
    },
  };
}

/** The way a held blade points: the grip runs along the thumb, across the fingers. */
export function gripOf({ wrist, knuckle, thumb }) {
  const from = [(wrist[0] + knuckle[0]) / 2, (wrist[1] + knuckle[1]) / 2, (wrist[2] + knuckle[2]) / 2], way = [thumb[0] - wrist[0], thumb[1] - wrist[1], thumb[2] - wrist[2]], length = Math.hypot(way[0], way[1], way[2]) || 1;
  return { blade: { from, way: [way[0] / length, way[1] / length, way[2] / length] } };
}

// The air as an effect sees it. The game sends the weather to each worker with every tick, and whatever is affected by wind
// reads it from here. Everything is still until told otherwise, so an effect drawn on its own, in a preview, stands in calm air.
export const air = { x: 0, y: 0, wind: 0, rain: 0, snowCover: 0, phase: 0 };

/** How strong the wind is at a spot, about 1: gusts roll along the way the wind blows. */
export function gustAt(x, y) {
  const length = air.wind || 1, along = (x * air.x + y * air.y) / length, across = (y * air.x - x * air.y) / length;
  return 1 + Math.sin(along * 0.016 - air.phase) * 0.62 + Math.sin(along * 0.041 + across * 0.023 - air.phase * 1.6) * 0.3;
}

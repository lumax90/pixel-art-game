// A page of its own for trying characters written out as pixel maps: they run on the ground, and every frame is laid out below.
import { FRAME_WIDE, REGIONS, RUN } from "./run-frames.js";

const SCALE = 4, FRAMES_A_SECOND = 10;
const GROUND = "#45803f", SPECK = "#35663a", SHADOW = "#2f5a30", FRAME_TALL = RUN[0].length, CELL = FRAME_WIDE + 8;
const stage = document.getElementById("stage"), strip = document.getElementById("strip");

/** A frame on a canvas context, at this place, mirrored if asked. */
function paint(context, rows, left, top, mirrored, size = 1) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const letter = row[x];
      if (letter === ".") continue;
      context.fillStyle = REGIONS[letter];
      context.fillRect(left + (mirrored ? row.length - 1 - x : x) * size, top + y * size, size, size);
    }
  });
}

function fit(canvas, wide, tall, zoom) {
  canvas.width = wide;
  canvas.height = tall;
  canvas.style.width = `${wide * zoom}px`;
}

function drawStrip() {
  fit(strip, CELL * RUN.length, FRAME_TALL + 4, SCALE - 1);
  const context = strip.getContext("2d");
  context.fillStyle = GROUND;
  context.fillRect(0, 0, strip.width, strip.height);
  RUN.forEach((rows, n) => {
    context.fillStyle = n % 2 ? "#3f7a3a" : GROUND;
    context.fillRect(n * CELL, 0, CELL, strip.height);
    paint(context, rows, n * CELL + 4, 2, false);
  });
}

const WIDE = 130, TALL = 64;
fit(stage, WIDE, TALL, SCALE);
const context = stage.getContext("2d");
const specks = Array.from({ length: 70 }, (_, n) => [(n * 37) % WIDE, (n * 53) % TALL]);

function drawStage(frame, offset) {
  context.fillStyle = GROUND;
  context.fillRect(0, 0, WIDE, TALL);
  context.fillStyle = SPECK;
  for (const [x, y] of specks) context.fillRect(((x - offset) % WIDE + WIDE) % WIDE, y, 2, 1);
  for (const [left, mirrored] of [[18, false], [80, true]]) {
    context.fillStyle = SHADOW;
    context.fillRect(left + 4, 42, FRAME_WIDE - 8, 2);
    paint(context, RUN[frame], left, 16, mirrored);
  }
}

const start = performance.now();
function loop(now) {
  const time = (now - start) / 1000;
  drawStage(Math.floor(time * FRAMES_A_SECOND) % RUN.length, Math.floor(time * 60));
  requestAnimationFrame(loop);
}
drawStrip();
requestAnimationFrame(loop);

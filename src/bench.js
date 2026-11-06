// The workbench for characters: the same move seen from all eight sides, on ground that moves with the world, so that a sliding
// foot shows at once. Each character walks for real and the view stays on it. Open /bench.html on the dev server.
import { composite, createFrame, createFx, hex } from "../vendor/pixelfx/src/core/index.js";
import * as knight from "./fx/characters/knight.js";
import * as template from "./fx/characters/template.js";
import { ITEMS, SLOTS } from "./motion/items.js";

const CELL_W = 64, CELL_H = 72, COLUMNS = 4, ZOOM = 3, TICK = 1 / 30, FEET_AT = 60;
const SLANT = 0.55;
const GROUND = hex("#45803f"), SPECK = hex("#35663a"), LIGHT_SPECK = hex("#5a9a50"), LINE = hex("#1c1a24");
const MOVES = [
  ["Dur", 0, 0],
  ["Koş", 125, 0],
  ["Geri", 50, Math.PI],
  ["Sağa", 56, Math.PI / 2],
];
const SPEEDS = [["Normal", 1], ["Yavaş", 0.25]];
const BODIES = [["Şablon", template], ["Eski knight", knight]];
const LOOKS = [["Savaşçı", "warrior"], ["Barbar", "barbarian"], ["Renkli", "template"]];
const SIZES = [28, 32, 36, 40];
const ACTS = [["Saldır", "Sword_Attack"], ["Yumruk", "Punch_Cross"], ["Yumruk 2", "Punch_Jab"], ["Büyü", "Spell_Simple_Shoot"], ["Yuvarlan", "Roll"], ["Darbe al", "Hit_Chest"], ["Öl", "Death01"]];
const DIRECTIONS = Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2);

const canvas = document.getElementById("stage"), context = canvas.getContext("2d"), controls = document.getElementById("controls"), hub = document.getElementById("hub");
canvas.width = CELL_W * COLUMNS;
canvas.height = (CELL_H * DIRECTIONS.length) / COLUMNS;
canvas.style.width = `${canvas.width * ZOOM}px`;

const settings = { move: MOVES[1], speed: 1, body: template, size: 36, look: "barbarian", gear: {} };
let cells = [];

/** What the character is told about what's on it: its items, and whether it has something to fight with. */
function dressed() {
  const armed = !!settings.gear.weapon;
  return { gear: Object.values(settings.gear), sword: armed, stance: armed ? "Sword_Idle" : "Idle_Loop" };
}

/** A row of buttons, one of them on. */
function addChoices(items, isOn, choose) {
  const buttons = items.map(([label, value]) => {
    const button = document.createElement("button");
    button.textContent = label;
    button.onclick = () => {
      choose(value);
      buttons.forEach((other, i) => other.classList.toggle("on", isOn(items[i][1])));
      build();
    };
    button.classList.toggle("on", isOn(value));
    controls.append(button);
    return button;
  });
  controls.append(Object.assign(document.createElement("span"), { className: "gap" }));
}

addChoices(MOVES.map((move) => [move[0], move]), (move) => move === settings.move, (move) => (settings.move = move));
addChoices(SPEEDS, (speed) => speed === settings.speed, (speed) => (settings.speed = speed));
addChoices(BODIES, (body) => body === settings.body, (body) => (settings.body = body));
addChoices(LOOKS, (look) => look === settings.look, (look) => (settings.look = look));
addChoices(SIZES.map((size) => [size + " px", size]), (size) => size === settings.size, (size) => (settings.size = size));

for (const [label, act] of ACTS) {
  const button = document.createElement("button");
  button.textContent = label;
  button.onclick = () => {
    for (const { fx } of cells) Object.assign(fx.options, { act, actId: (fx.options.actId ?? 0) + 1 });
  };
  controls.append(button);
}

/** The equipment: a row for each slot, an item on or off with a click. Changes what's worn on the spot, without starting the moves over. */
for (const slot of SLOTS) {
  const row = document.createElement("div"), name = document.createElement("span");
  row.className = "slot";
  name.textContent = slot.name;
  if (slot.unseen) name.title = "Karakterde görünmez";
  row.append(name);
  const buttons = ITEMS.filter((item) => item.kind === slot.kind).map((item) => {
    const button = document.createElement("button");
    button.textContent = item.name;
    button.onclick = () => {
      if (settings.gear[slot.id] === item.id) delete settings.gear[slot.id];
      else settings.gear[slot.id] = item.id;
      buttons.forEach((other, i) => other.classList.toggle("on", settings.gear[slot.id] === ITEMS.filter(({ kind }) => kind === slot.kind)[i].id));
      for (const { fx } of cells) Object.assign(fx.options, dressed());
    };
    row.append(button);
    return button;
  });
  hub.append(row);
}

function build() {
  cells = DIRECTIONS.map((facing, index) => {
    const frame = createFrame(CELL_W, CELL_H);
    return { facing, index, frame, image: new ImageData(CELL_W, CELL_H), x: 0, y: 0, fx: createFx(settings.body, { x: 0, y: 0, facing, look: settings.look, height: settings.size, ...dressed() }) };
  });
}

/** The ground, fixed to the world: specks stay where they are as the view goes over them. */
function paintGround({ frame }) {
  frame.color.fill(GROUND);
  frame.light.fill(0);
  for (let y = 0; y < CELL_H; y++)
    for (let x = 0; x < CELL_W; x++) {
      const wx = x + frame.ox, wy = y + frame.oy, spot = Math.sin(Math.floor(wx / 3) * 12.9898 + Math.floor(wy / 2) * 78.233) * 43758.5453, pick = spot - Math.floor(spot);
      if (pick < 0.05) frame.color[y * CELL_W + x] = SPECK;
      else if (pick < 0.075) frame.color[y * CELL_W + x] = LIGHT_SPECK;
    }
  for (let x = 0; x < CELL_W; x++) frame.color[x] = LINE;
  for (let y = 0; y < CELL_H; y++) frame.color[y * CELL_W] = LINE;
}

function step(dt) {
  for (const cell of cells) {
    const [, speed, offset] = settings.move, way = cell.facing + offset;
    cell.x += Math.cos(way) * speed * dt;
    cell.y += Math.sin(way) * speed * dt * SLANT;
    Object.assign(cell.fx.options, { x: cell.x, y: cell.y });
    cell.fx.update(dt);
  }
}

function draw() {
  for (const cell of cells) {
    const { frame, image, index } = cell;
    frame.ox = Math.round(cell.x - CELL_W / 2);
    frame.oy = Math.round(cell.y - FEET_AT);
    paintGround(cell);
    cell.fx.draw(frame, "back");
    cell.fx.draw(frame, "front");
    composite(frame, image.data, null);
    context.putImageData(image, (index % COLUMNS) * CELL_W, Math.floor(index / COLUMNS) * CELL_H);
  }
}

// Draws every so many screen refreshes, the whole number that comes nearest the character's rate: anything else spaces frames unevenly and looks like a stutter.
let last = performance.now(), drawnAt = last, refresh = 1 / 60, waited = 0;
function loop(now) {
  refresh += (Math.min((now - last) / 1000, 0.05) - refresh) * 0.05;
  last = now;
  if (++waited >= Math.max(1, Math.round(1 / settings.body.meta.fps / refresh))) {
    waited = 0;
    step(Math.min((now - drawnAt) / 1000, 0.25) * settings.speed);
    drawnAt = now;
    draw();
  }
  requestAnimationFrame(loop);
}

build();
requestAnimationFrame(loop);
Object.assign(window, { benchStep: (n = 1) => { for (let i = 0; i < n; i++) step(TICK); draw(); } });

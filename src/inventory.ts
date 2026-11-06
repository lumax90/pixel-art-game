// The test window for gear: slots round a body above a grid, items dragged between them, and buttons to switch character. It only says what
// he's wearing; the character draws the rest.
import { ITEMS, SLOTS } from "./motion/items.js";

const CELL = 26; // px
const COLUMNS = 14, ROWS = 6;
const CHARACTERS = [["Barbar", "barbarian"], ["Savaşçı", "warrior"], ["Renkli", "template"]];
/** How many cells an item of each kind takes in the grid. */
const FOOTPRINTS: Record<string, [number, number]> = { weapon: [1, 3], shield: [2, 3], helmet: [2, 2], body: [2, 3], gloves: [2, 2], boots: [2, 2], cape: [2, 3], ring: [1, 1], amulet: [1, 1] };
/** Where each slot sits round the body: column, row, width, height, in cells. */
const PLACES: Record<string, [number, number, number, number]> = {
  weapon: [2, 0, 2, 4], shield: [10, 0, 2, 4], helmet: [6, 0, 2, 2], body: [6, 2, 2, 3], amulet: [8.5, 2.2, 1, 1], ring1: [4.5, 3.2, 1, 1], ring2: [8.5, 3.2, 1, 1], gloves: [3, 5, 2, 2], cape: [6, 5, 2, 2], boots: [9, 5, 2, 2],
};

type Item = (typeof ITEMS)[number];
interface Stored { item: Item; x: number; y: number }
export interface Outfit { look: string; gear: string[]; sword: boolean; stance: string }

const footprint = (item: Item) => FOOTPRINTS[item.kind];

/** A small picture of an item, in its own colors. */
function iconOf(item: Item, wide: number, tall: number) {
  const canvas = document.createElement("canvas"), size = 8, w = wide * size, h = tall * size;
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext("2d")!, tones = Object.values(item.colors ?? {})[0] as string[], [main, dark] = tones, block = (x: number, y: number, width: number, height: number, color = main) => {
    c.fillStyle = color;
    c.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
  };
  const cx = w / 2, cy = h / 2;
  if (item.kind === "weapon") {
    if (item.id === "war-axe") {
      const blade = Object.values(item.colors)[1] as string[];
      block(cx - 1, 2, 2, h - 4);
      block(cx, 3, 6, 7, blade[0]);
      block(cx + 3, 4, 3, 5, blade[1]);
    } else {
      block(cx - 1, 1, 2, h - 8);
      block(cx, 1, 1, h - 8, dark);
      block(cx - 3, h - 8, 6, 2, "#8a6a30");
      block(cx - 1, h - 6, 2, 5, "#4c341e");
    }
  } else if (item.kind === "shield") {
    block(cx - 6, cy - 8, 12, 15);
    block(cx - 5, cy - 7, 10, 13, dark);
    block(cx - 2, cy - 2, 4, 4, main);
  } else if (item.kind === "helmet") {
    block(cx - 5, cy - 5, 10, 9);
    block(cx - 4, cy - 6, 8, 2);
    block(cx - 3, cy, 6, 2, dark);
  } else if (item.kind === "body") {
    block(cx - 5, cy - 8, 10, 15);
    block(cx - 8, cy - 8, 3, 5, dark);
    block(cx + 5, cy - 8, 3, 5, dark);
    block(cx - 5, cy + 5, 10, 2, dark);
  } else if (item.kind === "gloves" || item.kind === "boots") {
    for (const side of [-1, 1]) {
      block(cx + side * 4 - 2, cy - 5, 4, 8);
      block(cx + side * 4 - (item.kind === "boots" ? 2 : 3), cy + 3, item.kind === "boots" ? 6 : 6, 3, dark);
    }
  } else if (item.kind === "cape") {
    for (let y = 0; y < 18; y++) block(cx - 4 - y / 4, cy - 9 + y, 8 + y / 2, 1, y % 5 === 4 ? dark : main);
  } else {
    block(cx - 3, cy - 3, 6, 6, main);
    block(cx - 2, cy - 2, 4, 4, "#14121a");
    block(cx - 1, cy - 5, 2, 2, dark);
  }
  return canvas;
}

export function createInventory(changed: (outfit: Outfit) => void) {
  let look = "barbarian";
  const worn: Record<string, Item | undefined> = {}, stored: Stored[] = [];

  const tell = () => {
    const gear = Object.values(worn).flatMap((item) => (item ? [item.id] : [])), sword = !!worn.weapon;
    changed({ look, gear, sword, stance: sword ? "Sword_Idle" : "Idle_Loop" });
  };
  const fits = (item: Item, x: number, y: number) => {
    const [wide, tall] = footprint(item);
    if (x < 0 || y < 0 || x + wide > COLUMNS || y + tall > ROWS) return false;
    return stored.every((other) => {
      const [otherWide, otherTall] = footprint(other.item);
      return x + wide <= other.x || other.x + otherWide <= x || y + tall <= other.y || other.y + otherTall <= y;
    });
  };
  const store = (item: Item) => {
    for (let x = 0; x < COLUMNS; x++) for (let y = 0; y < ROWS; y++) if (fits(item, x, y)) return void stored.push({ item, x, y });
  };
  for (const item of [...ITEMS].sort((a, b) => footprint(b)[1] - footprint(a)[1])) store(item);

  const panel = document.createElement("div"), doll = document.createElement("div"), grid = document.createElement("div"), title = document.createElement("h2");
  panel.id = "inventory";
  title.textContent = "Envanter";
  doll.id = "paperdoll";
  doll.style.height = `${7.4 * CELL}px`;
  grid.id = "stash";
  Object.assign(grid.style, { width: `${COLUMNS * CELL}px`, height: `${ROWS * CELL}px`, backgroundSize: `${CELL}px ${CELL}px` });
  panel.append(title, doll, grid);

  /** Picks an item up. Wherever it's let go, it lands there if it can, and otherwise goes back. */
  const grab = (event: PointerEvent, item: Item, card: HTMLElement, back: () => void) => {
    event.preventDefault();
    const box = card.getBoundingClientRect(), offX = event.clientX - box.left, offY = event.clientY - box.top;
    card.classList.add("dragged");
    card.style.left = `${box.left}px`;
    card.style.top = `${box.top}px`;
    document.body.append(card);
    for (const slot of doll.querySelectorAll<HTMLElement>(".slot")) slot.classList.toggle("takes", slot.dataset.kind === item.kind);
    const move = (next: PointerEvent) => {
      card.style.left = `${next.clientX - offX}px`;
      card.style.top = `${next.clientY - offY}px`;
    };
    const drop = (end: PointerEvent) => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", drop);
      card.remove();
      const under = document.elementsFromPoint(end.clientX, end.clientY), slot = under.find((element) => element.classList.contains("slot")) as HTMLElement | undefined;
      if (slot?.dataset.kind === item.kind) {
        const id = slot.dataset.slot!, old = worn[id];
        worn[id] = item;
        if (old) store(old);
      } else if (under.includes(grid)) {
        const area = grid.getBoundingClientRect(), x = Math.round((end.clientX - offX - area.left) / CELL), y = Math.round((end.clientY - offY - area.top) / CELL);
        if (fits(item, x, y)) stored.push({ item, x, y });
        else back();
      } else back();
      draw();
      tell();
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", drop);
  };

  const cardOf = (item: Item, wide: number, tall: number) => {
    const card = document.createElement("div"), icon = iconOf(item, wide, tall);
    card.className = "item";
    card.title = item.name;
    Object.assign(card.style, { width: `${wide * CELL}px`, height: `${tall * CELL}px` });
    card.append(icon);
    return card;
  };

  function draw() {
    doll.replaceChildren();
    grid.replaceChildren();
    for (const { id, kind, name } of SLOTS) {
      const [x, y, wide, tall] = PLACES[id], slot = document.createElement("div"), item = worn[id];
      slot.className = "slot";
      slot.dataset.slot = id;
      slot.dataset.kind = kind;
      slot.title = name;
      Object.assign(slot.style, { left: `${x * CELL}px`, top: `${y * CELL}px`, width: `${wide * CELL}px`, height: `${tall * CELL}px` });
      if (item) {
        const card = cardOf(item, wide, tall);
        card.onpointerdown = (event) => {
          delete worn[id];
          tell();
          grab(event, item, card, () => {
            if (worn[id]) store(item);
            else worn[id] = item;
          });
        };
        slot.append(card);
      }
      doll.append(slot);
    }
    for (const entry of stored) {
      const [wide, tall] = footprint(entry.item), card = cardOf(entry.item, wide, tall);
      Object.assign(card.style, { left: `${entry.x * CELL}px`, top: `${entry.y * CELL}px`, position: "absolute" });
      card.onpointerdown = (event) => {
        stored.splice(stored.indexOf(entry), 1);
        grab(event, entry.item, card, () => stored.push(entry));
      };
      grid.append(card);
    }
  }

  const toggle = () => (panel.hidden = !panel.hidden);
  const opener = document.createElement("button"), chooser = document.createElement("div");
  opener.id = "inventory-button";
  opener.textContent = "Envanter (I)";
  opener.onclick = toggle;
  addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "i") toggle();
  });
  chooser.id = "characters";
  const choices = CHARACTERS.map(([label, id]) => {
    const button = document.createElement("button");
    button.textContent = label;
    button.onclick = () => {
      look = id;
      choices.forEach((other, i) => other.classList.toggle("on", CHARACTERS[i][1] === look));
      tell();
    };
    button.classList.toggle("on", id === look);
    chooser.append(button);
    return button;
  });
  document.body.append(panel, opener, chooser);
  draw();
  tell();
}

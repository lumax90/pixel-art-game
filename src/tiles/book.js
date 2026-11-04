// The tile book: a button in the top right corner opens everything the ground is made of. All of it is read from groups.js and
// grids.js, so whatever is added there turns up here by itself.
import { createFrame, createFx } from "../../vendor/pixelfx/src/core/index.js";
import * as water from "../fx/tiles/water.js";
import { paintGround } from "./ground.js";
import { GROUPS, TILE, WATER } from "./groups.js";
import { GRIDS, chainGrids, fitsBelow, fitsRight } from "./grids.js";

const KINDS = { plain: "Düz", tufts: "Ot", flowers: "Çiçek", pebbles: "Çakıl", cracks: "Çatlak", worn: "Aşınmış" };
const SEED = 1;
const VARIANT_ZOOM = 4;
const CORNER_ZOOM = 2;
const GRID_ZOOM = 2;
const STRIP_LENGTH = 4;
const POOL = [",,,,,,,", ",,~~~,,", ",~~~~~,", ",,~~~,,", ",,,,,,,"];

const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

function canvasOf(pixels, w, h, zoom) {
  const canvas = element("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = `${w * zoom}px`;
  canvas.style.height = `${h * zoom}px`;
  canvas.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer), w, h), 0, 0);
  return canvas;
}

/** The ground of a small grid, with its water standing still. */
function picture(rows, zoom) {
  const w = rows[0].length * TILE, h = rows.length * TILE, ground = paintGround(rows, SEED, w, h), pixels = ground.pixels;
  for (let n = 0; n < ground.water.length; n += 3) {
    const shore = ground.water[n + 2];
    pixels[ground.water[n + 1] * w + ground.water[n]] = WATER[shore <= 2 ? 4 : shore <= 4 ? 3 : 2];
  }
  return canvasOf(pixels, w, h, zoom);
}

function section(host, title, note) {
  const box = element("section");
  box.append(element("h2", "", title));
  if (note) box.append(element("p", "", note));
  host.append(box);
  return box;
}

function swatches(colors) {
  const row = element("div", "swatches");
  for (const color of colors) {
    const swatch = element("i");
    swatch.style.background = `rgb(${color & 255} ${(color >>> 8) & 255} ${(color >>> 16) & 255})`;
    row.append(swatch);
  }
  return row;
}

function variantPicture(group, variant, index) {
  const pixels = new Uint32Array(TILE * TILE).fill(group.tones[1]);
  // laid stones run across tiles, so a stone tile is shown cut from a stretch of them
  if (group.laid) {
    const stretch = paintGround([group.char.repeat(2), group.char.repeat(2)], SEED + index, TILE * 2, TILE * 2).pixels;
    for (let y = 0; y < TILE; y++) pixels.set(stretch.subarray((y + 8) * TILE * 2 + 8, (y + 8) * TILE * 2 + 8 + TILE), y * TILE);
  }
  variant.pixels.forEach((color, i) => {
    if (color) pixels[i] = color;
  });
  return canvasOf(pixels, TILE, TILE, VARIANT_ZOOM);
}

function showGroups(host) {
  const box = section(host, "Tile grupları", "Her grubun kendi rengi ve varyasyonları var. Varyasyonlar tile kenarına dokunmadığı için aynı gruptakiler her sırayla yan yana gelir.");
  for (const group of GROUPS) {
    const part = element("div", "group");
    part.append(element("h3", "", `${group.name}${group.active ? " · aktif, canlı çiziliyor" : ` · ${group.variants.length} varyasyon`}`), swatches(group.tones ? [...group.tones, ...group.ramp] : group.ramp));
    for (const kind of Object.keys(KINDS)) {
      const list = group.variants.filter((variant) => variant.kind === kind);
      if (!list.length) continue;
      const line = element("div", "kind");
      line.append(element("span", "", `${KINDS[kind]} (${list.length})`));
      for (const variant of list) line.append(variantPicture(group, variant, group.variants.indexOf(variant)));
      part.append(line);
    }
    if (group.active) part.append(createLiveWater());
    box.append(part);
  }
}

/** Water doing what it does in the game. */
function createLiveWater() {
  const w = POOL[0].length * TILE, h = POOL.length * TILE, ground = paintGround(POOL, SEED, w, h), frame = createFrame(w, h), fx = createFx(water, { x: 0, y: 0, pixels: ground.water, seed: SEED });
  const canvas = canvasOf(ground.pixels, w, h, VARIANT_ZOOM / 2), context = canvas.getContext("2d"), image = new ImageData(new Uint8ClampedArray(frame.color.buffer), w, h);
  frame.color.set(ground.pixels);
  canvas.tick = (dt) => {
    fx.update(dt);
    fx.draw(frame, "back");
    context.putImageData(image, 0, 0);
  };
  return canvas;
}

function showCorners(host) {
  const box = section(host, "Geçişler", "İki grup her kesişimde dört köşeye bakar. Bu yüzden her ikili için 14 durum var; sınır çizgisi tile kenarından değil, ortadan ve düzensiz geçer.");
  for (let low = 0; low < GROUPS.length; low++)
    for (let high = low + 1; high < GROUPS.length; high++) {
      const a = GROUPS[low], b = GROUPS[high], part = element("div", "group"), line = element("div", "corners");
      part.append(element("h3", "", `${a.name} + ${b.name}`));
      for (let mask = 1; mask < 15; mask++) {
        const at = (bit) => (mask & (1 << bit) ? b.char : a.char);
        line.append(picture([at(0) + at(1), at(2) + at(3)], CORNER_ZOOM));
      }
      part.append(line);
      box.append(part);
    }
}

function showGrids(host) {
  const box = section(host, "Grid örnekleri", "Grid, tile'lardan oluşan aynı boyutlu bir blok. Her biri 12×8 tile.");
  const line = element("div", "grids");
  for (const grid of GRIDS) {
    const card = element("div", "card"), right = GRIDS.filter((other) => fitsRight(grid, other)).map((other) => other.name), below = GRIDS.filter((other) => fitsBelow(grid, other)).map((other) => other.name);
    card.append(element("h3", "", grid.name), picture(grid.rows, GRID_ZOOM), element("p", "", `Sağına: ${right.join(", ") || "yok"}`), element("p", "", `Altına: ${below.join(", ") || "yok"}`));
    line.append(card);
  }
  box.append(line);
}

function showChain(host) {
  const box = section(host, "Nasıl bir araya geliyorlar", "Bir grid ancak kenarları tutan gridin yanına gelir, böylece yol kopmaz. Aşağıdaki dizilim bu kuralla seçildi.");
  const again = element("button", "", "Yeni dizilim"), strip = element("div", "strip"), names = element("p");
  let seed = 1;
  const draw = () => {
    const chain = chainGrids(seed++, STRIP_LENGTH), rows = chain[0].rows.map((_, y) => chain.map((grid) => grid.rows[y]).join(""));
    strip.replaceChildren(picture(rows, GRID_ZOOM));
    names.textContent = chain.map((grid) => grid.name).join(" → ");
  };
  again.onclick = draw;
  draw();
  box.append(again, names, strip);
}

export function setupTileBook() {
  const button = element("button", "", "Tile'lar"), book = element("div"), close = element("button", "", "Kapat (Esc)");
  button.id = "tile-button";
  book.id = "tile-book";
  book.hidden = true;
  close.id = "tile-close";
  document.body.append(button, book);
  let built = false, last = 0, frame = 0;

  const animate = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    book.querySelectorAll("canvas").forEach((canvas) => canvas.tick?.(dt));
    frame = requestAnimationFrame(animate);
  };
  const setOpen = (open) => {
    book.hidden = !open;
    button.hidden = open;
    cancelAnimationFrame(frame);
    if (!open) return;
    if (!built) {
      built = true;
      const title = element("div", "title");
      title.append(element("h1", "", "Tile kitabı"), close);
      book.append(title);
      showGroups(book);
      showCorners(book);
      showGrids(book);
      showChain(book);
    }
    last = performance.now();
    frame = requestAnimationFrame(animate);
  };
  button.onclick = () => setOpen(true);
  close.onclick = () => setOpen(false);
  addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !book.hidden) setOpen(false);
  });
}

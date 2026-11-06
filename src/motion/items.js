// What can be worn. An item is data laid over a look, so it fits any body and any move: its colors replace those of the regions it covers,
// its pieces hang on the joints, sized as shares of that body's own parts, and a weapon or cape takes the place of whatever was there.
import { hex } from "../../vendor/pixelfx/src/core/index.js";

const STEEL = ["#a4b0c4", "#6e7a90"], DARK_STEEL = ["#6a7488", "#4c5466"], LEATHER = ["#6a4a30", "#4c3422"], BRIGHT = ["#e0e8f2", "#9aa6ba"];

/** Both sides of a pair. */
const pair = (from, to, start, end, size, colors) => ["L", "R"].map((side) => ({ from: from + side, to: to + side, start, end, size, colors }));
const paired = (part, colors) => ({ [`${part}L`]: colors, [`${part}R`]: [...colors] });
const pauldrons = (colors) => pair("shoulder", "elbow", 0, 0.3, [["upperArmTop", 1.35], ["upperArmEnd", 1.3]], colors).map((piece) => ({ ...piece, over: 2.5 }));
const cuffs = (colors) => pair("wrist", "elbow", 0, 0.28, [["forearmEnd", 1.45], ["forearmEnd", 1.35]], colors);

/** The places on a body. Slots of the same kind take the same items; those that aren't drawn are `unseen`. */
export const SLOTS = [
  { id: "weapon", name: "Kılıç", kind: "weapon" },
  { id: "shield", name: "Kalkan", kind: "shield" },
  { id: "helmet", name: "Miğfer", kind: "helmet" },
  { id: "body", name: "Gövde", kind: "body" },
  { id: "gloves", name: "Eldiven", kind: "gloves" },
  { id: "boots", name: "Çizme", kind: "boots" },
  { id: "cape", name: "Pelerin", kind: "cape" },
  { id: "amulet", name: "Kolye", kind: "amulet", unseen: true },
  { id: "ring1", name: "Yüzük 1", kind: "ring", unseen: true },
  { id: "ring2", name: "Yüzük 2", kind: "ring", unseen: true },
];

export const ITEMS = [
  { id: "iron-sword", kind: "weapon", name: "Demir kılıç", colors: { blade: BRIGHT }, weapon: { long: 15, thick: [0.8, 0.5], colors: "blade" } },
  { id: "broad-sword", kind: "weapon", name: "Geniş kılıç", colors: { blade: ["#f0d890", "#b89848"] }, weapon: { long: 19, thick: [1.4, 0.7], colors: "blade" } },
  { id: "war-axe", kind: "weapon", name: "Savaş baltası", colors: { haft: ["#6a4a2c", "#4c341e"], blade: ["#c4ccd6", "#8a94a4"] }, weapon: { long: 20, grip: 0.34, carry: 1, hands: 2, second: 0.12, thick: [0.7, 0.6], colors: "haft", blade: { wide: 2.8, from: 1, to: 2.2, colors: "blade" } } },

  { id: "round-shield", kind: "shield", name: "Yuvarlak kalkan", colors: { shield: ["#8a5a30", "#643e20"], rim: ["#a4b0c4", "#6e7a90"], boss: ["#d8dee8", "#9aa6ba"] }, shield: { wide: 3.6, tall: 3.6, colors: "shield", rim: "rim", boss: "boss" } },
  { id: "tower-shield", kind: "shield", name: "Uzun kalkan", colors: { shield: ["#7a1f28", "#5a1620"], rim: STEEL, boss: ["#d8a040", "#a87828"] }, shield: { wide: 3.2, tall: 6, square: true, colors: "shield", rim: "rim", boss: "boss" } },

  { id: "steel-helm", kind: "helmet", name: "Çelik miğfer", colors: { head: STEEL } },
  { id: "leather-cap", kind: "helmet", name: "Deri başlık", colors: { head: LEATHER } },

  { id: "plate", kind: "body", name: "Çelik zırh", colors: { chest: STEEL, ...paired("upperArm", DARK_STEEL), pauldron: ["#c4cede", "#8894a8"] }, pieces: pauldrons("pauldron") },
  { id: "leather-vest", kind: "body", name: "Deri yelek", colors: { chest: LEATHER, pauldron: ["#4c3422", "#38261a"] }, pieces: pauldrons("pauldron") },

  { id: "leather-gloves", kind: "gloves", name: "Deri eldiven", colors: { ...paired("forearm", LEATHER), cuff: ["#4c3422", "#38261a"] }, pieces: cuffs("cuff") },
  { id: "steel-gloves", kind: "gloves", name: "Çelik eldiven", colors: { ...paired("forearm", STEEL), cuff: BRIGHT }, pieces: cuffs("cuff") },

  { id: "leather-boots", kind: "boots", name: "Deri çizme", colors: { ...paired("shin", LEATHER), ...paired("foot", ["#3a2820", "#2a1c16"]) } },
  { id: "steel-boots", kind: "boots", name: "Çelik çizme", colors: { ...paired("shin", STEEL), ...paired("foot", DARK_STEEL) } },

  { id: "red-cape", kind: "cape", name: "Kırmızı pelerin", colors: { cape: ["#a82c34", "#7a1f28"] }, cape: "cape" },
  { id: "fur-cape", kind: "cape", name: "Kürk pelerin", colors: { cape: ["#8a8278", "#6a635a"] }, cape: "cape" },

  { id: "ruby-ring", kind: "ring", name: "Yakut yüzük", colors: { gem: ["#d84050", "#8a2030"] } },
  { id: "emerald-ring", kind: "ring", name: "Zümrüt yüzük", colors: { gem: ["#40b070", "#287848"] } },
  { id: "bone-amulet", kind: "amulet", name: "Kemik kolye", colors: { gem: ["#e0d8c0", "#a89c80"] } },
];

/** A look with these items on it, by id, its colors ready to put. */
export function wear(look, ids) {
  const worn = ids.map((id) => ITEMS.find((item) => item.id === id)), colors = Object.assign({}, look.colors, ...worn.map((item) => item.colors));
  return {
    ...look,
    colors: Object.fromEntries(Object.entries(colors).map(([part, tones]) => [part, tones.map(hex)])),
    pieces: [...look.pieces, ...worn.flatMap((item) => item.pieces ?? [])],
    weapon: worn.find((item) => item.weapon)?.weapon ?? look.weapon,
    cape: worn.find((item) => item.cape)?.cape,
    shield: worn.find((item) => item.shield)?.shield,
  };
}

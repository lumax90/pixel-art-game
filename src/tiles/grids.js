// Grids are blocks of tiles, all the same size, written out by hand: , grass  . dirt  # stone  ~ water
// Two grids can lie side by side when the rows or columns that meet are the same, which is what keeps a path a path across them.
import { Rng } from "../../vendor/pixelfx/src/core/index.js";

export const GRIDS = [
  {
    name: "Patika",
    rows: [
      ",,,,,,,,,,,,",
      ",,,,,,,,,,,,",
      ",,,,,,,,,,,,",
      "............",
      "............",
      ",,,,,,,,,,,,",
      ",,,,,,,,,,,,",
      ",,,,,,,,,,,,",
    ],
  },
  {
    name: "Kavşak",
    rows: [
      ",,,,,..,,,,,",
      ",,,,,..,,,,,",
      ",,,,,..,,,,,",
      "............",
      "............",
      ",,,,,..,,,,,",
      ",,,,,..,,,,,",
      ",,,,,..,,,,,",
    ],
  },
  {
    name: "Göl kenarı",
    rows: [
      ",,,,,,,,,,,,",
      ",,,~~~~~~,,,",
      ",,~~~~~~~~,,",
      "...~~~~~~...",
      "....~~~~....",
      ",,,.......,,",
      ",,,,,,,,,,,,",
      ",,,,,,,,,,,,",
    ],
  },
  {
    name: "Taş avlu",
    rows: [
      ",,,,,,,,,,,,",
      ",,,########,",
      ",,,########,",
      "...########.",
      "...########.",
      ",,,########,",
      ",,,########,",
      ",,,,,,,,,,,,",
    ],
  },
  {
    name: "Dönemeç",
    rows: [
      ",,,,,,,,,,,,",
      ",,,,,,,,,,,,",
      ",,,,,,,,,,,,",
      "......,,,,,,",
      ".......,,,,,",
      ",,,,...,,,,,",
      ",,,,,..,,,,,",
      ",,,,,..,,,,,",
    ],
  },
  {
    name: "Çayır",
    rows: [
      ",,,,,,,,,,,,",
      ",,,,,,,,,,,,",
      ",,,,,,,,,,,,",
      ",,,,,,,,,,,,",
      ",,,,,,,,,,,,",
      ",,,,,,,,,,,,",
      ",,,,,,,,,,,,",
      ",,,,,,,,,,,,",
    ],
  },
];

const edges = ({ rows }) => ({
  left: rows.map((row) => row[0]).join(""),
  right: rows.map((row) => row[row.length - 1]).join(""),
  top: rows[0],
  bottom: rows[rows.length - 1],
});

/** Whether `b` can lie to the right of `a`. */
export const fitsRight = (a, b) => edges(a).right === edges(b).left;

/** Whether `b` can lie below `a`. */
export const fitsBelow = (a, b) => edges(a).bottom === edges(b).top;

/** Grids in a row, each chosen from those that fit the last one. */
export function chainGrids(seed, count) {
  const rng = new Rng(seed), chain = [rng.pick(GRIDS.filter((grid) => grid.rows[3][0] === "."))];
  while (chain.length < count) chain.push(rng.pick(GRIDS.filter((grid) => fitsRight(chain[chain.length - 1], grid))));
  return chain;
}

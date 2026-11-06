import geiranger from "../maps/geiranger.json";

/** Maps made from the real world by tools/maps/build.mjs. */
export const GEIRANGER = geiranger;

// One screen laid out by hand, to judge the tiles by: , grass  . dirt  # stone  ~ water
export const TEST_MAP = [
  ",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,",
  ",,,,,,,,,,,,,..,,,,,,,,,,,,,,,",
  ",,,,,~~~~~,,,,...,,,,,,,,,,,,,",
  ",,,,~~~~~~~~,,,...,,,,,,,,,,,,",
  ",,,~~~~~~~~~~,,,...,,,,,,,,,,,",
  ",,,~~~~~~~~~~,,,,...,,,,,,,,,,",
  ",,,,~~~~~~~~,,,,,....,,,,,,,,,",
  ",,,,,,~~~~,,,,,,,,..........,,",
  ",,,,,,,,,,,,,,,,,,.##########.",
  ",,,,,,,,,,,,,,,,,..##########.",
  ",,,.,,,,,,,,,,,,...##########.",
  "..........,,,,,....##########,",
  ",,,..........,.....##########,",
  ",,,,,,,,,,,......,,##########,",
  ",,,,,,,,,,,,,,,,,,,,.........,",
  ",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,",
  ",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,",
];

// A shore running up a mountain, to judge the mountain tiles by, side by side: ~ water  s scree  m mountain meadow  , grass  r rock  i glacier  * snow
export const MOUNTAIN_MAP = [
  "~~~~~~sss,,,mmmmmmmmrrrrrrrr****************",
  "~~~~~~~ss,,,,mmmmmmmrrrrrrr*****************",
  "~~~~~~~sss,,,,mmmmmmmrrrrr******iiiiii******",
  "~~~~~~~~ss,,,,mmmmmmmrrrr******iiiiiiiii****",
  "~~~~~~~~sss,,,,mmmmmmrrrr*****iiiiiiiiii****",
  "~~~~~~~~~ss,,,,mmmmmssrrr*****iiiiiiiiiii***",
  "~~~~~~~~~sss,,,mmmmmsssrr*****iiiiiiiiiii***",
  "~~~~~~~~~~ss,,,,mmmmsssrrr*****iiiiiiiii****",
  "~~~~~~~~~~sss,,,mmmmssrrrr******iiiiiii*****",
  "~~~~~~~~~~~ss,,,,mmmmsrrrrr*******iii*******",
  "~~~~~~~~~~~sss,,,mmmmmrrrrrr****************",
  "~~~~~~~~~~~~ss,,,,mmmmmrrrrrrr**************",
  "~~~~~~~~~~~~sss,,,mmmmmmrrrrrrrr************",
  "~~~~~~~~~~~~~ss,,,,mmmmmmsssrrrrr***********",
  "~~~~~~~~~~~~~sss,,,mmmmmmmsssrrrrr**********",
  "~~~~~~~~~~~~~~ss,,,,mmmmmmmssssrrrr*********",
  "~~~~~~~~~~~~~~sss,,,mmmmmmmm~~~rrrrr********",
  "~~~~~~~~~~~~~~~ss,,,,mmmmmmmm~~~rrrrr*******",
  "~~~~~~~~~~~~~~~sss,,,mmmmmmmmm~~~rrrrr******",
  "~~~~~~~~~~~~~~~~ss,,,,mmmmmmmmm~~~rrrrr*****",
  "~~~~~~~~~~~~~~~~sss,,,mmmmmmmmmmsssrrrrr****",
  "~~~~~~~~~~~~~~~~~ss,,,,mmmmmmmmmmsssrrrrr***",
  "~~~~~~~~~~~~~~~~~sss,,,mmmmmmmmmmmsssrrrrr**",
  "~~~~~~~~~~~~~~~~~~ss,,,,mmmmmmmmmmmsssrrrrr*",
  "~~~~~~~~~~~~~~~~~~sss,,,mmmmmmmmmmmmsssrrrrr",
  "~~~~~~~~~~~~~~~~~~~ss,,,,mmmmmmmmmmmmsssrrrr",
  "~~~~~~~~~~~~~~~~~~~sss,,,mmmmmmmmmmmmmsssrrr",
];

// How high each cell of it lies: . low  ^ raised  / a slope down, on the low cell below a raised one
export const TEST_LEVELS = [
  "..............................",
  "....................^^^^^^^...",
  "...................^^^^^^^^^..",
  "...................^^^^^^^^^..",
  "...................^^^^^^^^^..",
  "....................^^^^^^^...",
  ".......................////....",
  "..............................",
];

/** The mountain's heights follow its ground: shore, then grass, meadow, rock and the ice fields, with a way up through each step. */
const MOUNTAIN_HEIGHTS = { "~": 0, s: 0, ",": 1, m: 2, r: 3, i: 4, "*": 4 };
const mountainCells = MOUNTAIN_MAP.map((row) => [...row].map((char) => MOUNTAIN_HEIGHTS[char]));
for (const column of [9, 22, 26, 34])
  for (let row = 1; row < mountainCells.length; row++)
    if (mountainCells[row][column] < mountainCells[row - 1][column]) {
      mountainCells[row][column] = mountainCells[row][column + 1] = "/";
      break;
    }
export const MOUNTAIN_LEVELS = mountainCells.map((row) => row.join(""));

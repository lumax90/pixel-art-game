// A run written out by hand as pixel maps, one letter a region, the way tiles are written: nothing is turned on joints, every shape is
// whatever that frame needs it to be. Going right. The second half of the cycle is the first with near and far swapped.
//   h H head   o O trunk   a e near arm, upper and fore   A E far arm   t s b near thigh, shin, boot   T S B far ones
const HEAD = [
  "..........hhhh..........",
  ".........hhhhhh.........",
  "........hhhhhhhh........",
  "........hhhhhhhh........",
  "........Hhhhhhhh........",
  "........Hhhhhhhh........",
  ".........HHhhhh.........",
  "..........HHhh..........",
];

const POSES = [
  {
    // contact: the near leg reaches forward, the far one trails, arms the other way
    drop: 0,
    trunk: [
      ".........ooooo..........",
      "........aoooooEE........",
      ".......aaoooooEEE.......",
      "......aaaoooOO..EEE.....",
      ".....eee.oooOO...EE.....",
      "....eee..ooOO...........",
      "....ee...ooOO...........",
    ],
    legs: [
      ".......TTtttt...........",
      "......TTT.tttt..........",
      ".....TTT....ttt.........",
      "....TTT......ttt........",
      "....SS........sss.......",
      "...SS..........ss.......",
      "..SSS..........ss.......",
      "..SS............ss......",
      ".SS.............ss......",
      ".BB.............sss.....",
      "BBB..............bbbb...",
      "........................",
    ],
  },
  {
    // down: the weight lands on the near foot, the knee gives, the far leg lifts behind
    drop: 1,
    trunk: [
      ".........ooooo..........",
      "........aooooEE.........",
      "........aaoooEE.........",
      ".......aaaooOEEE........",
      "......eee.ooO.EE........",
      "......ee..ooO...........",
      "..........ooO...........",
    ],
    legs: [
      "........TTtttt..........",
      ".......TTT.tttt.........",
      "......TTT...ttt.........",
      ".....TTT....ttt.........",
      "....SSS....sss..........",
      "...SSS.....ss...........",
      "..SSS......ss...........",
      ".BSS......sss...........",
      ".BB.......sss...........",
      "..........bbbb..........",
      "........................",
      "........................",
    ],
  },
  {
    // passing: the near leg is straight under him, the far knee comes through
    drop: 0,
    trunk: [
      ".........ooooo..........",
      ".........aoooo..........",
      ".........aaooo..........",
      ".........aaeoO..........",
      "..........eeOO..........",
      "..........eeOO..........",
      "..........ooOO..........",
    ],
    legs: [
      "........TTttt...........",
      ".........TTttt..........",
      ".........TTTtt..........",
      "........SSTTtt..........",
      ".......SSS.ss...........",
      "......SSS..ss...........",
      ".....BB....ss...........",
      "....BB.....ss...........",
      "...........ss...........",
      "...........bbbb.........",
      "........................",
      "........................",
    ],
  },
  {
    // up: the near leg drives off behind, the far knee rises, he's at his highest
    drop: -1,
    trunk: [
      ".........ooooo..........",
      "........AAooooaa........",
      ".......AAAooooaaa.......",
      "......EE..oooOaaa.......",
      "......EE..oooOeee.......",
      "..........ooOOeee.......",
      "..........ooOO..........",
    ],
    legs: [
      "........ttTTTT..........",
      ".......ttt..TTTT........",
      "......ttt....TTT........",
      ".....ttt....SSS.........",
      ".....ss.....SS..........",
      "....ss......SS..........",
      "...ss.......BBB.........",
      "..ss....................",
      "..sb....................",
      ".bbb....................",
      "........................",
      "........................",
    ],
  },
];

const OTHER_SIDE = { t: "T", s: "S", b: "B", a: "A", e: "E", T: "t", S: "s", B: "b", A: "a", E: "e" };
const swapSides = (rows) => rows.map((row) => row.replace(/[tsbaeTSBAE]/g, (letter) => OTHER_SIDE[letter]));
const TALLEST = 2; // rows left free above the head for the highest pose

function frameOf({ drop, trunk, legs }, swapped) {
  const lower = [...trunk, ...legs], blank = "........................";
  return [...Array(TALLEST + drop).fill(blank), ...HEAD, ...(swapped ? swapSides(lower) : lower)];
}

export const RUN = [...POSES.map((pose) => frameOf(pose, false)), ...POSES.map((pose) => frameOf(pose, true))];
export const FRAME_WIDE = 24;

export const REGIONS = {
  h: "#5ccfe8", H: "#46a8d0", o: "#e87a2c", O: "#c8601e",
  a: "#6abe30", e: "#99e550", A: "#7a4098", E: "#a04aa8",
  t: "#d9cc60", s: "#fbf236", b: "#b8a830", T: "#b03a3a", S: "#d05050", B: "#8a2a2a",
};

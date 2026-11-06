// A heavy fighter, all in data on the shared body. Its shape is a CC0 muscular figure measured with tools/motion/measure.mjs and pushed a third
// further, so that it still reads at this size: the measured chest is half as wide again as the waist, and that ratio is kept.
const SKIN = ["#d09468", "#aa704a"], SKIN_ARM = ["#c88c60", "#a26a46"];
const THIGH = ["#4c3528", "#38261c"], SHIN = ["#5a4030", "#443024"], BOOT = ["#2a2226", "#1e181a"], WRAP = ["#9a7a54", "#7a5e40"];

export const barbarian = {
  build: {
    thigh: 0.21, shin: 0.25, ankle: 0.02, foot: 0.1,
    spine: 0.25, neck: 0.16, shoulder: 0.17, hip: 0.08,
    upperArm: 0.17, forearm: 0.16, hand: 0.05,
  },
  thick: { head: 3.4, chest: 4.4, waist: 2.9, hips: 3.2, thighTop: 2.3, thighEnd: 1.7, shinTop: 1.6, shinEnd: 1.1, foot: 1.2, upperArmTop: 1.9, upperArmEnd: 1.7, forearmTop: 1.6, forearmEnd: 1.1 }, // px on a body 28 tall
  headRise: 1.6,
  colors: {
    head: ["#2a2028", "#1e161c"], face: SKIN, beard: ["#3a2a22", "#2a1e18"],
    chest: SKIN, hips: THIGH,
    upperArmL: SKIN_ARM, upperArmR: [...SKIN_ARM], forearmL: WRAP, forearmR: [...WRAP],
    thighL: THIGH, thighR: [...THIGH], shinL: SHIN, shinR: [...SHIN], footL: BOOT, footR: [...BOOT],
    belt: BOOT, fur: ["#8a8278", "#6a635a"], haft: ["#6a4a2c", "#4c341e"], blade: ["#c4ccd6", "#8a94a4"],
  },
  weapon: { long: 21, thick: [0.7, 0.6], colors: "haft", blade: { wide: 3.4, from: 1.3, to: 2.4, colors: "blade" } },
  pieces: [
    { from: "waist", to: "pelvis", start: 0, end: 0.4, size: [["waist", 1.05], ["hips", 1]], colors: "belt" },
    { from: "shoulderL", to: "elbowL", start: 0, end: 0.3, size: [["upperArmTop", 1.3], ["upperArmEnd", 1.3]], colors: "fur", over: 2.5 },
  ],
};

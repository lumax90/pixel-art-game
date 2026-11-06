// The bare template: its regions in loud colors, only so that its parts can be told apart.
export const template = {
  /** Proportions read off a hand-drawn side-on figure 28 px tall: a head eight across, shoulders wider than the waist, long tapering legs. */
  build: {
    thigh: 0.21, shin: 0.25, ankle: 0.02, foot: 0.1,
    spine: 0.27, neck: 0.2, shoulder: 0.14, hip: 0.07,
    upperArm: 0.17, forearm: 0.17, hand: 0.04,
  },
  thick: { head: 4, chest: 3.6, waist: 2.5, hips: 2.8, thighTop: 2.1, thighEnd: 1.6, shinTop: 1.4, shinEnd: 1, foot: 1.1, upperArmTop: 1.5, upperArmEnd: 1.3, forearmTop: 1.2, forearmEnd: 0.9 }, // px on a body 28 tall
  headRise: 1.75, // heads out from the chest, so the shoulders and upper arms show below it
  colors: {
    head: ["#5ccfe8", "#4aa8d8"], face: ["#f2c9a0", "#d8a880"], chest: ["#e87a2c", "#c8601e"], hips: ["#d65a2c", "#b84820"],
    upperArmL: ["#7a4098", "#5e2f78"], forearmL: ["#a04aa8", "#7c3684"], upperArmR: ["#b02a48", "#8a2038"], forearmR: ["#d04860", "#a83448"],
    thighL: ["#d86cc0", "#b050a0"], shinL: ["#e890d0", "#c070b0"], footL: ["#884878", "#6c3660"],
    thighR: ["#6eb044", "#528a32"], shinR: ["#8cc858", "#6ca040"], footR: ["#4a7a30", "#386024"],
    sword: ["#e0e8f2", "#9aa6ba"],
  },
  weapon: { long: 15, thick: [0.8, 0.5], colors: "sword" },
  pieces: [],
};

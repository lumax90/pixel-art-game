// A soldier in plate over a red coat. The body is the template's, not a number changed: only what it wears is new.
import { template } from "./template.js";

const PLATE = ["#a4b0c4", "#6e7a90"], MAIL = ["#5e6878", "#454e5e"], COAT = ["#a82c34", "#7a1f28"], TROUSERS = ["#4a4250", "#36303c"], BOOT = ["#33282a", "#241c1e"];

export const warrior = {
  ...template,
  colors: {
    head: PLATE, face: ["#e8c09a", "#c89a74"],
    chest: [...PLATE], hips: COAT,
    upperArmL: MAIL, upperArmR: [...MAIL], forearmL: [...PLATE], forearmR: [...PLATE],
    thighL: TROUSERS, thighR: [...TROUSERS], shinL: [...PLATE], shinR: [...PLATE], footL: BOOT, footR: [...BOOT],
    belt: ["#d8a040", "#a87828"], pauldron: ["#c4cede", "#8894a8"], sword: ["#e0e8f2", "#9aa6ba"],
  },
  pieces: [
    { from: "waist", to: "pelvis", start: 0, end: 0.3, size: [["waist", 1.05], ["hips", 1]], colors: "belt" },
    { from: "shoulderL", to: "elbowL", start: 0, end: 0.3, size: [["upperArmTop", 1.35], ["upperArmEnd", 1.3]], colors: "pauldron", over: 2.5 },
    { from: "shoulderR", to: "elbowR", start: 0, end: 0.3, size: [["upperArmTop", 1.35], ["upperArmEnd", 1.3]], colors: "pauldron", over: 2.5 },
  ],
};

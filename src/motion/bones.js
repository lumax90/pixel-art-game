// What the motion engine knows about a skeleton: each bone as the two joints of the source rig it runs between, in the order
// clips store them. A joint paired with AIM isn't a bone but the way that joint faces: which way the chest and head look. Names and order are shared by the tool that makes clips and the engine that plays them.
export const AIM = "aim";
export const BONES = [
  ["pelvis", "spine_03"],
  ["spine_03", "Head"],
  ["spine_03", "upperarm_l"],
  ["upperarm_l", "lowerarm_l"],
  ["lowerarm_l", "hand_l"],
  ["hand_l", "middle_01_l"],
  ["hand_l", "thumb_01_l"],
  ["spine_03", "upperarm_r"],
  ["upperarm_r", "lowerarm_r"],
  ["lowerarm_r", "hand_r"],
  ["hand_r", "middle_01_r"],
  ["hand_r", "thumb_01_r"],
  ["spine_03", AIM],
  ["Head", AIM],
  ["pelvis", "thigh_l"],
  ["thigh_l", "calf_l"],
  ["calf_l", "foot_l"],
  ["foot_l", "ball_l"],
  ["pelvis", "thigh_r"],
  ["thigh_r", "calf_r"],
  ["calf_r", "foot_r"],
  ["foot_r", "ball_r"],
];
export const BONE = { spine: 0, neck: 1, shoulderL: 2, upperArmL: 3, forearmL: 4, handL: 5, thumbL: 6, shoulderR: 7, upperArmR: 8, forearmR: 9, handR: 10, thumbR: 11, chestAim: 12, headAim: 13, hipL: 14, thighL: 15, shinL: 16, footL: 17, hipR: 18, thighR: 19, shinR: 20, footR: 21 };
/** Bones from here on belong to the legs. */
export const FIRST_LEG_BONE = BONE.hipL;
export const NUMBERS_A_FRAME = 3 + BONES.length * 3;

/** The clips the game ships with. */
export const KEEP = ["Idle_Loop", "Walk_Loop", "Jog_Fwd_Loop", "Sprint_Loop", "Sword_Idle", "Sword_Attack", "Roll", "Hit_Chest", "Death01", "Spell_Simple_Shoot", "Punch_Jab", "Punch_Cross", "Crouch_Idle_Loop", "Crouch_Fwd_Loop", "Jump_Start", "Jump_Loop", "Jump_Land"];

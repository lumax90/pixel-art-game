/**
 * How a skill is placed in the world:
 * - bolt: flies from the caster to the cursor, rotated to face it, and sets off `impact` there
 * - ground: lands on the cursor
 * - self: plays round the caster
 * - aimed: plays from the caster, rotated towards the cursor
 */
export type SkillKind = "bolt" | "ground" | "self" | "aimed";

export interface Skill {
  name: string;
  kind: SkillKind;
  /** An id from src/fx/catalog.js. */
  fx: string;
  options?: Record<string, unknown>;
  speed?: number;
  impact?: string;
  /** Milliseconds before it can be cast again. */
  cooldown?: number;
  /** Puts gas on the floor, so it has to run where the gas field is. */
  gas?: boolean;
}

export const SKILLS: Skill[] = [
  { name: "Ateş topu", kind: "bolt", fx: "fire/fireball", options: { speed: 200 }, speed: 200, impact: "explosions/small-explosion" },
  { name: "Buz mızrağı", kind: "bolt", fx: "ice/ice-lance", speed: 240, impact: "ice/snowflake-burst" },
  { name: "Yıldırım", kind: "ground", fx: "lightning/lightning-strike", options: { veil: 0 } },
  { name: "Meteor", kind: "ground", fx: "fire/meteor" },
  { name: "Kutsal darbe", kind: "ground", fx: "holy/smite" },
  { name: "Buz halkası", kind: "self", fx: "ice/frost-nova" },
  { name: "Ateş halkası", kind: "self", fx: "fire/fire-ring" },
  { name: "Dönen kılıç", kind: "self", fx: "melee/spin-slash" },
  { name: "Dikenler", kind: "aimed", fx: "nature/thorns" },
  { name: "Zehirli ok", kind: "ground", fx: "poison/poison-arrow", gas: true },
];

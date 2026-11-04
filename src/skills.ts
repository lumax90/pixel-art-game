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
  /** Milliseconds after the cast that it reaches the ground. */
  lands?: number;
  /** What it does there: how far it reaches, in px, how hard it throws the grass back, whether it burns or freezes what grows, and how big a hole it tears in the ground. */
  world?: { reach: number; push?: number; burn?: boolean; frost?: boolean; tear?: number };
}

/** For what lands on the floor: it throws things out across the floor, seen from above, not along one line. */
export const ON_FLOOR = { floor: 0.55 };

export const SKILLS: Skill[] = [
  { name: "Ateş topu", kind: "bolt", fx: "fire/fireball", options: { speed: 200, scale: 0.6 }, speed: 200, impact: "explosions/small-explosion", world: { reach: 44, push: 2.6, burn: true, tear: 15 } },
  { name: "Buz mızrağı", kind: "bolt", fx: "ice/ice-lance", options: { scale: 0.75 }, speed: 240, impact: "ice/snowflake-burst", world: { reach: 30, push: 0.8, frost: true, tear: 7 } },
  { name: "Yıldırım", kind: "ground", fx: "lightning/lightning-strike", options: { veil: 0, scale: 0.7, ...ON_FLOOR }, lands: 480, world: { reach: 34, push: 1.8, burn: true, tear: 10 } },
  { name: "Meteor", kind: "ground", fx: "fire/meteor", options: { scale: 0.6, ...ON_FLOOR }, lands: 620, world: { reach: 84, push: 3.4, burn: true, tear: 30 } },
  { name: "Kutsal darbe", kind: "ground", fx: "holy/smite", options: { scale: 0.65, ...ON_FLOOR }, lands: 540, world: { reach: 52, push: 2.4, tear: 14 } },
  { name: "Buz halkası", kind: "self", fx: "ice/frost-nova", options: { scale: 0.7, ...ON_FLOOR }, lands: 100, world: { reach: 76, push: 0.8, frost: true } },
  { name: "Ateş halkası", kind: "self", fx: "fire/fire-ring", options: { scale: 0.7, ...ON_FLOOR }, lands: 300, world: { reach: 72, push: 1.2, burn: true } },
  { name: "Dönen kılıç", kind: "self", fx: "melee/spin-slash", options: { scale: 0.55, ...ON_FLOOR }, lands: 120, world: { reach: 54, push: 1.8 } },
  { name: "Dikenler", kind: "aimed", fx: "nature/thorns", options: { scale: 0.7 } },
  { name: "Zehirli ok", kind: "ground", fx: "poison/poison-arrow", gas: true, lands: 450 },
];

// The weather: a few values that change over time. It isn't an atmosphere, only what the rest of the game reads, so one
// wind moves the grass, the cape and the gas alike. It runs in spells: when one ends the next is drawn by chance, so it never
// plays through a set order. To change how often something comes, change its `chance` in SPELLS.
import { Rng, clamp } from "../../vendor/pixelfx/src/core/index.js";

export const CONTROLS = [
  { id: "wind", name: "Rüzgâr gücü", min: 0, max: 1, step: 0.01 },
  { id: "windAngle", name: "Rüzgâr yönü", min: 0, max: 360, step: 1, unit: "°" },
  { id: "rain", name: "Yağış", min: 0, max: 1, step: 0.01 },
  { id: "temperature", name: "Sıcaklık", min: -10, max: 35, step: 1, unit: "°C" },
  { id: "daylight", name: "Gün ışığı", min: 0, max: 1, step: 0.01 },
];

/** A kind of weather: how likely it is to come next, how long it stays in seconds, and the range of each value while it does. */
const SPELLS = [
  { name: "Açık", chance: 0.56, lasts: [60, 200], wind: [0.08, 0.3], rain: [0, 0], temperature: [12, 26] },
  { name: "Rüzgârlı", chance: 0.22, lasts: [40, 120], wind: [0.4, 0.75], rain: [0, 0], temperature: [8, 22] },
  { name: "Çisenti", chance: 0.1, lasts: [30, 80], wind: [0.15, 0.45], rain: [0.15, 0.4], temperature: [8, 18] },
  { name: "Sağanak", chance: 0.05, lasts: [25, 60], wind: [0.55, 1], rain: [0.65, 1], temperature: [10, 20] },
  { name: "Kar", chance: 0.07, lasts: [40, 110], wind: [0.1, 0.8], rain: [0.25, 0.7], temperature: [-7, -1] },
];

const SETTLE = 6; // seconds it takes a value to come most of the way to where it's headed, on its own
const BY_HAND_SETTLE = 1.2;
const DEGREES = Math.PI / 180;
const SNOW_SETTLES = 0.012, SNOW_MELTS = 0.02; // of the ground a second

class Weather {
  constructor(seed) {
    this.rng = new Rng(seed);
    this.auto = true;
    this.sheltered = false; // indoors: what goes on outside goes on, but nothing here feels it
    this.phase = 0; // how far the gusts have travelled
    this.snowCover = 0;
    this.spell = SPELLS[0];
    this.spellEnds = 0;
    this.targets = { wind: 0.2, windAngle: this.rng.range(0, 360), rain: 0, temperature: 18, daylight: 1 };
    this.values = { ...this.targets };
  }

  /** Sets a value by hand, which takes the weather out of its own hands. */
  set(id, value) {
    this.auto = false;
    this.targets[id] = value;
  }

  nextSpell(now) {
    const { rng } = this, total = SPELLS.reduce((sum, spell) => sum + spell.chance, 0);
    let roll = rng.range(0, total);
    this.spell = SPELLS.find((spell) => (roll -= spell.chance) <= 0) ?? SPELLS[0];
    this.spellEnds = now + rng.range(...this.spell.lasts);
    for (const id of ["wind", "rain", "temperature"]) this.targets[id] = rng.range(...this.spell[id]);
    this.targets.windAngle = this.values.windAngle + rng.range(-70, 70);
  }

  update(dt, now) {
    if (this.auto && now >= this.spellEnds) this.nextSpell(now);
    const k = 1 - Math.exp(-dt / (this.auto ? SETTLE : BY_HAND_SETTLE));
    for (const { id } of CONTROLS) {
      const gap = this.targets[id] - this.values[id];
      this.values[id] += (id === "windAngle" ? ((gap + 540) % 360) - 180 : gap) * k;
    }
    const { rain, temperature, wind } = this.values, snowing = rain > 0.05 && temperature <= 0;
    this.snowCover = clamp(this.snowCover + (snowing ? SNOW_SETTLES * rain : temperature > 1 ? -SNOW_MELTS : 0) * dt);
    this.phase += dt * (0.5 + wind * 3.5);
  }

  /** What the sky is doing where the player is. */
  get here() {
    return this.sheltered ? { rain: 0, wind: 0, temperature: 18, snowCover: 0 } : { ...this.values, snowCover: this.snowCover };
  }

  /** What effects need to know, in a form that can be sent to a worker. */
  get air() {
    const { wind, windAngle = 0, rain, snowCover } = this.here;
    return { x: Math.cos(windAngle * DEGREES) * wind, y: Math.sin(windAngle * DEGREES) * wind, wind, rain, snowCover, phase: this.phase };
  }
}

export const weather = new Weather(1);

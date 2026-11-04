import * as Phaser from "phaser";
import { FxLayer, type FxHandle } from "./fx";
import { STROKES } from "./fx/characters/knight.js";
import { SY } from "./fx/lib/gas-field.js";
import { ON_FLOOR, SKILLS, type Skill } from "./skills";
import { paintGround, tearGround, WALL } from "./tiles/ground.js";
import { GROUPS } from "./tiles/groups.js";
import { TEST_LEVELS, TEST_MAP } from "./tiles/test-map.js";
import { weather } from "./weather/weather.js";

const GROUND_SEED = Number(new URLSearchParams(location.search).get("seed")) || 1;
const START = { x: 144, y: 151 };
const DUMMY_SPOT = { x: 326, y: 151 };
const WATER = GROUPS.findIndex((group) => group.active);
const FEET_AHEAD = 6; // px ahead of his feet the ground is checked
const SPLASH_SIZE = 0.6;
const WADE_DEPTH = 12; // px out from the shore he can still stand
const WADING = 0.55; // how much water slows him
const SKILL_SPLASH = 2.2;

const TEAR_STAYS_MS = 4000, TEAR_HEALS_MS = 4000; // how long a tear stays bare earth, then how long the grass takes to come back over it
const TEAR_HEAL_STEP_MS = 66; // how often that's redrawn
const DIM_DEPTH = 2; // over the floor and shadows, under every sprite
const FX_BACK_DEPTH = 3;
const FX_FRONT_DEPTH = 4000; // over everything that sorts by its height on the screen
const NIGHT_AMBIENT = { r: 44, g: 54, b: 96 }; // what's left when the sun is down
const LANTERN = { color: 0xffbe7a, radius: 150, strength: 1.7, height: 70 }; // what he carries
const BRAZIER = { x: 410, y: 214, color: 0xff9a4a, radius: 230, strength: 2.4, height: 90 };
const BLAST_LIGHT = { color: 0xffb060, radius: 120, strength: 3, ms: 420, height: 60 }; // what a spell throws on the world as it lands
const CLOUD_DARK = 0.34; // how much a full sky of cloud darkens the ground
const SKY_STARTS = 0.015, SKY_ENDS = 0.008;
const GALE = 0.6; // wind from which snow becomes a blizzard

const SPEED = 80;
const RUN_SPEED = 140;
const STROKE_SPEED = 20; // how much he can still shuffle while swinging
const LUNGE_SPEED = 90; // the step into a blow
const LUNGE_MS = 70;
const FOOT_BOX = { w: 10, h: 6 };

const GUARD_MS = 4000; // he keeps his guard up this long after the last fighting
const COMBO_GAP_MS = 350; // a click this soon after a stroke ends carries on the combo
const CANCEL_MS = 120; // the end of a stroke can be cut short by the next one
const SWORD_REACH = 46; // floor px from his feet to a target he can hit
const SWORD_ARC = 1.4; // radians either side of where he's facing
const SLASH_PIVOT = 18; // px over the feet the crescent swings round
const SLASH_LEAD_MS = 30; // the crescent starts just before contact
const DUMMY_CHEST = 14;
const FINISHER = STROKES.length - 1;

const HAND_HEIGHT = 20; // bolts leave from the hand, not the feet
const MAX_DT = 0.05;
const STRESS_COUNT = 10;
const CROWD_COUNT = 25;
const KNIGHT = "characters/knight";

const SKILL_KEYS = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "ZERO"];

interface Bolt {
  fx: FxHandle;
  vx: number;
  vy: number;
  left: number;
  skill: Skill;
  fromHigh: boolean;
}

/** A patch of bare earth in the ground: where it is, and its pixels, 0 where it leaves the ground alone. */
interface Tear {
  x: number;
  y: number;
  w: number;
  h: number;
  pixels: Uint32Array;
  healsFrom: number;
}

interface Walker {
  fx: FxHandle;
  vx: number;
  vy: number;
}

export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Zone;
  private playerBody!: Phaser.Physics.Arcade.Body;
  private knight!: FxHandle;
  private grass!: FxHandle;
  private water!: FxHandle;
  private lantern!: Phaser.GameObjects.Light;
  private brazierLight!: Phaser.GameObjects.Light;
  private depth!: Uint8Array;
  private dummy!: Phaser.Physics.Arcade.Sprite;
  private dim!: Phaser.GameObjects.Rectangle;
  private terrain!: Int8Array;
  private walls!: Uint8Array;
  private raised!: Uint8Array;
  private groundPixels!: Uint32Array;
  private untouchedGround!: Uint32Array;
  private groundColors!: ImageData;
  private groundPicture!: Phaser.Textures.CanvasTexture;
  private tears: Tear[] = [];
  private tearsHealAt = 0;

  private fx!: FxLayer;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"w" | "a" | "s" | "d", Phaser.Input.Keyboard.Key>;
  private shift!: Phaser.Input.Keyboard.Key;
  private bolts: Bolt[] = [];
  private crowd: Walker[] = [];
  private skies = new Map<string, FxHandle>();
  private readyAt = new Map<Skill, number>();
  private seed = 1;
  private statsAt = 0;
  private worstCost = 0;

  private combatUntil = 0;
  private stroke = 0;
  private strokeId = 0;
  private strokeAt = 0;
  private strokeEnd = 0;
  private strokeFacing = 0;
  private connects = false;
  private clickWaiting = false;

  constructor() {
    super("game");
  }

  preload() {
    this.load.image("shadow", "assets/character/shadow.png");
    this.load.image("dummy", "assets/character/dummy.png");
  }

  create() {
    const { width, height } = this.scale;
    this.bolts = [];
    this.crowd = [];
    this.skies = new Map();
    this.physics.world.setBounds(0, 0, width, height);
    const { water: waterPixels, blades } = this.createGround();
    this.dim = this.add.rectangle(0, 0, width, height, 0x04030a).setOrigin(0).setDepth(DIM_DEPTH).setAlpha(0);
    this.fx = new FxLayer(this, { viewW: width, viewH: height, worldW: width, worldH: height, backDepth: FX_BACK_DEPTH, frontDepth: FX_FRONT_DEPTH });
    this.water = this.fx.add("tiles/water", { x: START.x, y: START.y, pixels: waterPixels, pokes: [], seed: GROUND_SEED });
    this.grass = this.fx.add("tiles/grass", { pokes: [], x: START.x, y: START.y, blades });
    this.fx.add("fire/brazier", { x: BRAZIER.x, y: BRAZIER.y, seed: this.seed++ });
    this.lights.enable();
    this.fx.useLights();
    this.lantern = this.lights.addLight(START.x, START.y, LANTERN.radius, LANTERN.color, 0, LANTERN.height);
    this.brazierLight = this.lights.addLight(BRAZIER.x, BRAZIER.y - 30, BRAZIER.radius, BRAZIER.color, 0, BRAZIER.height);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.fx.destroy(this);
      this.textures.remove("ground");
    });

    this.dummy = this.physics.add.staticSprite(DUMMY_SPOT.x, DUMMY_SPOT.y, "dummy").setOrigin(0.5, 1);
    this.dummy.setDepth(this.dummy.y).refreshBody().setLighting(true);
    this.dummy.body!.setSize(10, 6).setOffset(3, 18);
    this.add.image(this.dummy.x, this.dummy.y, "shadow").setDepth(1);

    // only his feet exist for the physics: all you see of him is the knight the worker draws here
    this.player = this.add.zone(START.x, START.y, FOOT_BOX.w, FOOT_BOX.h);
    this.physics.add.existing(this.player);
    this.playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    this.playerBody.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.dummy);
    this.knight = this.fx.addHero(KNIGHT, { x: this.player.x, y: this.player.y, facing: 0 });

    const keyboard = this.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.wasd = keyboard.addKeys({ w: "W", a: "A", s: "S", d: "D" }) as typeof this.wasd;
    this.shift = keyboard.addKey("SHIFT");
    SKILLS.forEach((skill, i) => keyboard.on(`keydown-${SKILL_KEYS[i]}`, () => this.cast(skill)));
    keyboard.on("keydown-T", () => this.stressTest());
    keyboard.on("keydown-K", () => this.addCrowd());
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) this.clickWaiting = true;
    });

    this.showSkillList();
  }

  update(time: number, delta: number) {
    const dt = Math.min(delta / 1000, MAX_DT);
    this.startStroke(time);
    this.movePlayer(time);
    this.moveBolts(dt);
    this.moveCrowd(dt);
    weather.update(dt, time / 1000);
    this.changeSky();
    this.changeLight(time);
    this.healTears(time);
    const hero = { x: this.player.x, y: this.feetY };
    this.fx.update(dt, 0, 0, hero, weather.air);
    this.fx.keepHeroAt(hero.x, hero.y);
    this.showStats(time);
  }

  /** Paints the tiles into one picture, and hands back the pixels that are water for the live water to work on. */
  private createGround() {
    const { width, height } = this.scale, { pixels, terrain, walls, raised, depth, water, blades } = paintGround(TEST_MAP, GROUND_SEED, width, height, TEST_LEVELS), canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    this.groundColors = new ImageData(new Uint8ClampedArray(pixels.buffer as ArrayBuffer), width, height);
    canvas.getContext("2d")!.putImageData(this.groundColors, 0, 0);
    this.groundPicture = this.textures.addCanvas("ground", canvas)!;
    this.add.image(0, 0, "ground").setOrigin(0).setLighting(true);
    this.groundPixels = pixels;
    this.untouchedGround = pixels.slice();
    this.tears = [];
    this.terrain = terrain;
    this.walls = walls;
    this.raised = raised;
    this.depth = depth;
    return { water, blades };
  }

  /** Lets the weather fall: each sky plays as strongly as the weather says, and comes and goes as the values change. */
  private changeSky() {
    const { rain, wind, temperature, snowCover } = weather.here, frozen = temperature <= 0, wet = frozen ? 0 : rain;
    const amounts: Record<string, number> = { rain: wet, snow: frozen && wind < GALE ? rain : 0, blizzard: frozen && wind >= GALE ? rain : 0, splashes: wet, cover: snowCover };
    const ground = { terrain: this.terrain, width: this.scale.width, height: this.scale.height, water: WATER };
    for (const [sky, amount] of Object.entries(amounts)) {
      const handle = this.skies.get(sky);
      if (handle && amount < SKY_ENDS) {
        this.fx.stop(handle);
        this.skies.delete(sky);
      } else if (handle) this.fx.move(handle, 0, 0, { amount });
      else if (amount > SKY_STARTS) {
        const seed = this.seed++;
        const options = sky === "splashes" || sky === "cover" ? { ...ground, seed } : { sky, amount, seed };
        this.skies.set(sky, this.fx.add(sky === "splashes" ? "weather/splashes" : sky === "cover" ? "weather/snow-cover" : "weather/sky", { x: 0, y: 0, ...options }));
      }
    }
    this.dim.setAlpha(rain * CLOUD_DARK);
  }

  /** The sun sets the light over everything; as it goes, what burns in the world starts to show. */
  private changeLight(time: number) {
    const day = weather.values.daylight, night = 1 - day, mix = (low: number) => Math.round(low + (255 - low) * day);
    this.lights.setAmbientColor((mix(NIGHT_AMBIENT.r) << 16) | (mix(NIGHT_AMBIENT.g) << 8) | mix(NIGHT_AMBIENT.b));
    this.lantern.setPosition(this.player.x, this.feetY - 14);
    this.lantern.intensity = LANTERN.strength * night;
    this.brazierLight.intensity = BRAZIER.strength * night * (0.9 + Math.sin(time * 0.013) * 0.06 + Math.sin(time * 0.031) * 0.04);
  }

  /** A spell landing lights up everything round it for a moment. */
  private flash(x: number, y: number) {
    const light = this.lights.addLight(x, y, BLAST_LIGHT.radius, BLAST_LIGHT.color, BLAST_LIGHT.strength * (0.4 + (1 - weather.values.daylight) * 0.6), BLAST_LIGHT.height);
    this.tweens.add({ targets: light, intensity: 0, duration: BLAST_LIGHT.ms, ease: "Quad.easeOut", onComplete: () => this.lights.removeLight(light) });
  }

  /** How many pixels a spot is out from the shore: 0 is dry land. */
  private depthAt(x: number, y: number) {
    const { width, height } = this.scale, px = Phaser.Math.Clamp(Math.round(x), 0, width - 1), py = Phaser.Math.Clamp(Math.round(y), 0, height - 1), i = py * width + px;
    return this.terrain[i] === WATER ? this.depth[i] : 0;
  }

  private tooDeep(x: number, y: number) {
    return this.depthAt(x, y) > WADE_DEPTH;
  }

  /** What's at a spot of the ground, in a map of the same size. */
  private at<T extends { [i: number]: number }>(map: T, x: number, y: number) {
    const { width, height } = this.scale;
    return map[Phaser.Math.Clamp(Math.round(y), 0, height - 1) * width + Phaser.Math.Clamp(Math.round(x), 0, width - 1)];
  }

  /** Whether anything stops him going this way: every pixel up to his reach is tried, since the rim of high ground is one pixel thin. */
  private blocked(x: number, y: number, dx: number, dy: number) {
    for (let ahead = 1; ahead <= FEET_AHEAD; ahead++) {
      const px = x + dx * ahead, py = y + dy * ahead;
      if (this.tooDeep(px, py) || this.at(this.walls, px, py)) return true;
    }
    return false;
  }

  /** What a skill does where it lands: it hits the grass round it, and on water it throws up a splash. */
  private strike(skill: Skill, x: number, y: number) {
    this.time.delayedCall(skill.lands ?? 0, () => {
      this.flash(x, y);
      if (skill.world) {
        const { reach, push = 0, burn, frost, tear = 0 } = skill.world;
        this.fx.poke(this.grass, x, y, push, reach, burn ? 1 : 0, frost ? 1 : 0, tear);
        if (tear) this.tear(x, y, tear);
      }
      if (this.depthAt(x, y)) this.fx.add("water/splash", { x, y, stone: false, scale: SPLASH_SIZE, seed: this.seed++ });
    });
    this.ripple(x, y, SKILL_SPLASH, skill.lands ?? 0);
  }

  /** Paints a tear into the ground where a blow landed. */
  private tear(x: number, y: number, size: number) {
    const { width, height } = this.scale, torn = tearGround(this.terrain, width, height, x, y, size, this.seed++);
    if (!torn) return;
    this.tears.push({ ...torn, healsFrom: this.time.now + TEAR_STAYS_MS });
    this.paintTear(torn, 0);
    this.groundPicture.context.putImageData(this.groundColors, 0, 0, torn.x, torn.y, torn.w, torn.h);
    this.groundPicture.refresh();
  }

  /** Puts a tear on the ground with the grass this far back over it, 0 to 1. */
  private paintTear({ x, y, w, h, pixels }: Pick<Tear, "x" | "y" | "w" | "h" | "pixels">, healed: number) {
    const { width } = this.scale, ground = this.groundPixels, untouched = this.untouchedGround;
    const mix = (from: number, to: number, shift: number) => Math.round(((from >>> shift) & 255) + (((to >>> shift) & 255) - ((from >>> shift) & 255)) * healed) << shift;
    for (let row = 0; row < h; row++)
      for (let column = 0; column < w; column++) {
        const earth = pixels[row * w + column], at = (y + row) * width + x + column;
        if (earth) ground[at] = (0xff000000 | mix(earth, untouched[at], 0) | mix(earth, untouched[at], 8) | mix(earth, untouched[at], 16)) >>> 0;
      }
  }

  /** The grass comes back over each tear in turn. Oldest first, so where two overlap the newer stays on top. */
  private healTears(time: number) {
    if (!this.tears.length || time < this.tearsHealAt) return;
    this.tearsHealAt = time + TEAR_HEAL_STEP_MS;
    const healing = this.tears.filter((tear) => time >= tear.healsFrom);
    if (!healing.length) return;
    for (const tear of this.tears) this.paintTear(tear, Phaser.Math.Clamp((time - tear.healsFrom) / TEAR_HEALS_MS, 0, 1));
    this.tears = this.tears.filter((tear) => time < tear.healsFrom + TEAR_HEALS_MS);
    for (const { x, y, w, h } of healing) this.groundPicture.context.putImageData(this.groundColors, 0, 0, x, y, w, h);
    this.groundPicture.refresh();
  }

  /** The color of what a blow throws up at a spot: the ground it landed on. */
  private debrisAt(x: number, y: number) {
    const { width, height } = this.scale, px = Phaser.Math.Clamp(Math.round(x), 0, width - 1), py = Phaser.Math.Clamp(Math.round(y), 0, height - 1);
    return GROUPS[this.terrain[py * width + px]].debris;
  }

  /** A blow that lands on water shows on it. */
  private ripple(x: number, y: number, power: number, delay = 0) {
    if (this.depthAt(x, y)) this.time.delayedCall(delay, () => this.fx.poke(this.water, x, y, power));
  }

  private movePlayer(time: number) {
    const { left, right, up, down } = this.cursors;
    const x = Number(right.isDown || this.wasd.d.isDown) - Number(left.isDown || this.wasd.a.isDown);
    const y = Number(down.isDown || this.wasd.s.isDown) - Number(up.isDown || this.wasd.w.isDown);
    const striking = time < this.strokeEnd, feetY = this.feetY;
    const speed = (striking ? STROKE_SPEED : this.shift.isDown ? RUN_SPEED : SPEED) * (this.depthAt(this.player.x, feetY) ? WADING : 1);
    const velocity = new Phaser.Math.Vector2(x, y).normalize().scale(speed);
    const hit = this.strokeAt + STROKES[this.stroke].hit * 1000;
    if (striking && time > hit - LUNGE_MS && time < hit) velocity.set(Math.cos(this.strokeFacing) * LUNGE_SPEED, Math.sin(this.strokeFacing) * LUNGE_SPEED * SY);
    // each way is tried by itself, so he slides along the shore
    if (velocity.x && this.blocked(this.player.x, feetY, Math.sign(velocity.x), 0)) velocity.x = 0;
    if (velocity.y && this.blocked(this.player.x, feetY, 0, Math.sign(velocity.y))) velocity.y = 0;
    this.playerBody.setVelocity(velocity.x, velocity.y);

    // swinging he looks along the blow; walking, where he's going; standing, at the cursor
    const facing = striking ? this.strokeFacing : x || y ? Math.atan2(y, x) : this.cursorFacing();
    this.fx.move(this.knight, this.player.x, feetY, { facing, guard: time < this.combatUntil, stroke: this.stroke, strokeId: this.strokeId, connects: this.connects });
    this.fx.move(this.grass, this.player.x, feetY);
    this.fx.move(this.water, this.player.x, feetY);
    this.fx.heroDepth = feetY;
  }

  private get feetY() {
    return this.player.y + FOOT_BOX.h / 2;
  }

  private cursorFacing() {
    const { worldX, worldY } = this.input.activePointer;
    return Math.atan2((worldY - this.feetY) / SY, worldX - this.player.x);
  }

  private startStroke(time: number) {
    if (!this.clickWaiting || time < this.strokeEnd - CANCEL_MS) return;
    this.clickWaiting = false;
    this.stroke = time < this.strokeEnd + COMBO_GAP_MS ? (this.stroke + 1) % STROKES.length : 0;
    const stroke = STROKES[this.stroke], index = this.stroke, facing = this.cursorFacing();
    this.connects = this.dummyInReach(facing);
    this.strokeId++;
    this.strokeAt = time;
    this.strokeFacing = facing;
    this.strokeEnd = time + (stroke.length + (this.connects ? stroke.freeze : 0)) * 1000;
    this.combatUntil = this.strokeEnd + GUARD_MS;
    const hitMs = stroke.hit * 1000, connects = this.connects;
    this.time.delayedCall(hitMs - SLASH_LEAD_MS, () => this.slash(index, facing));
    if (connects) this.time.delayedCall(hitMs, () => this.hitDummy(index, facing));
  }

  private dummyInReach(facing: number) {
    const dx = this.dummy.x - this.player.x, dy = (this.dummy.y - this.feetY) / SY;
    const off = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - facing));
    return Math.hypot(dx, dy) <= SWORD_REACH && off <= SWORD_ARC;
  }

  /** The crescent, swung round his chest. A mirrored and turned-over one sweeps the other way, for the backhand. */
  private slash(stroke: number, facing: number) {
    const dx = Math.cos(facing), dy = Math.sin(facing) * SY, leftward = dx < 0;
    let flip = leftward, angle = leftward ? Math.atan2(-dy, -dx) : Math.atan2(dy, dx);
    if (stroke === 1) {
      flip = !flip;
      angle += Math.PI;
    }
    const pivotY = this.feetY - SLASH_PIVOT;
    this.fx.add("melee/sword-slash", {
      x: this.player.x - SLASH_PIVOT * Math.sin(angle),
      y: pivotY + SLASH_PIVOT * Math.cos(angle),
      flip,
      angle,
      seed: this.seed++,
    });
  }

  private hitDummy(stroke: number, facing: number) {
    const dummy = this.dummy, push = Math.cos(facing) < 0 ? -1 : 1, finisher = stroke === FINISHER;
    this.fx.add(finisher ? "impacts/crit-hit" : "impacts/hit-spark", { x: dummy.x, y: dummy.y - DUMMY_CHEST, seed: this.seed++, flip: push < 0 });
    this.cameras.main.shake(finisher ? 140 : 70, finisher ? 0.006 : 0.003);
    dummy.tintMode = Phaser.TintModes.FILL;
    dummy.setTint(0xffffff);
    this.time.delayedCall(70, () => {
      dummy.clearTint();
      dummy.tintMode = Phaser.TintModes.MULTIPLY;
    });
    this.tweens.killTweensOf(dummy);
    dummy.setAngle(0);
    this.tweens.add({ targets: dummy, angle: { from: push * (finisher ? 16 : 9), to: 0 }, duration: finisher ? 420 : 260, ease: "Elastic.easeOut" });
  }

  private cast(skill: Skill) {
    if (this.time.now < (this.readyAt.get(skill) ?? 0)) return;
    this.readyAt.set(skill, this.time.now + (skill.cooldown ?? 0));
    this.combatUntil = this.time.now + GUARD_MS;
    const { worldX, worldY } = this.input.activePointer;
    const x = this.player.x, y = this.feetY;
    if (skill.kind === "ground") {
      this.spawn(skill, skill.fx, worldX, worldY, { stone: this.debrisAt(worldX, worldY) });
      this.strike(skill, worldX, worldY);
    } else if (skill.kind === "self") {
      this.spawn(skill, skill.fx, x, y);
      this.strike(skill, x, y);
    }
    else if (skill.kind === "aimed") this.spawn(skill, skill.fx, x, y, { angle: Math.atan2(worldY - y, worldX - x) });
    else this.launch(skill, x, y - HAND_HEIGHT, worldX, worldY);
  }

  private spawn(skill: Skill, fx: string, x: number, y: number, extra?: Record<string, unknown>) {
    return this.fx.add(fx, { ...skill.options, ...extra, x, y, seed: this.seed++ }, skill.gas);
  }

  private launch(skill: Skill, x: number, y: number, toX: number, toY: number) {
    const angle = Math.atan2(toY - y, toX - x), speed = skill.speed!;
    const fx = this.spawn(skill, skill.fx, x, y, { angle });
    const left = Math.hypot(toX - x, toY - y) / speed;
    this.bolts.push({ fx, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, left, skill, fromHigh: !!this.at(this.raised, x, y + HAND_HEIGHT) });
  }

  private moveBolts(dt: number) {
    this.bolts = this.bolts.filter((bolt) => {
      const x = bolt.fx.x + bolt.vx * dt, y = bolt.fx.y + bolt.vy * dt;
      this.fx.move(bolt.fx, x, y);
      bolt.left -= dt;
      const hitsCliff = !bolt.fromHigh && this.at(this.walls, x, y) === WALL.FACE; // from below a cliff stops it; from above it flies out over
      if (bolt.left > 0 && !hitsCliff) return true;
      this.fx.stop(bolt.fx);
      this.strike(bolt.skill, x, y);
      if (bolt.skill.impact) this.fx.add(bolt.skill.impact, { x, y, ...ON_FLOOR, scale: bolt.skill.options?.scale, stone: this.debrisAt(x, y), seed: this.seed++ });
      return false;
    });
  }

  private stressTest() {
    const placed = SKILLS.filter((skill) => skill.kind === "ground" || skill.kind === "self"), { width, height } = this.scale;
    for (let i = 0; i < STRESS_COUNT; i++) {
      const skill = Phaser.Utils.Array.GetRandom(placed);
      this.spawn(skill, skill.fx, Phaser.Math.Between(40, width - 40), Phaser.Math.Between(60, height - 20));
    }
  }

  private addCrowd() {
    const { width, height } = this.scale;
    for (let i = 0; i < CROWD_COUNT; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const x = Phaser.Math.Between(40, width - 40), y = Phaser.Math.Between(60, height - 10);
      const fx = this.fx.add(KNIGHT, { x, y, facing: angle });
      this.crowd.push({ fx, vx: Math.cos(angle) * SPEED, vy: Math.sin(angle) * SPEED });
    }
  }

  private moveCrowd(dt: number) {
    const { width, height } = this.scale;
    for (const walker of this.crowd) {
      const x = walker.fx.x + walker.vx * dt, y = walker.fx.y + walker.vy * dt;
      if (x < 20 || x > width - 20) walker.vx = -walker.vx;
      if (y < 40 || y > height - 6) walker.vy = -walker.vy;
      this.fx.move(walker.fx, x, y, { facing: Math.atan2(walker.vy, walker.vx) });
    }
  }

  private showSkillList() {
    const list = document.getElementById("skills")!;
    list.innerHTML = SKILLS.map((skill, i) => `<span><kbd>${(i + 1) % 10}</kbd> ${skill.name}</span>`).join("");
  }

  private showStats(time: number) {
    this.worstCost = Math.max(this.worstCost, this.fx.cost);
    if (time < this.statsAt) return;
    this.statsAt = time + 500;
    document.getElementById("fps")!.textContent = `${Math.round(this.game.loop.actualFps)} FPS`;
    document.getElementById("stats")!.textContent = `${this.fx.count} efekt · ${this.fx.workers} çekirdek · en yavaş çekirdek ${this.worstCost.toFixed(1)} ms`;
    this.worstCost = 0;
  }
}

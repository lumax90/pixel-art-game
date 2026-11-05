import * as Phaser from "phaser";

// effects are animated at 30 fps; a faster screen only pays for repeats of the same picture
const TICK = 1 / 30;
const MAX_DT = 0.1;
const SPARE_CORES = 2; // left for the game itself and the browser
const MAX_WORKERS = 6;
const OVERSCAN = 16; // px drawn past each edge of the view, so a picture a tick old still fills it while the camera moves

type Command =
  | { type: "spawn"; id: number; fx: string; options: Record<string, unknown> }
  | ({ type: "move"; id: number; x: number; y: number } & FxState)
  | { type: "poke"; id: number; at: (number | string)[] }
  | { type: "stop"; id: number };

/** What the game can tell a live character, besides where it is. */
export interface FxState {
  facing?: number;
  guard?: boolean;
  stroke?: number;
  strokeId?: number;
  connects?: boolean;
  amount?: number;
}

interface Reply {
  count: number;
  active: boolean;
  cost: number;
  heaviest?: string;
  heaviestCost?: number;
  /** Each picture that has changed, and null for one that hasn't. */
  bitmaps: (ImageBitmap | null)[] | null;
  filled?: boolean[];
  ox: number;
  oy: number;
  anchor?: [number, number];
}

/** A Phaser image showing the pictures a worker sends. */
function createSurface(scene: Phaser.Scene, key: string, w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const texture = scene.textures.addCanvas(key, canvas)!, source = texture.source[0];
  const renderer = scene.sys.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  // WebGL ignores Phaser's upload flip for bitmaps, so they arrive upside down
  const image = scene.add.image(0, 0, key).setOrigin(0).setFlipY(true);
  const show = (bitmap: ImageBitmap) => {
    renderer.updateCanvasTexture(bitmap as unknown as HTMLCanvasElement, source.glTexture!, source.flipY);
    bitmap.close();
  };
  return { image, show };
}

interface Slot {
  worker: Worker;
  surfaces: ReturnType<typeof createSurface>[];
  commands: Command[];
  moves: Map<number, Command>;
  dt: number;
  busy: boolean;
  active: boolean;
  count: number;
  planned: number;
  cost: number;
  ticks: number;
  nextTick: number;
  ox: number;
  oy: number;
  drawnAt: [number, number] | null;
}

/** A playing effect, as the game sees it. The effect itself lives on a worker. */
export interface FxHandle {
  id: number;
  slot: Slot;
  x: number;
  y: number;
}

interface FxSizes {
  viewW: number;
  viewH: number;
  worldW: number;
  worldH: number;
  backDepth: number;
  frontDepth: number;
}

/**
 * Runs effects on as many workers as the machine has cores to spare. The first worker also owns the gas field, so
 * every effect that makes gas goes there. One more worker draws the hero: its picture alone takes his depth, so he sorts
 * with the sprites and stands between the gas and its veil.
 */
export class FxLayer {
  private readonly pool: Slot[];
  private readonly hero: Slot;
  private readonly slots: Slot[];
  private nextId = 1;
  private clock = 0;
  private sent = 0;
  private heaviest = { name: "", ms: 0 };

  constructor(scene: Phaser.Scene, sizes: FxSizes) {
    const count = Phaser.Math.Clamp(navigator.hardwareConcurrency - SPARE_CORES, 1, MAX_WORKERS);
    this.pool = Array.from({ length: count }, (_, i) => this.createSlot(scene, String(i), sizes, i === 0));
    this.hero = this.createSlot(scene, "hero", sizes, false);
    this.slots = [...this.pool, this.hero];
  }

  private createSlot(scene: Phaser.Scene, index: string, sizes: FxSizes, hasGas: boolean) {
    const { viewW, viewH, worldW, worldH, backDepth, frontDepth } = sizes, w = viewW + OVERSCAN * 2, h = viewH + OVERSCAN * 2;
    const worker = new Worker(new URL("./fx/worker.js", import.meta.url), { type: "module" });
    const surfaces = ["back", "front", "light"].map((name) => createSurface(scene, `fx-${index}-${name}`, w, h));
    surfaces[0].image.setDepth(backDepth);
    surfaces[1].image.setDepth(frontDepth);
    surfaces[2].image.setDepth(frontDepth + 1).setBlendMode(Phaser.BlendModes.ADD);
    const slot: Slot = { worker, surfaces, commands: [], moves: new Map(), dt: 0, busy: false, active: false, count: 0, planned: 0, cost: 0, ticks: 0, nextTick: 0, ox: 0, oy: 0, drawnAt: null };
    worker.onmessage = ({ data }: MessageEvent<Reply>) => this.receive(slot, data);
    worker.postMessage({ type: "init", w, h, hasGas, worldW, worldH });
    return slot;
  }

  private receive(slot: Slot, reply: Reply) {
    slot.busy = false;
    slot.active = reply.active;
    slot.count = reply.count;
    slot.planned = reply.count;
    slot.cost = reply.cost;
    slot.ticks++;
    if ((reply.heaviestCost ?? 0) > this.heaviest.ms) this.heaviest = { name: reply.heaviest ?? "", ms: reply.heaviestCost! };
    if (!reply.bitmaps) return;
    reply.bitmaps.forEach((bitmap, i) => {
      // a picture with nothing on it costs the same to draw as a full one, so it isn't drawn
      slot.surfaces[i].image.setVisible(!!reply.filled?.[i]);
      if (!bitmap) return;
      slot.surfaces[i].show(bitmap);
      this.sent++;
    });
    slot.ox = reply.ox;
    slot.oy = reply.oy;
    slot.drawnAt = reply.anchor ?? null;
    for (const { image } of slot.surfaces) image.setPosition(reply.ox, reply.oy);
  }

  /** Stops every worker and lets go of its pictures, for when the view changes size and all this is built anew. */
  destroy(scene: Phaser.Scene) {
    for (const { worker, surfaces } of this.slots) {
      worker.terminate();
      for (const { image } of surfaces) scene.textures.remove(image.texture.key);
    }
  }

  /** How often the workers kept up since this was last asked: the rate of the slowest of them, per second, over this many milliseconds. */
  takePace(spent: number) {
    const working = this.slots.filter((slot) => slot.active), slowest = working.length ? Math.min(...working.map((slot) => slot.ticks)) : 0;
    for (const slot of this.slots) slot.ticks = 0;
    return Math.round((slowest * 1000) / spent);
  }

  /** The costliest thing any worker did in one tick since this was last asked. */
  takeHeaviest() {
    const heaviest = this.heaviest;
    this.heaviest = { name: "", ms: 0 };
    return heaviest;
  }

  /** Pictures that have come from the workers since this was last asked. */
  takeSent() {
    const sent = this.sent;
    this.sent = 0;
    return sent;
  }

  /** The pictures being drawn now, and how many there are. */
  get layers() {
    const all = this.slots.flatMap((slot) => slot.surfaces);
    return { shown: all.filter(({ image }) => image.visible).length, all: all.length };
  }

  /** Effects playing now, across all workers. */
  get count() {
    return this.slots.reduce((sum, slot) => sum + slot.count, 0);
  }

  get workers() {
    return this.slots.length;
  }

  /** The slowest worker's last tick, in milliseconds. */
  get cost() {
    return Math.max(...this.slots.map((slot) => slot.cost));
  }

  add(fx: string, options: { x: number; y: number } & Record<string, unknown>, usesGas = false): FxHandle {
    const slot = usesGas ? this.pool[0] : this.pool.reduce((best, next) => (next.planned < best.planned ? next : best));
    return this.start(slot, fx, options);
  }

  addHero(fx: string, options: { x: number; y: number } & Record<string, unknown>) {
    return this.start(this.hero, fx, options);
  }

  private start(slot: Slot, fx: string, options: { x: number; y: number } & Record<string, unknown>): FxHandle {
    const id = this.nextId++;
    slot.commands.push({ type: "spawn", id, fx, options });
    slot.planned++;
    return { id, slot, x: options.x, y: options.y };
  }

  /** Lets the scene's lights fall on what stands in the world: the ground layers and the hero, but not spells, which give light. */
  useLights() {
    for (const { surfaces } of this.slots) surfaces[0].image.setLighting(true);
    this.hero.surfaces[1].image.setLighting(true);
  }

  /** Where the hero sorts among the sprites. */
  set heroDepth(depth: number) {
    this.hero.surfaces[1].image.setDepth(depth);
  }

  /**
   * His picture is up to a tick behind him, which the eye catches as a shudder once the camera follows him smoothly. So
   * the picture is slid to where he is now, every frame.
   */
  keepHeroAt(x: number, y: number) {
    const { surfaces, ox, oy, drawnAt } = this.hero;
    if (!drawnAt) return;
    for (const { image } of surfaces) image.setPosition(Math.round(ox + x - drawnAt[0]), Math.round(oy + y - drawnAt[1]));
  }

  move(handle: FxHandle, x: number, y: number, state?: FxState) {
    handle.x = x;
    handle.y = y;
    handle.slot.moves.set(handle.id, { type: "move", id: handle.id, x, y, ...state });
  }

  /** Something touches a live surface at this spot, this hard. */
  poke(handle: FxHandle, ...at: (number | string)[]) {
    handle.slot.commands.push({ type: "poke", id: handle.id, at });
  }

  stop(handle: FxHandle) {
    handle.slot.commands.push({ type: "stop", id: handle.id });
  }

  update(dt: number, viewX: number, viewY: number, hero: { x: number; y: number }, weather: object) {
    this.clock += dt;
    const ox = Math.floor(viewX) - OVERSCAN, oy = Math.floor(viewY) - OVERSCAN;
    for (const slot of this.slots) {
      slot.dt += dt;
      const idle = !slot.active && !slot.commands.length && !slot.moves.size && !slot.planned;
      if (idle) slot.dt = 0;
      if (idle || slot.busy || this.clock < slot.nextTick) continue;
      // each worker goes again as soon as it's due and free: one that runs a little late loses a little, not a whole tick
      slot.nextTick = Math.max(slot.nextTick + TICK, this.clock);
      slot.busy = true;
      const anchor = slot === this.hero ? [Math.round(hero.x), Math.round(hero.y)] : undefined;
      slot.worker.postMessage({ type: "tick", dt: Math.min(slot.dt, MAX_DT), commands: [...slot.commands, ...slot.moves.values()], ox, oy, anchor, weather });
      slot.commands = [];
      slot.moves.clear();
      slot.dt = 0;
    }
  }
}

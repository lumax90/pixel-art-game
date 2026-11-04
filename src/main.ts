import * as Phaser from "phaser";
import { GameScene } from "./GameScene";
import { setupTileBook } from "./tiles/book.js";
import { setupWeatherPanel } from "./weather/panel.js";

const VIEW_HEIGHT = 540; // about this many pixels of game tall, whatever the screen: the knight stays the same share of it
const RESIZE_WAIT_MS = 200;
const MAX_LIGHTS = 24;

/** The view fills the window: pixels are blown up a whole number of times, and the game shows as much as then fits. */
function viewForWindow() {
  const zoom = Math.max(1, Math.round(innerHeight / VIEW_HEIGHT));
  return { zoom, width: Math.ceil(innerWidth / zoom), height: Math.ceil(innerHeight / zoom) };
}

const first = viewForWindow();
const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: "game",
  width: first.width,
  height: first.height,
  zoom: first.zoom,
  backgroundColor: "#14121a",
  pixelArt: true,
  render: { maxLights: MAX_LIGHTS },
  physics: { default: "arcade", arcade: { gravity: { x: 0, y: 0 } } },
  scene: GameScene,
});

if (import.meta.env.DEV) Object.assign(window, { game });
setupTileBook();
setupWeatherPanel();

// the ground and the effect layers are made to the size of the view, so a new size builds the scene again
let waiting = 0;
addEventListener("resize", () => {
  clearTimeout(waiting);
  waiting = window.setTimeout(() => {
    const { zoom, width, height } = viewForWindow();
    if (width === game.scale.width && height === game.scale.height && zoom === game.scale.zoom) return;
    game.scale.resize(width, height);
    game.scale.setZoom(zoom);
    game.scene.getScene("game")!.scene.restart();
  }, RESIZE_WAIT_MS);
});

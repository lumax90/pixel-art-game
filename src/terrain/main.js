// A test, apart from the game: the real land in true 3D, drawn small and shown in big pixels, with the 2D character walking on it.
import * as THREE from "three";
import { clearFrame, composite, createFrame, createFx } from "../../vendor/pixelfx/src/core/index.js";
import * as character from "../fx/characters/template.js";
import { paintGround } from "../tiles/ground.js";
import { GEIRANGER } from "../tiles/test-map.js";
import { TILE } from "../tiles/groups.js";
import { createLandMaterial } from "./material.js";

const VIEW_TALL = 400; // about this many px of picture tall, before it's blown up by a whole number: anything else makes px of uneven sizes
const SAMPLE = 8; // px of ground between two height samples
const SLANT = 0.55, UP = Math.sqrt(1 - SLANT * SLANT); // the floor seen at the game's angle
const LIFT = 1; // how much taller than true the land stands
const SPEED = 125, ACCELERATION = 700, STEEPEST = 1.1; // px/s over the ground; how quickly that changes; and how far up for each px along that he can still climb
const WATER = 80;
const HERO = { wide: 112, tall: 92, footX: 56, footY: 72, height: 36 };
const FEEL = 10; // px either side of him that the slope is read over
const FRONT = 40; // px the hero's picture sits nearer the view than he is, so his feet don't sink into a slope

const note = document.getElementById("note");
const map = await (await fetch("/terrain/geiranger.json")).json(), bytes = await (await fetch("/terrain/geiranger.bin")).arrayBuffer();
const { wide, tall, metres } = map, heights = new Int16Array(bytes, 0, wide * tall), cover = new Uint8Array(bytes, wide * tall * 2, wide * tall);
const perMetre = (SAMPLE / metres) * LIFT;

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14121a);

// the land: one plane of samples, pushed up by its heights
const land = new THREE.PlaneGeometry((wide - 1) * SAMPLE, (tall - 1) * SAMPLE, wide - 1, tall - 1);
land.rotateX(-Math.PI / 2);
land.translate(((wide - 1) * SAMPLE) / 2, 0, ((tall - 1) * SAMPLE) / 2);
const places = land.attributes.position;
for (let i = 0; i < places.count; i++) places.setY(i, Math.max(0, heights[i]) * perMetre);
land.computeVertexNormals();
const coverPicture = new THREE.DataTexture(cover, wide, tall, THREE.RedFormat, THREE.UnsignedByteType);
coverPicture.magFilter = coverPicture.minFilter = THREE.NearestFilter;
coverPicture.flipY = false;
coverPicture.needsUpdate = true;
const uvs = land.attributes.uv;
for (let i = 0; i < uvs.count; i++) uvs.setXY(i, (places.getX(i) / ((wide - 1) * SAMPLE)), places.getZ(i) / ((tall - 1) * SAMPLE));

// the ground is the game's own tiles: painted from above as ever, then laid over the land
note.textContent = "Zemin çiziliyor…";
await new Promise((done) => setTimeout(done, 30));
const groundWide = GEIRANGER.rows[0].length * TILE, groundTall = GEIRANGER.rows.length * TILE, { pixels } = paintGround(GEIRANGER.rows, 7, groundWide, groundTall);
const groundPicture = new THREE.DataTexture(new Uint8Array(pixels.buffer), groundWide, groundTall, THREE.RGBAFormat, THREE.UnsignedByteType);
groundPicture.magFilter = groundPicture.minFilter = THREE.NearestFilter;
groundPicture.flipY = false;
groundPicture.needsUpdate = true;
const material = createLandMaterial(coverPicture, groundPicture);
scene.add(new THREE.Mesh(land, material));

// the hero: the same 2D character as the game, on a picture that always faces the view
const frame = createFrame(HERO.wide, HERO.tall), picture = document.createElement("canvas"), pen = picture.getContext("2d"), image = new ImageData(HERO.wide, HERO.tall);
picture.width = HERO.wide;
picture.height = HERO.tall;
frame.ox = -HERO.footX;
frame.oy = -HERO.footY;
const heroPicture = new THREE.CanvasTexture(picture);
heroPicture.magFilter = heroPicture.minFilter = THREE.NearestFilter;
heroPicture.colorSpace = THREE.NoColorSpace;
const hero = new THREE.Sprite(new THREE.SpriteMaterial({ map: heroPicture, alphaTest: 0.5, depthTest: false }));
hero.scale.set(HERO.wide, HERO.tall, 1);
hero.center.set(HERO.footX / HERO.wide, 1 - HERO.footY / HERO.tall);
scene.add(hero);
const fx = createFx(character, { x: 0, y: 0, facing: 0, look: "barbarian", height: HERO.height, sword: false, stance: "Idle_Loop", vx: 0, vy: 0 });

function heightAt(x, z) {
  const gx = Math.max(0, Math.min(wide - 1.001, x / SAMPLE)), gz = Math.max(0, Math.min(tall - 1.001, z / SAMPLE)), ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix, v = gz - iz, at = (a, b) => Math.max(0, heights[b * wide + a]);
  return (at(ix, iz) * (1 - u) * (1 - v) + at(ix + 1, iz) * u * (1 - v) + at(ix, iz + 1) * (1 - u) * v + at(ix + 1, iz + 1) * u * v) * perMetre;
}
const coverAt = (x, z) => cover[Math.round(z / SAMPLE) * wide + Math.round(x / SAMPLE)];

/** Whether he can take this step: not into water, and not up a wall. */
function canStep(fromX, fromZ, x, z) {
  if (x < 0 || z < 0 || x >= (wide - 1) * SAMPLE || z >= (tall - 1) * SAMPLE || coverAt(x, z) === WATER) return false;
  const along = Math.hypot(x - fromX, z - fromZ) || 1;
  return (heightAt(x, z) - heightAt(fromX, fromZ)) / along <= STEEPEST;
}

// starts by the head of the fjord, on the lowest dry ground near the middle
let walker = { x: (wide * SAMPLE) / 2, z: (tall * SAMPLE) / 2 }, lowest = Infinity;
for (let z = tall * 0.3; z < tall * 0.7; z++)
  for (let x = wide * 0.3; x < wide * 0.7; x++) {
    const i = Math.floor(z) * wide + Math.floor(x), cost = heights[i] + Math.hypot(x - wide * 0.47, z - tall * 0.5) * 3;
    if (cover[i] !== WATER && heights[i] > 4 && cost < lowest) [lowest, walker] = [cost, { x: Math.floor(x) * SAMPLE, z: Math.floor(z) * SAMPLE }];
  }

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 8000), ahead = new THREE.Vector3(0, -SLANT, -UP), upward = new THREE.Vector3(0, UP, -SLANT), DISTANCE = 3000;
camera.up.copy(upward);

function fit() {
  const zoom = Math.max(1, Math.round(innerHeight / VIEW_TALL)), pixelTall = Math.ceil(innerHeight / zoom), pixelWide = Math.ceil(innerWidth / zoom);
  renderer.setPixelRatio(1);
  renderer.setSize(pixelWide, pixelTall, false);
  Object.assign(renderer.domElement.style, { width: `${pixelWide * zoom}px`, height: `${pixelTall * zoom}px` });
  Object.assign(camera, { left: -pixelWide / 2, right: pixelWide / 2, top: pixelTall / 2, bottom: -pixelTall / 2 });
  camera.updateProjectionMatrix();
}
addEventListener("resize", fit);
fit();

/** The view moves by whole px of the picture, along the picture's own axes, and he stands exactly in its middle, on the same px: this keeps the land from shimmering and him from shaking. */
function aimAt(x, y, z) {
  const side = Math.round(x), rise = Math.round(y * UP - z * SLANT), depth = -y * SLANT - z * UP;
  camera.position.set(side, 0, 0).addScaledVector(upward, rise).addScaledVector(ahead, -DISTANCE);
  camera.lookAt(camera.position.clone().add(ahead));
  hero.position.set(side, 0, 0).addScaledVector(upward, rise).addScaledVector(ahead, depth - FRONT);
}

const held = new Set(), keys = { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
addEventListener("keydown", ({ code }) => held.add(code));
addEventListener("keyup", ({ code }) => held.delete(code));
let last = performance.now(), facing = 0, frames = 0, counted = last;
const drift = { x: 0, z: 0 }; // how he's really moving, px/s over the ground

function step(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  let dx = 0, dz = 0;
  for (const code of held) if (keys[code]) [dx, dz] = [dx + keys[code][0], dz + keys[code][1]];
  const length = Math.hypot(dx, dz) || 1, gapX = (dx / length) * SPEED - drift.x, gapZ = (dz / length) * SPEED - drift.z, gap = Math.hypot(gapX, gapZ), reach = gap ? Math.min(1, (ACCELERATION * dt) / gap) : 0;
  drift.x += gapX * reach;
  drift.z += gapZ * reach;
  // his pace is along the ground he's on, so a slope takes more steps to cross than its width on the map; or his feet would slide
  const across = Math.hypot(drift.x, drift.z), probe = across > 1 ? 4 : 0, rise = probe ? (heightAt(walker.x + (drift.x / across) * probe, walker.z + (drift.z / across) * probe) - heightAt(walker.x, walker.z)) / probe : 0, pace = 1 / Math.hypot(1, rise);
  const stepX = drift.x * pace * dt, stepZ = drift.z * pace * dt;
  const canMove = { x: canStep(walker.x, walker.z, walker.x + stepX, walker.z), z: canStep(walker.x + stepX, walker.z, walker.x + stepX, walker.z + stepZ) };
  if (canMove.x) walker.x += stepX;
  else drift.x = 0;
  if (canMove.z) walker.z += stepZ;
  else drift.z = 0;
  if (Math.hypot(drift.x, drift.z) > 30) facing = Math.atan2(drift.z, drift.x);
  else if (dx || dz) facing = Math.atan2(dz, dx);
  const y = heightAt(walker.x, walker.z);
  // his feet go by at what he really covers on the map; the slope under them, felt over a little width, lifts them to the ground
  Object.assign(fx.options, { facing, vx: canMove.x ? drift.x * pace : 0, vy: canMove.z ? drift.z * pace * SLANT : 0, ground: [(heightAt(walker.x + FEEL, walker.z) - heightAt(walker.x - FEEL, walker.z)) / (2 * FEEL), (heightAt(walker.x, walker.z + FEEL) - heightAt(walker.x, walker.z - FEEL)) / (2 * FEEL)] });
  fx.update(dt);
  clearFrame(frame);
  fx.draw(frame, "back");
  fx.draw(frame, "front");
  composite(frame, image.data, null);
  pen.putImageData(image, 0, 0);
  heroPicture.needsUpdate = true;
  aimAt(walker.x, y, walker.z);
  material.uniforms.time.value = now / 1000;
  renderer.render(scene, camera);
  frames++;
  if (now - counted > 1000) {
    note.textContent = `${Math.round((frames * 1000) / (now - counted))} FPS · ${Math.round(y / perMetre)} m · WASD ile yürü`;
    frames = 0;
    counted = now;
  }
  requestAnimationFrame(step);
}
requestAnimationFrame(step);
Object.assign(window, { terrain: { walker, heightAt } });

// The water itself, drawn by the graphics card: the bed seen through a swaying surface, level dashes of light where two sheets of
// swell meet, and thin lines of light over the shallows. It moves in whole pixels at a low frame rate, so it stays pixel art.
// It works on a white picture of the water with the scene's lights on it, which is how the lanterns reach it. What touches the
// water, rings and swells and splashes, stays with the worker in tiles/water.js.
import * as Phaser from "phaser";
import { C, CREST_DRIFT, CREST_RGB, FRAMES_A_SECOND, LIGHT_BEND, LIGHT_DRIFT, LIT_RGB, RGB, SIZE, WINDY_DRIFT, createLightLines, createSwell, lookOfWater } from "../fx/tiles/water-look.js";

const NODE = "WaterShader";
const SHAPE = "water-shape", LOOK = "water-look", TRAITS = "water-traits", NOISE = "water-noise";
const TEXTURES = [SHAPE, LOOK, TRAITS, NOISE];
const CALM_SHARE = 0.4, WINDY_SHARE = 0.4; // of the places a dash of light could be that hold one

const SHADER = `#pragma phaserTemplate(shaderName)
precision highp float;
uniform sampler2D uMainSampler; // the light on the water, and its shape
uniform sampler2D uGround;
uniform sampler2D uLook;
uniform sampler2D uTraits;
uniform sampler2D uNoise;
uniform vec2 uSize;
uniform float uDrift;
uniform float uLightShift;
uniform float uShare;
uniform float uTime;
uniform vec3 uCrest1;
uniform vec3 uCrest2;
uniform vec3 uCrest3;
uniform vec3 uLit1;
uniform vec3 uLit2;
uniform vec3 uLit3;
varying vec2 outTexCoord;
#pragma phaserTemplate(fragmentHeader)
const float NOISE_SIZE = ${SIZE}.0;
const float SWAY = 1.0, HEAVE = 0.6; // px sideways and up and down
const float BEND = ${LIGHT_BEND}.0 * 2.0;
const float DASH_WIDE = 30.0, DASH_TALL = 7.0; // px each dash of light has to itself, so no two crowd together
const float DASH_LONGEST = 12.0; // px
const float DASH_LIFE = 6.0; // seconds to grow and shrink away

vec4 noise (float x, float y)
{
  return texture2D(uNoise, (mod(vec2(x, y), NOISE_SIZE) + 0.5) / NOISE_SIZE);
}

float chance (vec2 cell)
{
  return fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
}

/** A level dash of light: it drifts along its row, and grows and shrinks a pixel at a time, so it never jumps. */
vec3 dashAt (vec2 p, vec3 base)
{
  float row = floor(p.y / DASH_TALL);
  float x = p.x + row * 13.0 + floor(uDrift * (0.6 + chance(vec2(row, 7.0)) * 0.6));
  float cell = floor(x / DASH_WIDE);
  vec2 here = vec2(cell, row);
  if (chance(here) > uShare) return base;
  if (p.y != row * DASH_TALL + floor(chance(here + 1.0) * 3.0)) return base;
  float swell = sin(fract(uTime / DASH_LIFE + chance(here + 2.0)) * 3.14159);
  float reach = floor(DASH_LONGEST * (0.5 + chance(here + 3.0) * 0.5) * swell) * 0.5;
  float off = abs(x - (cell + 0.5) * DASH_WIDE - floor((chance(here + 4.0) - 0.5) * (DASH_WIDE - DASH_LONGEST)));
  if (off > reach) return base;
  return off < reach * 0.3 && swell > 0.8 ? uCrest3 : off < reach * 0.65 ? uCrest2 : uCrest1;
}

vec3 waterAt (vec2 p, vec3 base, vec4 traits)
{
  if (traits.g > 0.5) return base; // the edges keep their own light
  vec3 dashed = dashAt(p, base);
  if (dashed != base) return dashed;
  if (traits.b > 0.1)
  {
    float bend = noise(floor(p.x / 2.0), p.y + uLightShift).r - 0.5;
    float turn = noise(p.x - uLightShift, floor(p.y / 2.0) + 53.0).r - 0.5;
    if (noise(p.x + floor(bend * BEND + 0.5), p.y + floor(turn * BEND + 0.5)).g > 0.5)
      return traits.b > 0.8 ? uLit3 : traits.b > 0.5 ? uLit2 : uLit1;
  }
  return base;
}

void main ()
{
  vec2 p = floor(outTexCoord * uSize);
  float sway = sin(p.y * 0.31 + uTime * 1.2 + sin(p.x * 0.05 + uTime * 0.3) * 1.3);
  float heave = sin(p.x * 0.17 - uTime * 0.9 + p.y * 0.11);
  vec2 bent = p + floor(vec2(sway * SWAY, heave * HEAVE) + 0.5);
  vec2 uv = (bent + 0.5) / uSize;
  if (texture2D(uMainSampler, uv).a < 0.5)
  {
    if (texture2D(uMainSampler, outTexCoord).a < 0.5) { gl_FragColor = vec4(0.0); return; }
    bent = p;
    uv = outTexCoord;
  }
  vec4 traits = texture2D(uTraits, uv);
  // the bed bends through the surface; the marks of light lie on the surface and don't
  vec3 color = mix(texture2D(uGround, uv).rgb, waterAt(p, texture2D(uLook, uv).rgb, traits), traits.r);
  gl_FragColor = vec4(color * texture2D(uMainSampler, uv).rgb, 1.0);
}`;

const shade = (rgb: number[] | undefined) => rgb!.map((value) => value / 255);

class WaterNode extends Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader {
  constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) {
    super(NODE, manager, undefined, SHADER);
  }

  setupTextures(controller: WaterController, textures: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper[]) {
    textures[1] = controller.ground;
    textures[2] = controller.look;
    textures[3] = controller.traits;
    textures[4] = controller.noise;
  }

  setupUniforms(controller: WaterController, drawing: Phaser.Renderer.WebGL.DrawingContext) {
    const { programManager } = this;
    ["uGround", "uLook", "uTraits", "uNoise"].forEach((name, i) => programManager.setUniform(name, i + 1));
    CREST_RGB.forEach((rgb, i) => programManager.setUniform(`uCrest${i + 1}`, shade(rgb)));
    LIT_RGB.forEach((rgb, i) => programManager.setUniform(`uLit${i + 1}`, shade(rgb)));
    programManager.setUniform("uSize", [drawing.width, drawing.height]);
    programManager.setUniform("uDrift", controller.drift);
    programManager.setUniform("uLightShift", controller.lightShift);
    programManager.setUniform("uShare", controller.share);
    programManager.setUniform("uTime", controller.frame / FRAMES_A_SECOND);
  }
}

class WaterController extends Phaser.Filters.Controller {
  frame = 0;
  drift = 0;
  lightShift = 0;
  share = CALM_SHARE;

  constructor(
    camera: Phaser.Cameras.Scene2D.Camera,
    readonly ground: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper,
    readonly look: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper,
    readonly traits: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper,
    readonly noise: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper,
  ) {
    super(camera, NODE);
  }
}

function addPicture(scene: Phaser.Scene, key: string, width: number, height: number, paint: (data: Uint8ClampedArray) => void) {
  const canvas = document.createElement("canvas"), image = new ImageData(width, height);
  canvas.width = width;
  canvas.height = height;
  paint(image.data);
  canvas.getContext("2d")!.putImageData(image, 0, 0);
  scene.textures.addCanvas(key, canvas);
  return scene.textures.getFrame(key).glTexture;
}

/** Lays the water over the ground. `list` holds the water's pixels as x, y, depth. Hand what comes back the time and the wind. */
export function createWaterShader(scene: Phaser.Scene, list: Uint16Array, seed: number, groundKey: string, width: number, height: number) {
  const { renderNodes } = scene.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  if (!renderNodes.hasNode(NODE)) renderNodes.addNodeConstructor(NODE, WaterNode);

  const { base, alpha, rim, lit } = lookOfWater(list, seed), count = list.length / 3, swell = createSwell(seed), lines = createLightLines(seed);
  const eachPixel = (paint: (at: number, n: number) => void) => {
    for (let n = 0; n < count; n++) paint((list[n * 3 + 1] * width + list[n * 3]) * 4, n);
  };
  addPicture(scene, SHAPE, width, height, (data) => eachPixel((at) => data.fill(255, at, at + 4)));
  const look = addPicture(scene, LOOK, width, height, (data) =>
    eachPixel((at, n) => {
      data.set(RGB.get(rim[n] === 1 ? C[4] : rim[n] === 2 ? C[3] : base[n])!, at);
      data[at + 3] = 255;
    }),
  );
  const traits = addPicture(scene, TRAITS, width, height, (data) =>
    eachPixel((at, n) => {
      data.set([alpha[n] * 255, rim[n] ? 255 : 0, lit[n] === C[4] ? 255 : lit[n] === C[3] ? 170 : lit[n] === C[2] ? 85 : 0, 255], at);
    }),
  );
  const noise = addPicture(scene, NOISE, SIZE, SIZE, (data) => {
    for (let i = 0; i < SIZE * SIZE; i++) data.set([swell[i] * 255, lines[i] * 255, 0, 255], i * 4);
  });
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => TEXTURES.forEach((key) => scene.textures.remove(key)));

  const water = new WaterController(scene.cameras.main, scene.textures.getFrame(groundKey).glTexture, look, traits, noise);
  scene.add.image(0, 0, SHAPE).setOrigin(0).setLighting(true).enableFilters().filters!.internal.add(water);

  let time = 0, slide = 0;
  return (dt: number, wind: number) => {
    time += dt;
    slide += (CREST_DRIFT + wind * WINDY_DRIFT) * dt;
    water.frame = Math.floor(time * FRAMES_A_SECOND);
    water.drift = slide;
    water.lightShift = Math.floor(time * LIGHT_DRIFT);
    water.share = CALM_SHARE + wind * WINDY_SHARE;
  };
}

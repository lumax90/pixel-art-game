// How the land is painted in 3D: the same habits as the 2D tiles. Flat tones, one light from the upper left, dithered steps between them,
// and every mark fixed to the world, so nothing crawls as the view moves.
import * as THREE from "three";

const vertexShader = /* glsl */ `
  varying vec3 place;
  varying vec3 facing;
  varying vec2 onMap;
  void main() {
    place = position;
    facing = normal;
    onMap = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D cover;
  uniform sampler2D ground;
  uniform float time;
  uniform float daylight;
  uniform float snow;
  uniform float front;
  varying vec3 place;
  varying vec3 facing;
  varying vec2 onMap;

  const vec3 SUN = normalize(vec3(-0.6, 0.62, -0.5));
  const vec3 NEARER = vec3(0.0, 0.55, 0.835); // the way towards the view
  const vec3 NIGHT = vec3(0.17, 0.21, 0.38); // what's left of the light when the sun is down
  const float WALL = 0.42; // how far a surface tips from level before it stops being ground and is rock face: a picture drawn from above would stretch on it
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { return noise(p) * 0.5 + noise(p * 2.1) * 0.3 + noise(p * 4.3) * 0.2; }
  vec3 ramp(vec3 a, vec3 b, vec3 c, vec3 d, float light) {
    return light < 0.25 ? a : light < 0.5 ? b : light < 0.75 ? c : d;
  }

  void main() {
    if (dot(place, NEARER) < front) discard; // when only what stands between the view and him is wanted
    vec3 n = normalize(facing);
    // marks are made of little clusters, never single px: lone dots read as a halftone print, not as pixel art
    vec3 block = floor(place / 3.0) * 3.0;
    vec2 onGround = block.xz + block.y * 0.7;
    float steep = 1.0 - n.y;
    // land cover has hard square edges at this scale: a little noise lets them wander
    vec2 wander = (vec2(fbm(place.xz * 0.05), fbm(place.xz * 0.05 + 40.0)) - 0.5) * 0.012;
    float kind = floor(texture2D(cover, onMap + wander).r * 255.0 + 0.5);
    float grain = fbm(onGround * 0.07);
    float lit = clamp(dot(n, SUN) * 0.9 + 0.32 + (grain - 0.5) * 0.5, 0.0, 1.0);
    vec3 color;
    if (abs(kind - 80.0) < 0.5 && steep < 0.25) {
      // the bed the tiles painted shows through, so shallows and shores are the game's own; the water lies over it, with slow bands and glints in short runs
      vec2 drift = place.xz + vec2(time * 3.0, time * 0.8);
      float band = fbm(drift * 0.025);
      vec3 sea = band > 0.54 ? vec3(0.1, 0.33, 0.47) : band > 0.42 ? vec3(0.09, 0.27, 0.41) : vec3(0.07, 0.19, 0.31);
      color = mix(texture2D(ground, onMap).rgb, sea, 0.72);
      vec2 dash = floor(vec2(place.x * 0.09 + time * 1.1 + fbm(place.xz * 0.02) * 6.0, place.z * 0.4));
      if (hash(dash) > 0.988) color = vec3(0.56, 0.84, 0.82);
    } else if (steep > WALL) {
      // rock in bands along the slope, so a wall reads as stone and not as a smooth dark sheet
      float bands = sin((place.y * 0.42 + place.x * 0.11 + grain * 9.0));
      // broken up by planes as the rock tiles are, with no tone darker than their shade: a wall is never a black hole
      float planes = fbm(block.xz * 0.11 + block.y * 0.17);
      lit = clamp(lit + bands * 0.12 + (planes - 0.5) * 0.7, 0.0, 1.0);
      color = ramp(vec3(0.235, 0.25, 0.294), vec3(0.357, 0.376, 0.416), vec3(0.455, 0.47, 0.49), vec3(0.62, 0.62, 0.56), lit);
    } else {
      // everything you can stand on is the tiles, drawn as they are: the land only gives them its light, in a few flat steps
      float shade = lit < 0.28 ? 0.62 : lit < 0.5 ? 0.82 : lit < 0.76 ? 1.0 : 1.12;
      color = texture2D(ground, onMap).rgb * shade;
      // snow settles from the top of the land down, in drifts
      if (fbm(block.xz * 0.04) + place.y * 0.0012 > 1.15 - snow) color = (lit < 0.28 ? vec3(0.72, 0.78, 0.86) : lit < 0.76 ? vec3(0.84, 0.88, 0.93) : vec3(0.95, 0.97, 1.0));
    }
    gl_FragColor = vec4(color * mix(NIGHT, vec3(1.0), daylight), 1.0);
  }
`;

export function createLandMaterial(cover, ground) {
  return new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: { cover: { value: cover }, ground: { value: ground }, time: { value: 0 }, daylight: { value: 1 }, snow: { value: 0 }, front: { value: -1e6 } } });
}

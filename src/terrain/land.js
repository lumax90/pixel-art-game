// The land under the game: real terrain in 3D with the game's own tiles laid over it, drawn on a canvas of its own and handed to the game as a picture, under all the rest. The game keeps
// working on a plane: floor x and z for walking, and the same picture plane as ever for all it draws. Only here does height exist.
import * as THREE from "three";
import { createLandMaterial } from "./material.js";

export const SLANT = 0.55, UP = Math.sqrt(1 - SLANT * SLANT); // the floor seen at the game's angle
const SAMPLE = 8; // px of floor between two height samples
const COVER_SEARCH = 420, COVER_MARGIN = 26; // px towards the view that land is looked for in front of someone, and how much nearer than him it must be to hide him

/** info: { wide, tall, metres }, bytes: heights and land cover from tools/maps/terrain.mjs. pixels: the ground painted from above. */
export function createLand(info, bytes, pixels, groundWide, groundTall) {
  const { wide, tall, metres } = info, heights = new Int16Array(bytes, 0, wide * tall), cover = new Uint8Array(bytes, wide * tall * 2, wide * tall), perMetre = SAMPLE / metres;
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14121a);

  const shape = new THREE.PlaneGeometry((wide - 1) * SAMPLE, (tall - 1) * SAMPLE, wide - 1, tall - 1);
  shape.rotateX(-Math.PI / 2);
  shape.translate(((wide - 1) * SAMPLE) / 2, 0, ((tall - 1) * SAMPLE) / 2);
  const places = shape.attributes.position, uvs = shape.attributes.uv;
  for (let i = 0; i < places.count; i++) {
    places.setY(i, Math.max(0, heights[i]) * perMetre);
    uvs.setXY(i, places.getX(i) / ((wide - 1) * SAMPLE), places.getZ(i) / ((tall - 1) * SAMPLE));
  }
  shape.computeVertexNormals();
  const picture = (data, w, h, format) => {
    const texture = new THREE.DataTexture(data, w, h, format, THREE.UnsignedByteType);
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.flipY = false;
    texture.needsUpdate = true;
    return texture;
  };
  const groundPicture = picture(new Uint8Array(pixels.buffer), groundWide, groundTall, THREE.RGBAFormat), groundBytes = new Uint8Array(pixels.buffer);
  const material = createLandMaterial(picture(cover, wide, tall, THREE.RedFormat), groundPicture);
  scene.add(new THREE.Mesh(shape, material));
  const CLOSE_WIDE = 120, CLOSE_TALL = 110, closeUp = new THREE.WebGLRenderTarget(CLOSE_WIDE, CLOSE_TALL, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const closeBytes = new Uint8Array(CLOSE_WIDE * CLOSE_TALL * 4), closeCamera = new THREE.OrthographicCamera(-CLOSE_WIDE / 2, CLOSE_WIDE / 2, CLOSE_TALL / 2, -CLOSE_TALL / 2, 1, 8000);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 8000), ahead = new THREE.Vector3(0, -SLANT, -UP), upward = new THREE.Vector3(0, UP, -SLANT), DISTANCE = 3000;
  camera.up.copy(upward);
  closeCamera.up.copy(upward);
  const heightAt = (x, z) => {
    const gx = Math.max(0, Math.min(wide - 1.001, x / SAMPLE)), gz = Math.max(0, Math.min(tall - 1.001, z / SAMPLE)), ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix, v = gz - iz, at = (a, b) => Math.max(0, heights[b * wide + a]);
    return (at(ix, iz) * (1 - u) * (1 - v) + at(ix + 1, iz) * u * (1 - v) + at(ix, iz + 1) * (1 - u) * v + at(ix + 1, iz + 1) * u * v) * perMetre;
  };
  const aim = (view, side, rise) => {
    view.position.set(side, 0, 0).addScaledVector(upward, rise).addScaledVector(ahead, -DISTANCE);
    view.lookAt(view.position.clone().add(ahead));
  };

  return {
    canvas: renderer.domElement,
    /** How high the ground stands at a spot of the floor, in px. */
    heightAt,
    /** Whether any land stands between the view and someone this tall at this spot of the floor. */
    covers(x, z, tallness) {
      for (const dx of [-7, 0, 7])
        for (let t = 16; t < COVER_SEARCH; t += 8) if (heightAt(x + dx, z + t * UP) > heightAt(x, z) + tallness * 0.5 + t * SLANT) return true;
      return false;
    },
    /** The picture of what stands in front of a spot, its middle at this place in the picture plane: RGBA, top row first, empty where nothing does. */
    drawInFront(x, y, z, side, rise) {
      const background = scene.background;
      scene.background = null;
      material.uniforms.front.value = y * SLANT + z * UP + COVER_MARGIN;
      aim(closeCamera, side, rise);
      renderer.setRenderTarget(closeUp);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, closeCamera);
      renderer.readRenderTargetPixels(closeUp, 0, 0, CLOSE_WIDE, CLOSE_TALL, closeBytes);
      renderer.setRenderTarget(null);
      material.uniforms.front.value = -1e6;
      scene.background = background;
      return { bytes: closeBytes, wide: CLOSE_WIDE, tall: CLOSE_TALL };
    },
    /** Brings a part of the ground picture up to date, after the game has painted on it. */
    repaint(x, y, w, h) {
      const part = new Uint8Array(w * h * 4);
      for (let row = 0; row < h; row++) part.set(groundBytes.subarray((y + row) * groundWide * 4 + x * 4, (y + row) * groundWide * 4 + (x + w) * 4), row * w * 4);
      const patch = new THREE.DataTexture(part, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
      patch.flipY = false;
      patch.needsUpdate = true;
      renderer.copyTextureToTexture(patch, groundPicture, null, new THREE.Vector2(x, y));
      patch.dispose();
    },
    /** Sizes it to the game's view, in px. */
    fit(viewWide, viewTall) {
      renderer.setPixelRatio(1);
      renderer.setSize(viewWide, viewTall, false);
      Object.assign(camera, { left: -viewWide / 2, right: viewWide / 2, top: viewTall / 2, bottom: -viewTall / 2 });
      camera.updateProjectionMatrix();
    },
    /** Draws what's in view, whose top left corner is at this spot of the game's picture plane. */
    draw(left, top, viewWide, viewTall, time, daylight, snow) {
      aim(camera, left + viewWide / 2, -(top + viewTall / 2));
      material.uniforms.time.value = time;
      material.uniforms.daylight.value = daylight;
      material.uniforms.snow.value = snow;
      renderer.render(scene, camera);
    },
    destroy() {
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

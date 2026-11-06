// The real land as data for the 3D test: a grid of heights in metres and land cover classes, read from Copernicus and ESA WorldCover. Run it with:
//   node tools/maps/terrain.mjs <name> <west> <south> <east> <north> <samples wide> <demUrl> <coverUrl>
import { mkdirSync, writeFileSync } from "node:fs";
import { fromUrl } from "geotiff";

const [name, west, south, east, north, wide, demUrl, coverUrl] = process.argv.slice(2).map((part, i) => (i >= 1 && i <= 5 ? Number(part) : part));
const kmWide = (east - west) * 111.3 * Math.cos((((south + north) / 2) * Math.PI) / 180), kmTall = (north - south) * 111.3, tall = Math.round((wide * kmTall) / kmWide);

async function read(url, resampleMethod) {
  const image = await (await fromUrl(url)).getImage(), [x0, y0, x1, y1] = image.getBoundingBox(), w = image.getWidth(), h = image.getHeight();
  const window = [Math.floor(((west - x0) / (x1 - x0)) * w), Math.floor(((y1 - north) / (y1 - y0)) * h), Math.ceil(((east - x0) / (x1 - x0)) * w), Math.ceil(((y1 - south) / (y1 - y0)) * h)];
  return (await image.readRasters({ window, width: wide, height: tall, resampleMethod }))[0];
}

const heights = Int16Array.from(await read(demUrl, "bilinear"), Math.round), cover = Uint8Array.from(await read(coverUrl, "nearest"));
mkdirSync("public/terrain", { recursive: true });
writeFileSync(`public/terrain/${name}.bin`, Buffer.concat([Buffer.from(heights.buffer), Buffer.from(cover.buffer)]));
writeFileSync(`public/terrain/${name}.json`, JSON.stringify({ wide, tall, metres: Math.round((kmWide * 1000) / wide) }));
console.log(name, `${wide}x${tall}`, `${Math.round((kmWide * 1000) / wide)} m a sample`);

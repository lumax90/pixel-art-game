# Credits

## Art

- `public/assets/character/ninja_blue.png`, `shadow.png`, `public/assets/map/tileset_floor.png`: Ninja Adventure Asset Pack by pixel-boy, CC0. Taken from https://github.com/pixel-boy/NinjaAdventure at commit `6ac78232`; the license is stated on https://pixel-boy.itch.io/ninja-adventure-asset-pack.
- `public/assets/character/dummy.png`: made for this project by `scripts/make-dummy.mjs`.

## Code

- `vendor/pixelfx`: https://github.com/patch-gg/pixelfx at commit `a8415968`, MIT. See its `LICENSE` and `NOTICE.md`.
  - Local change: `canvas().paste()` in `tools/lib/fxlib.mjs` writes straight alpha, working around upstream issue #4. Drop it once upstream fixes this.
  - Local change: `src/fx/lightning/lightning-strike.js` takes a `veil` option, so the effect's darkening can be turned off on bright ground.

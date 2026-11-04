// The effects the game can play, by id. Workers load effects from here, since code can't be sent to them in a message.
import * as brazier from "../../vendor/pixelfx/src/fx/fire/brazier.js";
import * as smallExplosion from "../../vendor/pixelfx/src/fx/explosions/small-explosion.js";
import * as fireball from "../../vendor/pixelfx/src/fx/fire/fireball.js";
import * as fireRing from "../../vendor/pixelfx/src/fx/fire/fire-ring.js";
import * as meteor from "../../vendor/pixelfx/src/fx/fire/meteor.js";
import * as smite from "../../vendor/pixelfx/src/fx/holy/smite.js";
import * as critHit from "../../vendor/pixelfx/src/fx/impacts/crit-hit.js";
import * as hitSpark from "../../vendor/pixelfx/src/fx/impacts/hit-spark.js";
import * as swordSlash from "../../vendor/pixelfx/src/fx/melee/sword-slash.js";
import * as frostNova from "../../vendor/pixelfx/src/fx/ice/frost-nova.js";
import * as iceLance from "../../vendor/pixelfx/src/fx/ice/ice-lance.js";
import * as snowflakeBurst from "../../vendor/pixelfx/src/fx/ice/snowflake-burst.js";
import * as lightningStrike from "../../vendor/pixelfx/src/fx/lightning/lightning-strike.js";
import * as spinSlash from "../../vendor/pixelfx/src/fx/melee/spin-slash.js";
import * as thorns from "../../vendor/pixelfx/src/fx/nature/thorns.js";
import * as splash from "../../vendor/pixelfx/src/fx/water/splash.js";
import * as poisonArrow from "./poison/poison-arrow.js";
import * as knight from "./characters/knight.js";
import * as grass from "./tiles/grass.js";
import * as water from "./tiles/water.js";
import * as sky from "./weather/sky.js";
import * as snowCover from "./weather/snow-cover.js";
import * as splashes from "./weather/splashes.js";

export const CATALOG = {
  "fire/brazier": brazier,
  "characters/knight": knight,
  "tiles/grass": grass,
  "tiles/water": water,
  "weather/sky": sky,
  "weather/snow-cover": snowCover,
  "weather/splashes": splashes,
  "explosions/small-explosion": smallExplosion,
  "fire/fireball": fireball,
  "fire/fire-ring": fireRing,
  "fire/meteor": meteor,
  "holy/smite": smite,
  "impacts/crit-hit": critHit,
  "impacts/hit-spark": hitSpark,
  "melee/sword-slash": swordSlash,
  "ice/frost-nova": frostNova,
  "ice/ice-lance": iceLance,
  "ice/snowflake-burst": snowflakeBurst,
  "lightning/lightning-strike": lightningStrike,
  "melee/spin-slash": spinSlash,
  "nature/thorns": thorns,
  "poison/poison-arrow": poisonArrow,
  "water/splash": splash,
};

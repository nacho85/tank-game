export {
  ONLINE_BASE_DEFS,
  ONLINE_ROLE_SPAWNS,
  getOnlineBaseDefByAnchor,
  getOnlineBaseWorld,
  getOnlineSpawnWorld,
  createOnline2v2Level,
} from "../shared/onlineMapShared.js";

import { CLASSIC_80S_LEVELS } from "../core/levels.js";
import { cloneMatrix } from "../shared/levelGeneration.js";
import { createOnline2v2Level } from "../shared/onlineMapShared.js";

const CLASSIC_ONLINE_MODE = "Clasico - 80s";

export function createOnlineMatchLevel(matchConfig = null) {
  if (String(matchConfig?.mode || "").trim() === CLASSIC_ONLINE_MODE) {
    const level = CLASSIC_80S_LEVELS[0];
    return {
      floor: cloneMatrix(level.floor),
      overlay: cloneMatrix(level.overlay),
      obstacles: cloneMatrix(level.obstacles),
      mapAlgorithm: 0,
    };
  }

  return createOnline2v2Level(matchConfig);
}

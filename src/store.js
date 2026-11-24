// -----------------------------------------------------------------------------
// What the integration keeps across restarts, in /data/beep.json (the only
// writable place of the container). Keys of the maps are BEEP device ids.
//   - `seen`     the measurements each device has sent: its features never
//                disappear from the Discovery screen once offered;
//   - `day`      the first weight of the local day (`{ date, kg }`): the
//                "change today" feature;
//   - `weights`  the weights of the last two hours (`[[at, kg]]`): the swarm
//                detection compares the last one to the highest of the hour;
//   - `lastAt`   the instant of the last measurement already handled;
//   - `swarmAt`  when a swarm was last announced (6 hours of silence after);
//   - `online`   online or not at the last reading (an event when it goes);
//   - `alerts`   the BEEP alerts already seen, id -> count; null until the
//                first reading (a baseline: old alerts fire nothing).
// A restart never fires twice. The token is never written here.
// -----------------------------------------------------------------------------

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_PATH = '/data/beep.json';
const WEIGHTS_KEEP_MS = 2 * 3600_000;
const MAX_ALERTS = 500;
const MAPS = ['seen', 'day', 'weights', 'lastAt', 'swarmAt', 'online'];
const EMPTY = () => ({ ...Object.fromEntries(MAPS.map((name) => [name, {}])), alerts: null });

/**
 * @description The store.
 * @param {object} [options] - `{ path, logger, now }`.
 * @returns {object} `{ data, load, save, prune, forgetDevice }`.
 */
function createStore({ path = DEFAULT_PATH, logger, now = Date.now } = {}) {
  const store = {
    data: EMPTY(),
    /**
     * @description Read the file; an absent or broken file is an empty store.
     * @returns {Promise<void>}
     */
    async load() {
      try {
        const raw = JSON.parse(await readFile(path, 'utf8'));
        const part = (name) =>
          raw?.[name] && typeof raw[name] === 'object' && !Array.isArray(raw[name])
            ? { ...raw[name] }
            : {};
        store.data = {
          ...Object.fromEntries(MAPS.map((name) => [name, part(name)])),
          alerts: raw?.alerts && typeof raw.alerts === 'object' ? { ...raw.alerts } : null,
        };
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger?.warn(`Unable to read ${path}: ${err.message}`);
        }
      }
    },
    /**
     * @description Forget the weights older than two hours, and the oldest
     * alerts beyond 500.
     */
    prune() {
      for (const [id, points] of Object.entries(store.data.weights)) {
        const kept = Array.isArray(points)
          ? points.filter((point) => Array.isArray(point) && now() - point[0] <= WEIGHTS_KEEP_MS)
          : [];
        if (kept.length > 0) {
          store.data.weights[id] = kept;
        } else {
          delete store.data.weights[id];
        }
      }
      if (store.data.alerts) {
        const ids = Object.keys(store.data.alerts)
          .map(Number)
          .sort((a, b) => b - a);
        for (const id of ids.slice(MAX_ALERTS)) {
          delete store.data.alerts[id];
        }
      }
    },
    /**
     * @description Forget a device BEEP no longer lists (its memory only: its
     * offered features stay, an external id is forever).
     * @param {number|string} id - The BEEP device id.
     */
    forgetDevice(id) {
      for (const name of ['day', 'weights', 'lastAt', 'swarmAt', 'online']) {
        delete store.data[name][id];
      }
    },
    /**
     * @description Write the file (atomically: a temporary file, then a rename).
     * @returns {Promise<void>}
     */
    async save() {
      try {
        await mkdir(dirname(path), { recursive: true });
        const temporary = `${path}.tmp`;
        await writeFile(temporary, JSON.stringify(store.data));
        await rename(temporary, path);
      } catch (err) {
        logger?.warn(`Unable to write ${path}: ${err.message}`);
      }
    },
  };
  return store;
}

export { DEFAULT_PATH, WEIGHTS_KEEP_MS, MAX_ALERTS, createStore };

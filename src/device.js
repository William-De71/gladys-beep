// -----------------------------------------------------------------------------
// The devices of the integration, offered on the Discovery screen: one per
// BEEP measurement device (a BEEP base under a hive, or any sensor posting to
// BEEP), named after its hive when it has one ("Hive 3 (BEEP)").
//
// Features: one per measurement the device has sent (measurements.js), plus
// `weight_change_today` when it weighs (kg since the first weight of the local
// day). Values the device never sent are not offered; a value missing from the
// last reading is not published.
//
// External ids: `ext:beep:device:<BEEP device id>` and
// `ext:beep:device:<id>:<feature key>`. The BEEP id is the stable id of the
// device in the BEEP database (its LoRa key can change when a board is
// replaced). `should_poll` stays false: the integration reads on its own timer.
// -----------------------------------------------------------------------------

import { MEASUREMENTS, WEIGHT_CHANGE, BY_ABBR, hiveLabel } from './measurements.js';
import { t } from './i18n.js';

const DEVICE_TYPE = 'device';

/**
 * @description The external ids of a device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {number|string} id - The BEEP device id.
 * @returns {{ device: string, feature: Function }} The ids.
 */
const idsOf = (gladys, id) => gladys.externalIds(DEVICE_TYPE, String(id));

/**
 * @description The BEEP id of a device (or feature) external id.
 * @param {unknown} externalId - "ext:beep:device:42" or "ext:beep:device:42:weight".
 * @returns {number|null} 42.
 */
function beepIdOf(externalId) {
  const match = /:device:(\d+)(?::[a-z0-9_]+)?$/.exec(String(externalId ?? ''));
  return match ? Number(match[1]) : null;
}

const sensor = (feature) => ({
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...feature,
});

/**
 * @description The features of a device, from the measurements it sent.
 * @param {string[]} seen - The abbreviations it sent.
 * @returns {object[]} The entries of MEASUREMENTS (and WEIGHT_CHANGE), in order.
 */
function featuresOf(seen) {
  const sent = new Set(seen);
  const entries = MEASUREMENTS.filter((entry) => sent.has(entry.abbr));
  // A device that sent nothing yet offers its weight: what BEEP is for.
  if (entries.length === 0) {
    entries.push(BY_ABBR.get('weight_kg'));
  }
  if (entries.some((entry) => entry.abbr === 'weight_kg')) {
    entries.splice(1, 0, WEIGHT_CHANGE);
  }
  return entries;
}

/**
 * @description The discovered device of a BEEP device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} device - A parsed device (measurements.js).
 * @param {string[]} seen - The measurements it sent.
 * @param {string} language - Language of the names.
 * @returns {object} The discovered device.
 */
function buildDevice(gladys, device, seen, language) {
  const ids = idsOf(gladys, device.id);
  const hive = hiveLabel(device);
  return {
    name: device.hiveName ? t('deviceName', language, { hive }) : device.name,
    external_id: ids.device,
    model: device.type || 'BEEP',
    should_poll: false,
    params: [
      { name: 'BEEP_DEVICE_ID', value: String(device.id) },
      ...(device.key ? [{ name: 'BEEP_DEVICE_KEY', value: device.key }] : []),
    ],
    features: featuresOf(seen).map((entry) =>
      sensor({
        name: t(entry.name, language, { hive, n: entry.probe }),
        external_id: ids.feature(entry.key),
        ...entry.shape,
      }),
    ),
  };
}

/**
 * @description The states of a device: its last values and the change of the day.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} device - A device of the snapshot (`values`, `weightChange`).
 * @returns {Array<{ device_feature_external_id: string, state: number }>} The states.
 */
function buildStates(gladys, device) {
  const ids = idsOf(gladys, device.id);
  const states = Object.entries(device.values).map(([abbr, value]) => ({
    device_feature_external_id: ids.feature(BY_ABBR.get(abbr).key),
    state: value,
  }));
  if (device.weightChange !== null && device.weightChange !== undefined) {
    states.push({
      device_feature_external_id: ids.feature(WEIGHT_CHANGE.key),
      state: device.weightChange,
    });
  }
  return states;
}

export { DEVICE_TYPE, idsOf, beepIdOf, featuresOf, buildDevice, buildStates };

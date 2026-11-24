// -----------------------------------------------------------------------------
// What BEEP measures, and how its answers become the snapshot of a reading.
//
// A BEEP measurement device (a BEEP base, or any sensor posting to BEEP) sends
// measurements named by abbreviations (`GET /sensors/measurement_types`,
// public): `weight_kg`, `t_i` (temperature inside the hive), `t`, `h`... The
// table below keeps those that mean something in Gladys, each with its
// feature key (eternal: part of the external id), its category, type, unit and
// bounds. Gladys has no kilogram: weights are counter-sensor decimals whose
// name says "kg" (like gladys-pellet-stock and gladys-oilfox).
//
// A device only offers the features of the measurements it actually sent
// (remembered in /data, so a feature never disappears), plus the weight change
// of the day when it weighs.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import { readBeepDate } from './time.js';

const decimal = (category, unit, min, max) => ({
  category,
  type: T.SENSOR.DECIMAL,
  unit,
  min,
  max,
});
const temperature = decimal(C.TEMPERATURE_SENSOR, U.CELSIUS, -40, 80);
const kilograms = { category: C.COUNTER_SENSOR, type: T.SENSOR.DECIMAL, min: -50, max: 500 };

/**
 * The measurements kept, in the order of the features. `name` is the i18n key
 * of the feature name, `display` the unit written in texts.
 */
const MEASUREMENTS = [
  { abbr: 'weight_kg', key: 'weight', name: 'featureWeight', shape: kilograms, display: 'kg' },
  {
    abbr: 't_i',
    key: 'temperature_inside',
    name: 'featureTempInside',
    shape: temperature,
    display: '°C',
  },
  {
    abbr: 'h_i',
    key: 'humidity_inside',
    name: 'featureHumidityInside',
    shape: decimal(C.HUMIDITY_SENSOR, U.PERCENT, 0, 100),
    display: '%',
  },
  { abbr: 't', key: 'temperature', name: 'featureTemp', shape: temperature, display: '°C' },
  {
    abbr: 'h',
    key: 'humidity',
    name: 'featureHumidity',
    shape: decimal(C.HUMIDITY_SENSOR, U.PERCENT, 0, 100),
    display: '%',
  },
  {
    abbr: 'p',
    key: 'pressure',
    name: 'featurePressure',
    shape: decimal(C.PRESSURE_SENSOR, U.HECTO_PASCAL, 300, 1200),
    display: 'hPa',
  },
  {
    abbr: 'l',
    key: 'light',
    name: 'featureLight',
    shape: decimal(C.LIGHT_SENSOR, U.LUX, 0, 200000),
    display: 'lx',
  },
  {
    abbr: 's_spl',
    key: 'sound_level',
    name: 'featureSound',
    shape: decimal(C.NOISE_SENSOR, U.DECIBEL, 0, 150),
    display: 'dB',
  },
  {
    abbr: 'bc_i',
    key: 'bees_in',
    name: 'featureBeesIn',
    shape: { category: C.COUNTER_SENSOR, type: T.SENSOR.INTEGER, min: 0, max: 1000000 },
    display: '',
  },
  {
    abbr: 'bc_o',
    key: 'bees_out',
    name: 'featureBeesOut',
    shape: { category: C.COUNTER_SENSOR, type: T.SENSOR.INTEGER, min: 0, max: 1000000 },
    display: '',
  },
  {
    abbr: 'bv',
    key: 'battery_voltage',
    name: 'featureBattery',
    shape: {
      category: C.ENERGY_SENSOR,
      type: T.ENERGY_SENSOR.VOLTAGE,
      unit: U.VOLT,
      min: 0,
      max: 15,
    },
    display: 'V',
  },
  // The temperature probes of a BEEP base (DS18B20), between the frames.
  ...Array.from({ length: 10 }, (_, n) => ({
    abbr: `t_${n}`,
    key: `temperature_probe_${n}`,
    name: 'featureProbe',
    probe: n + 1,
    shape: temperature,
    display: '°C',
  })),
];

/** The feature of the weight change since midnight (computed, not measured). */
const WEIGHT_CHANGE = { key: 'weight_change_today', name: 'featureWeightChange', shape: kilograms };

const BY_ABBR = new Map(MEASUREMENTS.map((entry) => [entry.abbr, entry]));
const BY_KEY = new Map(MEASUREMENTS.map((entry) => [entry.key, entry]));

/**
 * @description A finite number from a BEEP value, or null.
 * @param {unknown} value - 42.31, "42.31", null.
 * @returns {number|null} The number.
 */
function readNumber(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * @description Round to a number of decimals.
 * @param {number} value - The value.
 * @param {number} [decimals] - How many.
 * @returns {number} The rounded value.
 */
const round = (value, decimals = 2) => Math.round(value * 10 ** decimals) / 10 ** decimals;

/**
 * @description The last values of a device (`GET /sensors/lastvalues`).
 * @param {object|null} raw - `{ time, weight_kg, t_i, from_cache, ... }`.
 * @returns {{ at: number|null, values: object }} The kept measurements, by abbreviation.
 */
function parseLastValues(raw) {
  const values = {};
  if (!raw || typeof raw !== 'object') {
    return { at: null, values };
  }
  for (const [abbr, value] of Object.entries(raw)) {
    const entry = BY_ABBR.get(abbr);
    const number = readNumber(value);
    if (entry && number !== null && number >= entry.shape.min && number <= entry.shape.max) {
      values[abbr] = round(number, entry.shape.type === T.SENSOR.INTEGER ? 0 : 2);
    }
  }
  return { at: readBeepDate(raw.time), values };
}

/**
 * @description A BEEP device (`GET /devices`), kept to what the integration uses.
 * @param {object} raw - The device of the API.
 * @returns {object|null} `{ id, key, name, hiveId, hiveName, location, type,
 * online, lastMessageAt, intervalMin }`, null without an id.
 */
function parseDevice(raw) {
  const id = Number(raw?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  const text = (value) => (typeof value === 'string' ? value.trim() : '');
  const interval = readNumber(raw.measurement_interval_min);
  return {
    id,
    key: text(raw.key),
    name: text(raw.name) || `BEEP ${id}`,
    hiveId: readNumber(raw.hive_id),
    hiveName: text(raw.hive_name),
    location: text(raw.location_name),
    type: text(raw.type),
    online: raw.online === true || raw.online === 1,
    lastMessageAt: readBeepDate(raw.last_message_received),
    intervalMin: interval && interval > 0 ? interval : null,
  };
}

/**
 * @description The name of a hive for a person: the hive of BEEP, else the device.
 * @param {object} device - A parsed device.
 * @returns {string} "Ruche 3".
 */
const hiveLabel = (device) => device.hiveName || device.name;

/**
 * @description A BEEP alert (`GET /alerts`).
 * @param {object} raw - The alert of the API.
 * @returns {object|null} `{ id, rule, value, formula, hiveName, deviceName,
 * location, deviceId, count, at }`, null without an id.
 */
function parseAlert(raw) {
  const id = Number(raw?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  const text = (value) => (value === null || value === undefined ? '' : String(value).trim());
  return {
    id,
    rule: text(raw.alert_rule_name),
    value: text(raw.alert_value),
    formula: text(raw.alert_function),
    hiveName: text(raw.hive_name),
    deviceName: text(raw.device_name),
    location: text(raw.location_name),
    deviceId: readNumber(raw.device_id),
    count: Math.max(1, readNumber(raw.count) ?? 1),
    at: readBeepDate(raw.updated_at) ?? readBeepDate(raw.created_at),
  };
}

/**
 * @description The weight points of a device over an interval
 * (`GET /sensors/measurements`), hourly means with gaps left out.
 * @param {object[]} rows - `[{ time, weight_kg }]`.
 * @returns {Array<{ t: string, v: number }>} The points, oldest first.
 */
function weightPoints(rows) {
  return rows
    .map((row) => ({ at: readBeepDate(row?.time), v: readNumber(row?.weight_kg) }))
    .filter((point) => point.at !== null && point.v !== null)
    .sort((a, b) => a.at - b.at)
    .map((point) => ({ t: new Date(point.at).toISOString(), v: round(point.v, 2) }));
}

export {
  MEASUREMENTS,
  WEIGHT_CHANGE,
  BY_ABBR,
  BY_KEY,
  readNumber,
  round,
  parseLastValues,
  parseDevice,
  parseAlert,
  hiveLabel,
  weightPoints,
};

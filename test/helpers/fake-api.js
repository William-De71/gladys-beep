// A fake BEEP API for the tests, served through the `fetch` option of the
// integration. The routes and answer shapes follow the source of the BEEP API
// (github.com/beepnl/BEEP: routes/api.php, UserController, DeviceController,
// MeasurementController, AlertController, read on 2026-11-24). The login
// refusal (400 {"message":"invalid_user"}) and the missing token (401
// {"message":"Unauthenticated."}) were checked against the real API on
// 2026-11-24; the hives and measurements are made up. Tests never touch the
// network.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Friday 20 November 2026, 18:00 in Paris.
const NOW = Date.parse('2026-11-20T17:00:00Z');
const TZ = 'Europe/Paris';
const EMAIL = 'apiculteur@example.com';
const PASSWORD = 'mot de passe secret';
const UNVERIFIED = 'nouveau@example.com';
const silent = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * @description A temporary folder standing for /data.
 * @returns {string} The path.
 */
const dataDir = () => mkdtempSync(join(tmpdir(), 'beep-'));

/**
 * @description A device of `GET /devices`.
 * @param {object} fields - The fields that differ.
 * @returns {object} The device.
 */
function device(fields) {
  return {
    id: 101,
    hive_id: 11,
    name: 'BEEP base 1',
    key: '0004a30b001f2a3b',
    last_message_received: '2026-11-20 16:52:00',
    hardware_id: '0e0123456789abcdef',
    firmware_version: '1.5.15',
    hardware_version: '3.0',
    boot_count: 12,
    measurement_interval_min: 15,
    measurement_transmission_ratio: 1,
    battery_voltage: 3.11,
    type: 'beep',
    hive_name: 'Ruche 1',
    location_name: 'Rucher du verger',
    owner: true,
    online: true,
    sensor_definitions: [],
    ...fields,
  };
}

const DEVICES = [
  device({}),
  device({
    id: 102,
    hive_id: 12,
    name: 'BEEP base 2',
    key: '0004a30b001f2a3c',
    hive_name: 'Ruche 2',
    battery_voltage: 2.95,
  }),
  device({
    id: 103,
    hive_id: null,
    name: 'Capteur du garage',
    key: 'garage-1',
    type: 'simulation',
    hive_name: '',
    location_name: '',
    online: false,
    last_message_received: '2026-11-19 08:00:00',
  }),
];

const LAST_VALUES = {
  101: {
    time: '2026-11-20T16:52:00Z',
    weight_kg: 42.31,
    t_i: 34.8,
    t: 8.2,
    h: 81,
    bv: 3.11,
    t_0: 33.9,
    t_1: 35.2,
    rssi: -112,
    snr: 7.5,
    from_cache: true,
  },
  102: { time: '2026-11-20T16:50:00Z', weight_kg: 38.05, t_i: 33.1, bv: 2.95 },
  103: { time: '2026-11-19T08:00:00Z', t: 12.5, h: 65, p: 1012.3, l: 340 },
};

const ALERTS = [
  {
    id: 7,
    alert_rule_id: 3,
    alert_function: 'bv < 3.0 V',
    alert_value: '2.95 V',
    measurement_id: 6,
    location_name: 'Rucher du verger',
    hive_name: 'Ruche 2',
    device_name: 'BEEP base 2',
    location_id: 1,
    hive_id: 12,
    device_id: 102,
    user_id: 1,
    count: 1,
    created_at: '2026-11-20 06:00:00',
    updated_at: '2026-11-20 06:00:00',
    alert_rule_name: 'Batterie faible',
  },
];

/**
 * @description The hourly weights of a device over the last week (made up:
 * a slow decline, as in winter).
 * @param {number} start - The first weight.
 * @returns {object[]} `[{ time, weight_kg }]`.
 */
function weekOfWeights(start) {
  return Array.from({ length: 168 }, (_, hour) => ({
    time: new Date(NOW - (167 - hour) * 3600_000).toISOString().replace('.000Z', 'Z'),
    weight_kg: hour % 37 === 5 ? null : Math.round((start - hour * 0.004) * 100) / 100,
  }));
}

/**
 * @description The fake API.
 * @returns {Function & { calls: object[], answers: object }} A `fetch`.
 */
function fakeBeep() {
  const answers = {
    devices: DEVICES.map((entry) => ({ ...entry })),
    lastValues: structuredClone(LAST_VALUES),
    alerts: ALERTS.map((entry) => ({ ...entry })),
    measurements: { 101: weekOfWeights(42.98), 102: weekOfWeights(38.6) },
  };
  let token = 'token-1';
  let issued = 0;
  const calls = [];
  const fetch = async (url, init = {}) => {
    const target = new URL(url);
    const params = Object.fromEntries(target.searchParams);
    const path = target.pathname.replace(/^\/api/, '');
    const auth = init.headers?.Authorization ?? null;
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method: init.method ?? 'GET', path, params, auth, body });
    if (fetch.offline) {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    }
    const reply = (status, payload) =>
      new Response(payload === undefined ? '' : JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    if (fetch.failNext) {
      const status = fetch.failNext;
      fetch.failNext = null;
      return reply(status, status === 429 ? { message: 'Too Many Attempts.' } : 'server-error');
    }
    if (path === '/login' && init.method === 'POST') {
      if (body?.email === EMAIL && body?.password === PASSWORD) {
        issued += 1;
        token = `token-${issued}`;
        return reply(200, {
          id: 1317,
          name: EMAIL,
          email: EMAIL,
          avatar: 'default.jpg',
          api_token: token,
          locale: 'fr',
          email_verified_at: '2018-05-25 00:00:00',
        });
      }
      if (body?.email === UNVERIFIED) {
        return reply(400, 'email_not_verified');
      }
      return reply(400, { message: 'invalid_user' });
    }
    if (auth !== `Bearer ${token}`) {
      return reply(401, { message: 'Unauthenticated.' });
    }
    if (path === '/devices') {
      return answers.devices.length > 0
        ? reply(200, answers.devices)
        : reply(404, 'no_devices_found');
    }
    if (path === '/sensors/lastvalues') {
      const values = answers.lastValues[params.id];
      return values ? reply(200, values) : reply(404, 'error');
    }
    if (path === '/sensors/measurements') {
      const rows = answers.measurements[params.id];
      return rows
        ? reply(200, { id: Number(params.id), interval: params.interval, measurements: rows })
        : reply(500, 'sensor-no-data-error');
    }
    if (path === '/alerts') {
      return answers.alerts.length > 0
        ? reply(200, { alerts: answers.alerts })
        : reply(404, { error: 'no alerts available' });
    }
    return reply(404, { message: 'Not found' });
  };
  fetch.calls = calls;
  fetch.answers = answers;
  fetch.offline = false;
  fetch.failNext = null;
  /** The server forgets the token (another login elsewhere, a reset). */
  fetch.expireToken = () => {
    token = 'expired';
  };
  return fetch;
}

export {
  NOW,
  TZ,
  EMAIL,
  PASSWORD,
  UNVERIFIED,
  DEVICES,
  LAST_VALUES,
  ALERTS,
  silent,
  dataDir,
  device,
  weekOfWeights,
  fakeBeep,
};

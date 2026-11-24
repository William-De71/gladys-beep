// The memory of the readings and the scene events: swarm (sudden weight
// loss), device offline, BEEP alerts; baselines, once only, limits.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createStore } from '../src/store.js';
import {
  track,
  swarmData,
  offlineData,
  alertData,
  formatKg,
  MAX_ALERT_EVENTS,
} from '../src/events.js';
import { parseAlert, parseDevice } from '../src/measurements.js';
import { DEVICES, ALERTS, NOW, TZ, dataDir } from './helpers/fake-api.js';

const MIN = 60_000;
const OPTIONS = { now: NOW, timeZone: TZ, swarmDropKg: 1 };

/**
 * @description A snapshot with one device weighing `kg` at `at`.
 * @param {number|null} kg - The weight.
 * @param {number} at - When.
 * @param {object} [extra] - `{ online, alerts }`.
 * @returns {object} The snapshot.
 */
function snapshotOf(kg, at, { online = true, alerts = [] } = {}) {
  return {
    devices: [
      {
        ...parseDevice(DEVICES[0]),
        online,
        values: kg === null ? {} : { weight_kg: kg },
        valuesAt: at,
        weightChange: null,
      },
    ],
    alerts,
  };
}
const newStore = () => createStore({ path: `${dataDir()}/beep.json`, now: () => NOW });

test('a swarm: the weight falls by the drop below the highest of the hour', () => {
  const store = newStore();
  assert.equal(track(snapshotOf(42.3, NOW - 45 * MIN), store, OPTIONS).swarms.length, 0);
  assert.equal(track(snapshotOf(42.5, NOW - 30 * MIN), store, OPTIONS).swarms.length, 0);
  const news = track(snapshotOf(41.2, NOW - 15 * MIN), store, OPTIONS);
  assert.equal(news.swarms.length, 1);
  assert.deepEqual(
    { before: news.swarms[0].before, after: news.swarms[0].after, drop: news.swarms[0].drop },
    { before: 42.5, after: 41.2, drop: 1.3 },
  );
  // Six hours of silence for this hive, even if the weight keeps falling.
  assert.equal(track(snapshotOf(39.9, NOW), store, OPTIONS).swarms.length, 0);
});

test('no swarm: a slow loss, a loss older than an hour, a lower threshold not met', () => {
  const store = newStore();
  track(snapshotOf(43.0, NOW - 120 * MIN), store, OPTIONS);
  track(snapshotOf(42.6, NOW - 75 * MIN), store, OPTIONS);
  track(snapshotOf(42.2, NOW - 30 * MIN), store, OPTIONS);
  assert.equal(track(snapshotOf(41.8, NOW), store, OPTIONS).swarms.length, 0);
  const strict = newStore();
  track(snapshotOf(42, NOW - 30 * MIN), strict, { ...OPTIONS, swarmDropKg: 2 });
  assert.equal(
    track(snapshotOf(40.5, NOW), strict, { ...OPTIONS, swarmDropKg: 2 }).swarms.length,
    0,
  );
});

test('a measurement is handled once: reading again changes nothing', () => {
  const store = newStore();
  track(snapshotOf(42.5, NOW - 30 * MIN), store, OPTIONS);
  assert.equal(track(snapshotOf(41, NOW - 15 * MIN), store, OPTIONS).swarms.length, 1);
  store.data.swarmAt = {};
  assert.equal(track(snapshotOf(41, NOW - 15 * MIN), store, OPTIONS).swarms.length, 0);
  assert.equal(store.data.weights['101'].length, 2);
});

test('the change of the day starts at the first weight of the local day', () => {
  const store = newStore();
  // 23:50 in Paris on the 19th, then the morning of the 20th.
  const evening = Date.parse('2026-11-19T22:50:00Z');
  const morning = Date.parse('2026-11-20T06:00:00Z');
  const snapshot = snapshotOf(40, evening);
  track(snapshot, store, { ...OPTIONS, now: evening });
  assert.equal(snapshot.devices[0].weightChange, 0);
  track(snapshotOf(41, morning), store, OPTIONS);
  const later = snapshotOf(41.45, NOW - 10 * MIN);
  track(later, store, OPTIONS);
  assert.equal(later.devices[0].weightChange, 0.45);
  // No weight today yet (only yesterday's): no change.
  const stale = newStore();
  const old = snapshotOf(40, evening);
  track(old, stale, OPTIONS);
  assert.equal(old.devices[0].weightChange, null);
});

test('offline: only when a device that was online stops; the first reading is a baseline', () => {
  const store = newStore();
  assert.equal(track(snapshotOf(42, NOW, { online: false }), store, OPTIONS).offline.length, 0);
  assert.equal(track(snapshotOf(42, NOW, { online: true }), store, OPTIONS).offline.length, 0);
  assert.equal(track(snapshotOf(42, NOW, { online: false }), store, OPTIONS).offline.length, 1);
  assert.equal(track(snapshotOf(42, NOW, { online: false }), store, OPTIONS).offline.length, 0);
});

test('alerts: a baseline, then new alerts and alerts raised again', () => {
  const store = newStore();
  const first = ALERTS.map(parseAlert);
  assert.equal(track(snapshotOf(42, NOW, { alerts: first }), store, OPTIONS).alerts.length, 0);
  assert.equal(track(snapshotOf(42, NOW, { alerts: first }), store, OPTIONS).alerts.length, 0);
  const again = [
    { ...first[0], count: 2 },
    { ...first[0], id: 8, rule: 'Essaimage' },
  ];
  assert.deepEqual(
    track(snapshotOf(42, NOW, { alerts: again }), store, OPTIONS).alerts.map((alert) => alert.id),
    [7, 8],
  );
  const flood = Array.from({ length: 25 }, (_, i) => ({ ...first[0], id: 100 + i }));
  const news = track(snapshotOf(42, NOW, { alerts: flood }), store, OPTIONS);
  assert.equal(news.alerts.length, MAX_ALERT_EVENTS);
  assert.equal(news.alerts.at(-1).id, 124, 'the latest ones');
});

test('event payloads: flat, scalar, a summary in the language', () => {
  const device = parseDevice(DEVICES[0]);
  const swarm = swarmData(
    { device, before: 42.5, after: 41.2, drop: 1.3, at: NOW - 15 * MIN },
    'ext:beep:device:101',
    'fr',
    TZ,
  );
  assert.equal(
    swarm.summary,
    'Ruche 1 : le poids a baissé de 1,3 kg en moins d’une heure (17:45), un essaim est peut-être parti.',
  );
  const offline = offlineData(device, 'ext:beep:device:101', 'en', NOW, TZ);
  assert.equal(offline.summary, 'Ruche 1: BEEP no longer receives measurements (last one 17:52).');
  assert.equal(
    offlineData({ ...device, lastMessageAt: null }, 'x', 'de', NOW, TZ).summary,
    'Ruche 1: BEEP empfängt keine Messwerte mehr.',
  );
  const alert = alertData(parseAlert(ALERTS[0]), 'ext:beep:device:102', 'es');
  assert.equal(alert.summary, 'Batterie faible · Ruche 2 · 2.95 V');
  for (const data of [swarm, offline, alert]) {
    assert.ok(Object.keys(data).length <= 30);
    for (const value of Object.values(data)) {
      assert.ok(['string', 'number', 'boolean'].includes(typeof value), JSON.stringify(data));
      assert.ok(typeof value !== 'string' || value.length <= 1000);
    }
  }
});

test('weights for a person', () => {
  assert.equal(formatKg(42.31, 'fr'), '42,31 kg');
  assert.equal(formatKg(0.4, 'en', true), '+0.4 kg');
  assert.equal(formatKg(-1.25, 'de', true), '-1,25 kg');
  assert.equal(formatKg(0, 'en', true), '0 kg');
});

test('the store survives a restart and forgets old weights', async () => {
  const path = `${dataDir()}/beep.json`;
  const store = createStore({ path, now: () => NOW });
  track(snapshotOf(42, NOW - 3 * 3600_000), store, OPTIONS);
  track(snapshotOf(42.1, NOW), store, OPTIONS);
  store.prune();
  assert.equal(store.data.weights['101'].length, 1);
  await store.save();
  const again = createStore({ path, now: () => NOW });
  await again.load();
  assert.deepEqual(again.data.seen, { 101: ['weight_kg'] });
  assert.deepEqual(again.data.alerts, {});
  again.forgetDevice(101);
  assert.equal(again.data.lastAt['101'], undefined);
  assert.deepEqual(again.data.seen, { 101: ['weight_kg'] }, 'its features stay');
});

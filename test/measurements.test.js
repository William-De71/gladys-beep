import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDevice,
  parseLastValues,
  parseAlert,
  hiveLabel,
  weightPoints,
  MEASUREMENTS,
} from '../src/measurements.js';
import { DEVICES, LAST_VALUES, ALERTS, weekOfWeights } from './helpers/fake-api.js';

test('a device of BEEP, kept to what the integration uses', () => {
  assert.deepEqual(parseDevice(DEVICES[0]), {
    id: 101,
    key: '0004a30b001f2a3b',
    name: 'BEEP base 1',
    hiveId: 11,
    hiveName: 'Ruche 1',
    location: 'Rucher du verger',
    type: 'beep',
    online: true,
    lastMessageAt: Date.parse('2026-11-20T16:52:00Z'),
    intervalMin: 15,
  });
  assert.equal(hiveLabel(parseDevice(DEVICES[2])), 'Capteur du garage', 'no hive: the device name');
  assert.equal(parseDevice({ name: 'no id' }), null);
  assert.equal(parseDevice({ id: 5 }).name, 'BEEP 5');
});

test('last values: known measurements only, within bounds, rounded', () => {
  const { at, values } = parseLastValues(LAST_VALUES[101]);
  assert.equal(at, Date.parse('2026-11-20T16:52:00Z'));
  assert.deepEqual(values, {
    weight_kg: 42.31,
    t_i: 34.8,
    t: 8.2,
    h: 81,
    bv: 3.11,
    t_0: 33.9,
    t_1: 35.2,
  });
  assert.deepEqual(parseLastValues({ time: 'x', weight_kg: 'abc', t_i: 500, h: '55.555' }).values, {
    h: 55.56,
  });
  assert.deepEqual(parseLastValues(null), { at: null, values: {} });
});

test('an alert of BEEP', () => {
  assert.deepEqual(parseAlert(ALERTS[0]), {
    id: 7,
    rule: 'Batterie faible',
    value: '2.95 V',
    formula: 'bv < 3.0 V',
    hiveName: 'Ruche 2',
    deviceName: 'BEEP base 2',
    location: 'Rucher du verger',
    deviceId: 102,
    count: 1,
    at: Date.parse('2026-11-20T06:00:00Z'),
  });
  assert.equal(parseAlert({}), null);
});

test('weight points: gaps left out, oldest first, ISO dates', () => {
  const points = weightPoints([...weekOfWeights(42.98)].reverse());
  assert.ok(points.length > 150 && points.length < 168);
  assert.ok(points.every((point, i) => i === 0 || point.t > points[i - 1].t));
  assert.match(points[0].t, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/);
});

test('feature keys are unique and stable', () => {
  const keys = MEASUREMENTS.map((entry) => entry.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.every((key) => /^[a-z0-9_]+$/.test(key)));
});

// The discovered devices, checked like Gladys would accept them: every feature
// has min, max, read_only and has_feedback (else "Add" fails in 422), valid
// category / type pairs from the SDK, no poll on a Gladys timer.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { buildDevice, buildStates, beepIdOf, featuresOf, idsOf } from '../src/device.js';
import { MEASUREMENTS, parseDevice, parseLastValues } from '../src/measurements.js';
import { DEVICES, LAST_VALUES } from './helpers/fake-api.js';
import { LANGUAGES } from '../src/i18n.js';

const gladys = createFakeGladys();
const categories = new Set(Object.values(DEVICE_FEATURE_CATEGORIES));
const units = new Set(Object.values(DEVICE_FEATURE_UNITS));

const checkDevice = (device) => {
  assert.equal(device.should_poll, false);
  assert.equal(device.poll_frequency, undefined);
  for (const feature of device.features) {
    for (const key of ['min', 'max', 'read_only', 'has_feedback']) {
      assert.notEqual(feature[key], undefined, `${feature.external_id}.${key}`);
    }
    assert.ok(categories.has(feature.category), feature.category);
    const types = Object.values(
      DEVICE_FEATURE_TYPES[
        Object.keys(DEVICE_FEATURE_CATEGORIES).find(
          (key) => DEVICE_FEATURE_CATEGORIES[key] === feature.category,
        )
      ] ?? DEVICE_FEATURE_TYPES.SENSOR,
    );
    assert.ok(
      types.includes(feature.type) ||
        Object.values(DEVICE_FEATURE_TYPES.SENSOR).includes(feature.type),
      `${feature.category}/${feature.type}`,
    );
    if (feature.unit) {
      assert.ok(units.has(feature.unit), feature.unit);
    }
    assert.ok(feature.name.length > 0 && feature.name.length <= 100);
  }
};

test('a BEEP base: named after its hive, the features of what it sent, every language', () => {
  const seen = Object.keys(parseLastValues(LAST_VALUES[101]).values);
  for (const language of LANGUAGES) {
    const device = buildDevice(gladys, parseDevice(DEVICES[0]), seen, language);
    checkDevice(device);
    assert.equal(device.external_id, 'ext:test-integration:device:101');
    assert.deepEqual(device.params, [
      { name: 'BEEP_DEVICE_ID', value: '101' },
      { name: 'BEEP_DEVICE_KEY', value: '0004a30b001f2a3b' },
    ]);
    assert.deepEqual(
      device.features.map((feature) => feature.external_id.split(':').pop()),
      [
        'weight',
        'weight_change_today',
        'temperature_inside',
        'temperature',
        'humidity',
        'battery_voltage',
        'temperature_probe_0',
        'temperature_probe_1',
      ],
    );
  }
  const fr = buildDevice(gladys, parseDevice(DEVICES[0]), seen, 'fr');
  assert.equal(fr.name, 'Ruche 1 (BEEP)');
  assert.equal(fr.features[6].name, 'Sonde de température 1');
});

test('a device without a hive keeps its own name; nothing sent yet: the weight', () => {
  const device = buildDevice(gladys, parseDevice(DEVICES[2]), [], 'en');
  checkDevice(device);
  assert.equal(device.name, 'Capteur du garage');
  assert.deepEqual(
    device.features.map((feature) => feature.external_id.split(':').pop()),
    ['weight', 'weight_change_today'],
  );
  // A device that does not weigh has no change of the day.
  assert.ok(!featuresOf(['t', 'h']).some((entry) => entry.key === 'weight_change_today'));
});

test('every measurement BEEP knows makes a valid feature', () => {
  const device = buildDevice(
    gladys,
    parseDevice(DEVICES[0]),
    MEASUREMENTS.map((entry) => entry.abbr),
    'de',
  );
  checkDevice(device);
  assert.equal(device.features.length, MEASUREMENTS.length + 1);
});

test('states: the last values and the change of the day, nothing else', () => {
  const { values } = parseLastValues(LAST_VALUES[101]);
  const states = buildStates(gladys, { id: 101, values, weightChange: -0.25 });
  const byFeature = Object.fromEntries(
    states.map((state) => [state.device_feature_external_id.split(':').pop(), state.state]),
  );
  assert.deepEqual(byFeature, {
    weight: 42.31,
    temperature_inside: 34.8,
    temperature: 8.2,
    humidity: 81,
    battery_voltage: 3.11,
    temperature_probe_0: 33.9,
    temperature_probe_1: 35.2,
    weight_change_today: -0.25,
  });
  assert.equal(buildStates(gladys, { id: 5, values: {}, weightChange: null }).length, 0);
});

test('the BEEP id of an external id', () => {
  assert.equal(beepIdOf(idsOf(gladys, 101).device), 101);
  assert.equal(beepIdOf(idsOf(gladys, 101).feature('weight')), 101);
  assert.equal(beepIdOf('ext:other:thing'), null);
  assert.equal(beepIdOf(undefined), null);
});

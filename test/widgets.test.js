import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import {
  buildApiaryWidget,
  buildWeightWidget,
  buildAlertsWidget,
  messageContent,
  hiveLine,
} from '../src/widgets.js';
import { parseAlert, parseDevice, parseLastValues, weightPoints } from '../src/measurements.js';
import { LANGUAGES } from '../src/i18n.js';
import { ALERTS, DEVICES, LAST_VALUES, NOW, TZ, weekOfWeights } from './helpers/fake-api.js';

const devices = DEVICES.map((raw) => {
  const device = parseDevice(raw);
  const { at, values } = parseLastValues(LAST_VALUES[device.id]);
  return { ...device, values, valuesAt: at, weightChange: device.id === 101 ? 0.42 : null };
});
const full = { devices, alerts: ALERTS.map(parseAlert) };
const empty = { devices: [], alerts: [] };
const curves = [
  { device: devices[0], points: weightPoints(weekOfWeights(42.98)) },
  { device: devices[1], points: weightPoints(weekOfWeights(38.6)) },
];

/**
 * @description The budget of a card: 8 components, 1 main, 6 tiles, 2 texts, 4 buttons.
 * @param {object} content - The content.
 */
function budget(content) {
  const count = (types) => content.components.filter((c) => types.includes(c.type)).length;
  assert.ok(content.components.length <= 8);
  assert.ok(count(['chart', 'card-list', 'image']) <= 1);
  assert.ok(count(['value', 'gauge']) <= 6);
  assert.ok(count(['text']) <= 2);
  assert.ok(count(['button']) <= 4);
}

test('every widget is valid and within budget, in every language, full or empty', () => {
  for (const language of LANGUAGES) {
    const contents = [
      buildApiaryWidget({ snapshot: full, language, now: NOW }),
      buildApiaryWidget({ snapshot: empty, language, now: NOW }),
      buildWeightWidget({ curves, language }),
      buildWeightWidget({ curves: curves.slice(0, 1), language }),
      buildWeightWidget({ curves: [], language }),
      buildAlertsWidget({ snapshot: full, language, now: NOW, timeZone: TZ }),
      buildAlertsWidget({ snapshot: empty, language, now: NOW, timeZone: TZ }),
    ];
    for (const content of contents) {
      assert.deepEqual(validateWidgetContent(content), [], language);
      budget(content);
    }
  }
  assert.deepEqual(validateWidgetContent(messageContent('x'.repeat(400))), []);
});

test('apiary: tiles, one row per hive with weight, change, temperature, battery and age', () => {
  const content = buildApiaryWidget({ snapshot: full, language: 'fr', now: NOW });
  assert.deepEqual(
    content.components.filter((c) => c.type === 'value').map((tile) => [tile.label, tile.value]),
    [
      ['Ruches', 3],
      ['Hors ligne', 1],
      ['Alertes', 1],
    ],
  );
  const list = content.components.find((c) => c.type === 'card-list');
  assert.deepEqual(
    list.items.map((item) => [item.title, item.subtitle, item.badge.text]),
    [
      ['Ruche 1', '42,31 kg (+0,42 kg) · 34,8 °C · 3,11 V · il y a 8 min', 'En ligne'],
      ['Ruche 2', '38,05 kg · 33,1 °C · 2,95 V · il y a 10 min', 'En ligne'],
      ['Capteur du garage', '12,5 °C · il y a 33 h', 'Hors ligne'],
    ],
  );
  assert.equal(content.components.at(-1).link.url, 'https://app.beep.nl');
});

test('a hive without any measurement says so', () => {
  assert.equal(
    hiveLine({ values: {}, valuesAt: null, lastMessageAt: null }, 'en', NOW),
    'No measurement yet',
  );
});

test('weight: one hive gets its tiles; several share one chart', () => {
  const one = buildWeightWidget({ curves: curves.slice(0, 1), language: 'en' });
  assert.deepEqual(
    one.components.filter((c) => c.type === 'value').map((tile) => [tile.label, tile.value]),
    [
      ['Weight', 42.3],
      ['Today', '+0.42'],
      ['7 days', '-0.67'],
    ],
  );
  const chart = one.components.find((c) => c.type === 'chart');
  assert.equal(chart.title, 'Ruche 1');
  assert.equal(chart.unit, 'kg');
  const several = buildWeightWidget({ curves, language: 'fr' });
  assert.equal(several.components.length, 1);
  assert.deepEqual(
    several.components[0].series.map((serie) => serie.name),
    ['Ruche 1', 'Ruche 2'],
  );
  assert.equal(several.components[0].title, 'Poids sur 7 jours');
  assert.equal(
    buildWeightWidget({ curves: [], language: 'en' }).components[0].text,
    'No weight measured over the last 7 days.',
  );
});

test('alerts: the latest first, the formula in the detail', () => {
  const alerts = [
    ...full.alerts,
    { ...full.alerts[0], id: 9, rule: 'Essaimage', count: 3, at: NOW - 60_000, formula: '' },
  ];
  const content = buildAlertsWidget({
    snapshot: { devices, alerts },
    language: 'fr',
    now: NOW,
    timeZone: TZ,
  });
  const list = content.components.find((c) => c.type === 'card-list');
  assert.deepEqual(
    list.items.map((item) => [item.title, item.subtitle, item.badge?.text ?? null]),
    [
      ['Essaimage', 'Ruche 2 · 2.95 V · 17:59', '×3'],
      ['Batterie faible', 'Ruche 2 · 2.95 V · 07:00', null],
    ],
  );
  assert.equal(list.items[1].description, 'bv < 3.0 V\nRucher du verger');
});

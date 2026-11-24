// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The three widgets on Friday 20 November 2026, 18:00 in Paris: the made-up
// hives of the fake BEEP API of the tests (test/helpers/fake-api.js) go through
// the real parsing (src/measurements.js) and widget builders (src/widgets.js).
// Never real data.

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildApiaryWidget, buildWeightWidget, buildAlertsWidget } = await load('src/widgets.js');
const { parseDevice, parseLastValues, parseAlert, weightPoints } =
  await load('src/measurements.js');
const { LANGUAGES } = await load('src/i18n.js');
const { NOW, TZ, DEVICES, LAST_VALUES, ALERTS, weekOfWeights } = await load(
  'test/helpers/fake-api.js',
);
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

const devices = DEVICES.map((raw) => {
  const device = parseDevice(raw);
  const { at, values } = parseLastValues(LAST_VALUES[device.id]);
  const change = { 101: 0.42, 102: -0.18 }[device.id] ?? null;
  return { ...device, values, valuesAt: at, weightChange: change };
});
const alerts = [
  ...ALERTS.map(parseAlert),
  {
    ...parseAlert(ALERTS[0]),
    id: 9,
    rule: 'Essaimage',
    value: '-1.41 kg',
    hiveName: 'Ruche 1',
    count: 1,
    at: NOW - 95 * 60_000,
  },
];
const snapshot = { devices, alerts };
// A spring week: the honey flow makes the hive gain weight by day.
const spring = weekOfWeights(40.2).map((row, hour) => ({
  ...row,
  weight_kg:
    row.weight_kg === null
      ? null
      : Math.round((40.2 + hour * 0.012 + 0.35 * Math.sin((hour / 24) * 2 * Math.PI)) * 100) / 100,
}));
const points = weightPoints(spring);
// The tiles follow the curve: the weight now is its last point.
const curve = {
  device: {
    ...devices[1],
    values: { ...devices[1].values, weight_kg: points.at(-1).v },
    weightChange: 0.31,
  },
  points,
};

const contents = {};
for (const language of LANGUAGES) {
  contents[language] = {
    apiary: buildApiaryWidget({ snapshot, language, now: NOW }),
    weight: buildWeightWidget({ curves: [curve], language }),
    alerts: buildAlertsWidget({ snapshot, language, now: NOW, timeZone: TZ }),
  };
}

const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
writeFileSync(out, JSON.stringify({ now: NOW, widgets, contents }));

// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`), which checks the discovered
// devices, the states and the scene events like the host API does, and a fake
// BEEP API (test/helpers/fake-api.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp, SCENE_ACTIONS, ACTIONS } from '../src/app.js';
import { WIDGETS } from '../src/widgets.js';
import { TRIGGERS } from '../src/events.js';
import { fakeBeep, dataDir, silent, NOW, TZ, EMAIL, PASSWORD } from './helpers/fake-api.js';

const CONFIG = { email: EMAIL, password: PASSWORD, language: 'fr' };
const PREFIX = 'ext:test-integration';
const HIVE1 = `${PREFIX}:device:101`;
const HIVE2 = `${PREFIX}:device:102`;
const GARAGE = `${PREFIX}:device:103`;
const MIN = 60_000;

/**
 * @description The integration, connected to a fake Gladys and a fake API.
 * @param {object} [options] - `{ config, api, dir, clock }`.
 * @returns {Promise<object>} `{ gladys, app, api, dir, clock }`.
 */
async function startApp({
  config = CONFIG,
  api = fakeBeep(),
  dir = dataDir(),
  clock = { now: NOW },
} = {}) {
  const gladys = createFakeGladys({ config });
  const app = createApp(gladys, {
    fetchImpl: api,
    now: () => clock.now,
    sleep: async () => {},
    dataDir: dir,
    timeZone: TZ,
    timer: false,
    logger: silent,
  });
  await gladys.connect();
  await app.whenReady();
  return { gladys, app, api, dir, clock };
}

const created = async (gladys, externalId) => {
  const device = gladys.fake.discoveredDevices.find((d) => d.external_id === externalId);
  assert.ok(device, `${externalId} is offered`);
  await gladys.fake.deviceCreated(device);
  return device;
};
const eventsOf = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);

test('logs in, offers one device per BEEP device, reports the status', async (t) => {
  const { gladys, api } = await startApp();
  t.after(() => gladys.fake.shutdown());
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => [device.external_id, device.name]),
    [
      [GARAGE, 'Capteur du garage'],
      [HIVE1, 'Ruche 1 (BEEP)'],
      [HIVE2, 'Ruche 2 (BEEP)'],
    ],
  );
  assert.deepEqual(
    gladys.fake.discoveredDevices[0].features.map((f) => f.external_id.split(':').pop()),
    ['temperature', 'humidity', 'pressure', 'light'],
  );
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(
    gladys.fake.connectionStatus.message.fr,
    'Connecté à BEEP : 3 appareil(s), 1 hors ligne, 1 alerte(s).',
  );
  // One login, then 2 calls plus one per device.
  assert.deepEqual(
    api.calls.map((call) => call.path),
    [
      '/login',
      '/devices',
      '/sensors/lastvalues',
      '/sensors/lastvalues',
      '/sensors/lastvalues',
      '/alerts',
    ],
  );
  // The first reading is a baseline: the alert already listed fires nothing.
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('created devices get their states, the change of the day included', async (t) => {
  const api = fakeBeep();
  const clock = { now: NOW };
  const { gladys, app } = await startApp({ api, clock });
  t.after(() => gladys.fake.shutdown());
  await created(gladys, HIVE1);
  await created(gladys, GARAGE);
  assert.equal(gladys.fake.lastState(`${HIVE1}:weight`), 42.31);
  assert.equal(gladys.fake.lastState(`${HIVE1}:weight_change_today`), 0);
  assert.equal(gladys.fake.lastState(`${HIVE1}:temperature_inside`), 34.8);
  assert.equal(gladys.fake.lastState(`${HIVE1}:battery_voltage`), 3.11);
  assert.equal(gladys.fake.lastState(`${GARAGE}:pressure`), 1012.3);
  // Not created: no state.
  assert.equal(gladys.fake.lastState(`${HIVE2}:weight`), undefined);
  api.answers.lastValues[101] = {
    ...api.answers.lastValues[101],
    time: '2026-11-20T17:07:00Z',
    weight_kg: 42.71,
  };
  clock.now = NOW + 10 * MIN;
  await app.round();
  assert.equal(gladys.fake.lastState(`${HIVE1}:weight`), 42.71);
  assert.equal(gladys.fake.lastState(`${HIVE1}:weight_change_today`), 0.4);
});

test('a swarm, a device going offline and a new BEEP alert fire once, even after a restart', async (t) => {
  const dir = dataDir();
  const api = fakeBeep();
  const clock = { now: NOW };
  const { gladys, app } = await startApp({ api, dir, clock });
  api.answers.lastValues[101] = {
    ...api.answers.lastValues[101],
    time: '2026-11-20T17:07:00Z',
    weight_kg: 40.9,
  };
  api.answers.devices[1] = { ...api.answers.devices[1], online: false };
  api.answers.alerts.push({ ...api.answers.alerts[0], id: 8, alert_rule_name: 'Essaimage' });
  clock.now = NOW + 10 * MIN;
  await app.round();

  const swarm = eventsOf(gladys, TRIGGERS.SWARM);
  assert.equal(swarm.length, 1);
  assert.deepEqual(
    {
      device: swarm[0].data.device,
      hive: swarm[0].data.hive,
      before: swarm[0].data.weight_before,
      after: swarm[0].data.weight_after,
      drop: swarm[0].data.drop_kg,
    },
    { device: HIVE1, hive: 'Ruche 1', before: 42.31, after: 40.9, drop: 1.41 },
  );
  assert.match(swarm[0].data.summary, /^Ruche 1 : le poids a baissé de 1,41 kg/);
  const offline = eventsOf(gladys, TRIGGERS.OFFLINE);
  assert.equal(offline.length, 1);
  assert.equal(offline[0].data.device, HIVE2);
  const alerts = eventsOf(gladys, TRIGGERS.ALERT);
  assert.equal(alerts.length, 1);
  assert.deepEqual(
    [alerts[0].data.rule, alerts[0].data.device, alerts[0].data.alert_id],
    ['Essaimage', HIVE2, 8],
  );
  // Nothing new: nothing fires.
  await app.round();
  assert.equal(gladys.fake.sceneEvents.length, 3);
  await gladys.fake.shutdown();
  // A restart remembers what was announced.
  const again = await startApp({ api, dir, clock });
  t.after(() => again.gladys.fake.shutdown());
  assert.deepEqual(again.gladys.fake.sceneEvents, []);
});

test('the widgets are valid in every language; the weight reads the week once per 30 min', async (t) => {
  const { gladys, api } = await startApp();
  t.after(() => gladys.fake.shutdown());
  for (const language of ['en', 'fr', 'de', 'es']) {
    for (const key of Object.values(WIDGETS)) {
      const ack = await gladys.fake.widgetGet(key, { language });
      assert.equal(ack.success, true, `${key} ${language}`);
      assert.deepEqual(validateWidgetContent(ack.data.content), [], `${key} ${language}`);
    }
  }
  const weight = (await gladys.fake.widgetGet(WIDGETS.WEIGHT, { language: 'fr' })).data.content;
  assert.deepEqual(
    weight.components[0].series.map((serie) => [serie.name, serie.points.length > 150]),
    [
      ['Ruche 1', true],
      ['Ruche 2', true],
    ],
  );
  assert.equal(api.calls.filter((call) => call.path === '/sensors/measurements').length, 2);
  const one = await gladys.fake.widgetGet(WIDGETS.WEIGHT, {
    language: 'en',
    settings: { hive: HIVE2 },
  });
  const chart = one.data.content.components.find((c) => c.type === 'chart');
  assert.equal(chart.title, 'Ruche 2');
  assert.equal(api.calls.filter((call) => call.path === '/sensors/measurements').length, 2);
});

test('the scene action sums up the apiary; it never fires an event', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const ack = await gladys.fake.sceneAction(SCENE_ACTIONS.SUMMARY, {});
  assert.equal(ack.success, true, JSON.stringify(ack));
  assert.deepEqual(
    {
      hives: ack.data.outputs.hives,
      offline: ack.data.outputs.offline,
      alerts: ack.data.outputs.alerts,
      total: ack.data.outputs.total_weight_kg,
    },
    { hives: 3, offline: 1, alerts: 1, total: 80.36 },
  );
  assert.deepEqual(ack.data.outputs.summary.split('\n'), [
    'Capteur du garage : 12,5 °C · il y a 33 h',
    'Ruche 1 : 42,31 kg (0 kg) · 34,8 °C · 3,11 V · il y a 8 min',
    'Ruche 2 : 38,05 kg (0 kg) · 33,1 °C · 2,95 V · il y a 10 min',
    '1 hors ligne',
  ]);
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('the check button reads now and lists the hives', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const ack = await gladys.fake.action(ACTIONS.CHECK, {});
  assert.equal(ack.success, true);
  const lines = ack.data.message.en.split('\n');
  assert.equal(lines[0], `BEEP account ${EMAIL}: 3 device(s), 1 alert(s).`);
  assert.equal(lines.length, 4);
});

test('without a login nothing is read; a refused login says so and waits', async (t) => {
  const api = fakeBeep();
  const { gladys } = await startApp({ api, config: {} });
  t.after(() => gladys.fake.shutdown());
  assert.equal(api.calls.length, 0);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /email and password of your BEEP account/);
  const widget = await gladys.fake.widgetGet(WIDGETS.APIARY, { language: 'fr' });
  assert.match(widget.data.content.components[0].text, /mot de passe de votre compte BEEP/);

  const refusedApi = fakeBeep();
  const refused = await startApp({
    api: refusedApi,
    config: { ...CONFIG, password: 'wrong' },
  });
  t.after(() => refused.gladys.fake.shutdown());
  assert.match(refused.gladys.fake.connectionStatus.message.fr, /BEEP a refusé l’e-mail/);
  const ack = await refused.gladys.fake.action(ACTIONS.CHECK, {});
  assert.match(ack.data.message.en, /BEEP refused the email or the password/);
  // The password is never in a log nor a status.
  assert.doesNotMatch(JSON.stringify(refused.gladys.fake.connectionStatus), /wrong/);

  // A new configuration logs in again.
  await refused.gladys.fake.configUpdated(CONFIG);
  assert.equal(refused.gladys.fake.connectionStatus.connected, true);
});

test('BEEP unreachable: the status says so, the widgets wait for a first reading', async (t) => {
  const api = fakeBeep();
  api.offline = true;
  const { gladys } = await startApp({ api });
  t.after(() => gladys.fake.shutdown());
  assert.match(gladys.fake.connectionStatus.message.de, /BEEP-API ist nicht erreichbar/);
  const widget = await gladys.fake.widgetGet(WIDGETS.ALERTS, { language: 'es' });
  assert.match(widget.data.content.components[0].text, /todavía no se ha leído/);
});

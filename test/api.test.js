// The BEEP client against the fake API: login, token in a header, a new
// login after a 401, empty answers, retries, errors.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBeepClient, ERROR_KINDS, kindOf } from '../src/beep-api.js';
import { fakeBeep, EMAIL, PASSWORD, UNVERIFIED } from './helpers/fake-api.js';

const clientOf = (api, credentials = { email: EMAIL, password: PASSWORD }) =>
  createBeepClient({ getCredentials: () => credentials, fetchImpl: api, sleep: async () => {} });

test('logs in once, then sends the token as a Bearer header', async () => {
  const api = fakeBeep();
  const client = clientOf(api);
  const devices = await client.devices();
  await client.alerts();
  assert.equal(devices.length, 3);
  const logins = api.calls.filter((call) => call.path === '/login');
  assert.equal(logins.length, 1);
  assert.deepEqual(logins[0].body, { email: EMAIL, password: PASSWORD });
  assert.equal(logins[0].auth, null);
  const reads = api.calls.filter((call) => call.path !== '/login');
  assert.ok(reads.every((call) => call.auth === 'Bearer token-1'));
  // Never the password nor the token in a URL.
  assert.ok(api.calls.every((call) => !JSON.stringify(call.params).includes('token')));
});

test('a 401 logs in again once, then retries', async () => {
  const api = fakeBeep();
  const client = clientOf(api);
  await client.devices();
  api.expireToken();
  const values = await client.lastValues(101);
  assert.equal(values.weight_kg, 42.31);
  assert.equal(api.calls.filter((call) => call.path === '/login').length, 2);
});

test('a refused login, an unverified account, no login at all', async () => {
  await assert.rejects(clientOf(fakeBeep(), { email: EMAIL, password: 'wrong' }).devices(), {
    kind: ERROR_KINDS.BAD_LOGIN,
  });
  await assert.rejects(clientOf(fakeBeep(), { email: UNVERIFIED, password: 'x' }).devices(), {
    kind: ERROR_KINDS.NOT_VERIFIED,
  });
  const api = fakeBeep();
  await assert.rejects(clientOf(api, { email: '', password: '' }).devices(), {
    kind: ERROR_KINDS.NO_LOGIN,
  });
  assert.equal(api.calls.length, 0);
});

test('"nothing here" answers are empty values', async () => {
  const api = fakeBeep();
  api.answers.devices = [];
  api.answers.alerts = [];
  const client = clientOf(api);
  assert.deepEqual(await client.devices(), []);
  assert.deepEqual(await client.alerts(), []);
  assert.equal(await client.lastValues(999), null);
  // BEEP answers 500 "sensor-no-data-error" for a device without data: no retry.
  assert.deepEqual(await client.measurements(103, { names: ['weight_kg'] }), []);
  assert.equal(api.calls.filter((call) => call.path === '/sensors/measurements').length, 1);
});

test('measurements: the week of a device, hourly', async () => {
  const api = fakeBeep();
  const rows = await clientOf(api).measurements(101, { names: ['weight_kg'], interval: 'week' });
  assert.equal(rows.length, 168);
  const call = api.calls.find((entry) => entry.path === '/sensors/measurements');
  assert.deepEqual(call.params, {
    id: '101',
    interval: 'week',
    index: '0',
    relative_interval: '1',
    names: 'weight_kg',
    timezone: 'UTC',
  });
});

test('a 5xx or a network error is tried once more; a 429 is not', async () => {
  const api = fakeBeep();
  const client = clientOf(api);
  await client.devices();
  api.failNext = 503;
  assert.equal((await client.devices()).length, 3);
  api.failNext = 429;
  await assert.rejects(client.devices(), { kind: ERROR_KINDS.RATE_LIMIT });
  api.offline = true;
  await assert.rejects(client.devices(), { kind: ERROR_KINDS.UNREACHABLE });
});

test('a token is dropped when the login changes', async () => {
  const api = fakeBeep();
  const credentials = { email: EMAIL, password: PASSWORD };
  const client = clientOf(api, credentials);
  await client.devices();
  credentials.password = 'wrong';
  await assert.rejects(client.devices(), { kind: ERROR_KINDS.BAD_LOGIN });
});

test('kinds of HTTP failures', () => {
  assert.equal(kindOf(401), ERROR_KINDS.BAD_LOGIN);
  assert.equal(kindOf(429), ERROR_KINDS.RATE_LIMIT);
  assert.equal(kindOf(502), ERROR_KINDS.SERVER);
  assert.equal(kindOf(422), ERROR_KINDS.REQUEST);
});

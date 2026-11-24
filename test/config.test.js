import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, readLanguage } from '../src/config.js';

test('defaults fill an empty configuration', () => {
  assert.deepEqual(normalizeConfig(), {
    email: '',
    password: '',
    interval: 15,
    swarmDropKg: 1,
    language: 'auto',
  });
  assert.equal(normalizeConfig(null).interval, 15);
});

test('the email is trimmed and lowercased, the password kept as typed', () => {
  const config = normalizeConfig({
    email: '  Apiculteur@Example.com ',
    password: ' spaces count ',
    interval: '5',
    swarm_drop_kg: '1.5',
    language: 'de',
  });
  assert.equal(config.email, 'apiculteur@example.com');
  assert.equal(config.password, ' spaces count ');
  assert.equal(config.interval, 5);
  assert.equal(config.swarmDropKg, 1.5);
  assert.equal(config.language, 'de');
});

test('a value outside the choices falls back to the default', () => {
  const config = normalizeConfig({
    interval: '45',
    swarm_drop_kg: 'lots',
    language: 'it',
    password: 7,
  });
  assert.equal(config.interval, 15);
  assert.equal(config.swarmDropKg, 1);
  assert.equal(config.language, 'auto');
  assert.equal(config.password, '');
});

test('the stored language of the last widget', () => {
  assert.equal(readLanguage({ last_language: 'es' }, 'en'), 'es');
  assert.equal(readLanguage({ last_language: 'spanish' }, 'en'), 'en');
  assert.equal(readLanguage(null, 'fr'), 'fr');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatInstant, localDate, readBeepDate } from '../src/time.js';

test('BEEP dates are UTC, with or without a "T" and a "Z"', () => {
  assert.equal(readBeepDate('2026-11-20 16:52:00'), Date.parse('2026-11-20T16:52:00Z'));
  assert.equal(readBeepDate('2026-11-20T16:52:00Z'), Date.parse('2026-11-20T16:52:00Z'));
  assert.equal(readBeepDate('2026-11-20T16:52:00.123Z'), Date.parse('2026-11-20T16:52:00.123Z'));
  assert.equal(readBeepDate('2021-07-13 13:04:06+05:30'), Date.parse('2021-07-13T07:34:06Z'));
  assert.equal(readBeepDate(null), null);
  assert.equal(readBeepDate('yesterday'), null);
});

test('local dates and instants for a person, in the timezone of Gladys', () => {
  // 23:30 UTC on 20 November is already the 21st in Paris.
  assert.equal(localDate(Date.parse('2026-11-20T23:30:00Z'), 'Europe/Paris'), '2026-11-21');
  const now = Date.parse('2026-11-20T17:00:00Z');
  assert.equal(
    formatInstant(Date.parse('2026-11-20T16:52:00Z'), 'fr', now, 'Europe/Paris'),
    '17:52',
  );
  assert.match(
    formatInstant(Date.parse('2026-11-19T08:00:00Z'), 'en', now, 'Europe/Paris'),
    /Thu 19 Nov.*09:00/,
  );
});

// -----------------------------------------------------------------------------
// Configuration of the BEEP integration.
//
// Fields of the config_schema:
//   - `email`          the email of the BEEP account (app.beep.nl);
//   - `password`       its password (a `secret`: never sent back to the UI,
//                      never logged); BEEP has no other way to get a token;
//   - `interval`       minutes between two readings: 5, 15 or 30;
//   - `swarm_drop_kg`  the weight loss within an hour that counts as a swarm:
//                      0.5, 1, 1.5, 2 or 3 kg;
//   - `language`       language of the texts Gladys does not ask for in a
//                      language (device names, scene texts): `auto` follows
//                      the language of the last widget request.
//
// Internal key, outside the config_schema (never shown in the UI):
//   - `last_language` language of the last widget request.
// -----------------------------------------------------------------------------

import { isLanguage } from './i18n.js';

const AUTO_LANGUAGE = 'auto';
const INTERNAL_KEYS = { language: 'last_language' };
const INTERVALS = [5, 15, 30];
const SWARM_DROPS = [0.5, 1, 1.5, 2, 3];
const DEFAULTS = { interval: 15, swarmDropKg: 1 };

const readString = (raw) =>
  typeof raw === 'string' ? raw.trim() : typeof raw === 'number' ? String(raw) : '';

/**
 * @description A value of a select, or the default.
 * @param {unknown} raw - "15", 15.
 * @param {number[]} allowed - The values of the select.
 * @param {number} fallback - The default.
 * @returns {number} The value.
 */
function readChoice(raw, allowed, fallback) {
  const value = Number(readString(raw));
  return allowed.includes(value) ? value : fallback;
}

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {object} `{ email, password, interval, swarmDropKg, language }`.
 */
function normalizeConfig(rawConfig = {}) {
  const config = rawConfig ?? {};
  return {
    email: readString(config.email).toLowerCase(),
    // A password keeps its spaces: only an absent value is empty.
    password: typeof config.password === 'string' ? config.password : '',
    interval: readChoice(config.interval, INTERVALS, DEFAULTS.interval),
    swarmDropKg: readChoice(config.swarm_drop_kg, SWARM_DROPS, DEFAULTS.swarmDropKg),
    language: isLanguage(config.language) ? config.language : AUTO_LANGUAGE,
  };
}

/**
 * @description Read the stored language of the last request.
 * @param {object} [rawConfig] - The raw config values.
 * @param {string} fallback - The language to keep when nothing valid is stored.
 * @returns {string} The language.
 */
function readLanguage(rawConfig, fallback) {
  const language = (rawConfig ?? {})[INTERNAL_KEYS.language];
  return typeof language === 'string' && /^[a-z]{2}$/.test(language) ? language : fallback;
}

export {
  AUTO_LANGUAGE,
  INTERNAL_KEYS,
  INTERVALS,
  SWARM_DROPS,
  DEFAULTS,
  normalizeConfig,
  readLanguage,
};

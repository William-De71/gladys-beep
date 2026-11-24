// -----------------------------------------------------------------------------
// Dates shown to the user.
//
// BEEP stores its dates in UTC: `last_message_received` as "2026-11-24
// 09:41:07" (Laravel, timezone UTC), the measurements as ISO dates from
// InfluxDB ("2026-11-24T09:40:00Z"). The day of the "change today" weight is
// the local day of Gladys (TZ, given by the supervisor). Intl only, no
// dependency.
// -----------------------------------------------------------------------------

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

/**
 * @description The timezone of the instance.
 * @returns {string|undefined} An IANA name, undefined for the system one.
 */
function defaultTimeZone() {
  return process.env.TZ || undefined;
}

/**
 * @description The local date of an instant in a timezone.
 * @param {number} instant - The instant (ms).
 * @param {string} [zone] - An IANA name.
 * @returns {string} "YYYY-MM-DD".
 */
function localDate(instant, zone = defaultTimeZone()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instant));
}

/**
 * @description Read a BEEP date (UTC), with or without a "T" and a "Z".
 * @param {unknown} value - "2026-11-24 09:41:07", "2026-11-24T09:40:00Z".
 * @returns {number|null} The instant (ms), null when unreadable.
 */
function readBeepDate(value) {
  const match =
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:?\d{2})?$/.exec(
      String(value ?? '').trim(),
    );
  if (!match) {
    return null;
  }
  const instant = Date.parse(`${match[1]}T${match[2]}${match[3] ?? 'Z'}`);
  return Number.isFinite(instant) ? instant : null;
}

/**
 * @description An instant for a person: "09:41" today, "Mon 23 Nov 09:41"
 * otherwise, in the timezone of Gladys.
 * @param {number} instant - The instant (ms).
 * @param {string} language - The language.
 * @param {number} now - Now (ms).
 * @param {string} [zone] - An IANA name.
 * @returns {string} The text.
 */
function formatInstant(instant, language, now, zone = defaultTimeZone()) {
  const locale = LOCALES[language] ?? LOCALES.en;
  const sameDay = localDate(instant, zone) === localDate(now, zone);
  return new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    ...(sameDay ? {} : { weekday: 'short', day: 'numeric', month: 'short' }),
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(instant));
}

export {
  MINUTE_MS,
  HOUR_MS,
  DAY_MS,
  LOCALES,
  defaultTimeZone,
  localDate,
  readBeepDate,
  formatInstant,
};

// -----------------------------------------------------------------------------
// Dashboard widgets of the BEEP integration.
//
//   - `apiary`  the hives at a glance: how many, how many offline, how many
//               alerts (tiles), then one row per hive (card list): weight and
//               change of the day, temperature inside, last message, online
//               or not;
//   - `weight`  the weight of the last 7 days (chart, one curve per hive, 4 at
//               most, or the hive chosen in the settings), with the weight now
//               and its change over the day and the week;
//   - `alerts`  the alerts of the BEEP alert rules, the latest first.
//
// Budget of a card: 8 components, 1 main one, 6 tiles, 2 texts, 1 status,
// 4 buttons.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { t, agoText } from './i18n.js';
import { hiveLabel, round } from './measurements.js';
import { formatKg } from './events.js';
import { formatInstant } from './time.js';

const WIDGETS = { APIARY: 'apiary', WEIGHT: 'weight', ALERTS: 'alerts' };
const TTL_SECONDS = 300;
const APP_URL = 'https://app.beep.nl';
const MAX_ITEMS = 8;
const MAX_SERIES = 4;

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description A widget that only says something.
 * @param {string} text - The message.
 * @param {number} [ttl] - Seconds before Gladys asks again.
 * @returns {object} The content.
 */
function messageContent(text, ttl = 60) {
  return {
    ttl_seconds: ttl,
    components: [{ type: 'text', variant: 'body', text: clip(text, 300) }],
  };
}

const appButton = (language) => ({
  type: 'button',
  label: t('buttonOpenBeep', language),
  icon: 'external-link',
  style: 'secondary',
  link: { url: APP_URL },
});

/**
 * @description A number for a person, in the language: "34,8".
 * @param {number} value - The value.
 * @param {string} language - The language.
 * @param {number} [digits] - Decimals at most.
 * @returns {string} The text.
 */
const formatNumber = (value, language, digits = 1) =>
  new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value);

/**
 * @description The line of a hive: "42.3 kg (+0.4 kg) · 34.8 °C · 12 min ago".
 * The age is in the subtitle: in a card list, the `date` of an item replaces
 * the subtitle.
 * @param {object} device - A device of the snapshot.
 * @param {string} language - The language.
 * @param {number} now - Now (ms).
 * @returns {string} The subtitle.
 */
function hiveLine(device, language, now) {
  const weight = device.values.weight_kg;
  const parts = [];
  if (weight !== undefined) {
    parts.push(
      device.weightChange !== null && device.weightChange !== undefined
        ? `${formatKg(weight, language)} (${formatKg(device.weightChange, language, true)})`
        : formatKg(weight, language),
    );
  }
  const inside = device.values.t_i ?? device.values.t;
  if (inside !== undefined) {
    parts.push(`${formatNumber(inside, language)} °C`);
  }
  if (device.values.bv !== undefined) {
    parts.push(`${formatNumber(device.values.bv, language, 2)} V`);
  }
  const last = device.valuesAt ?? device.lastMessageAt;
  if (last) {
    parts.push(agoText(Math.max(0, Math.round((now - last) / 60000)), language));
  }
  return parts.join(' · ') || t('noValues', language);
}

/**
 * @description The "Apiary" widget.
 * @param {object} options - `{ snapshot, language, now }`.
 * @returns {object} The content.
 */
function buildApiaryWidget({ snapshot, language, now }) {
  const offline = snapshot.devices.filter((device) => !device.online).length;
  const components = [
    {
      type: 'value',
      label: t('tileHives', language),
      value: snapshot.devices.length,
      icon: 'grid',
      color: WIDGET_COLORS.PRIMARY,
    },
    {
      type: 'value',
      label: t('tileOffline', language),
      value: offline,
      icon: 'wifi-off',
      color: offline > 0 ? WIDGET_COLORS.DANGER : WIDGET_COLORS.SUCCESS,
    },
    {
      type: 'value',
      label: t('tileAlerts', language),
      value: snapshot.alerts.length,
      icon: 'bell',
      color: snapshot.alerts.length > 0 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    },
  ];
  if (snapshot.devices.length === 0) {
    components.push({ type: 'text', variant: 'body', text: clip(t('noDevices', language), 300) });
  } else {
    components.push({
      type: 'card-list',
      display: 'list',
      items: snapshot.devices.slice(0, MAX_ITEMS).map((device) => ({
        title: clip(hiveLabel(device), 60),
        subtitle: clip(hiveLine(device, language, now), 120),
        badge: device.online
          ? { text: clip(t('badgeOnline', language), 16), color: WIDGET_COLORS.SUCCESS }
          : { text: clip(t('badgeOffline', language), 16), color: WIDGET_COLORS.DANGER },
      })),
    });
  }
  components.push(appButton(language));
  return { ttl_seconds: TTL_SECONDS, components };
}

/**
 * @description The "Hive weight" widget.
 * @param {object} options - `{ curves: [{ device, points }], language }`, the
 * points of the last 7 days, oldest first.
 * @returns {object} The content.
 */
function buildWeightWidget({ curves, language }) {
  const drawn = curves.filter((curve) => curve.points.length > 0).slice(0, MAX_SERIES);
  if (drawn.length === 0) {
    return messageContent(t('noWeight', language), TTL_SECONDS);
  }
  const components = [];
  if (drawn.length === 1) {
    const { device, points } = drawn[0];
    const now = device.values.weight_kg ?? points[points.length - 1].v;
    components.push(
      {
        type: 'value',
        label: t('tileWeight', language),
        value: round(now, 1),
        unit: 'kg',
        icon: 'package',
        color: WIDGET_COLORS.PRIMARY,
      },
      {
        type: 'value',
        label: t('tileToday', language),
        value:
          device.weightChange === null || device.weightChange === undefined
            ? '—'
            : formatKg(device.weightChange, language, true).replace(' kg', ''),
        unit: 'kg',
        icon: 'sun',
        color: WIDGET_COLORS.NEUTRAL,
      },
      {
        type: 'value',
        label: t('tileWeek', language),
        value: formatKg(round(now - points[0].v, 2), language, true).replace(' kg', ''),
        unit: 'kg',
        icon: 'calendar',
        color: WIDGET_COLORS.NEUTRAL,
      },
    );
  }
  components.push({
    type: 'chart',
    chart_type: 'line',
    unit: 'kg',
    title: clip(drawn.length === 1 ? hiveLabel(drawn[0].device) : t('chartTitle', language), 60),
    series: drawn.map(({ device, points }) => ({
      name: clip(hiveLabel(device), 40),
      points: points.slice(-300),
    })),
  });
  return { ttl_seconds: TTL_SECONDS, components };
}

/**
 * @description The "BEEP alerts" widget.
 * @param {object} options - `{ snapshot, language, now, timeZone }`.
 * @returns {object} The content.
 */
function buildAlertsWidget({ snapshot, language, now, timeZone }) {
  if (snapshot.alerts.length === 0) {
    return {
      ttl_seconds: TTL_SECONDS,
      components: [
        { type: 'text', variant: 'body', text: clip(t('noAlerts', language), 300) },
        appButton(language),
      ],
    };
  }
  const items = [...snapshot.alerts]
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0) || b.id - a.id)
    .slice(0, MAX_ITEMS)
    .map((alert) => {
      const where = alert.hiveName || alert.deviceName;
      const item = {
        title: clip(alert.rule || t('alertNoRule', language), 60),
        subtitle: clip(
          [where, alert.value, alert.at ? formatInstant(alert.at, language, now, timeZone) : '']
            .filter(Boolean)
            .join(' · '),
          120,
        ),
      };
      if (alert.count > 1) {
        item.badge = {
          text: clip(t('badgeTimes', language, { count: alert.count }), 16),
          color: WIDGET_COLORS.WARNING,
        };
      }
      if (alert.formula || alert.location) {
        item.description = clip([alert.formula, alert.location].filter(Boolean).join('\n'), 2000);
      }
      return item;
    });
  return {
    ttl_seconds: TTL_SECONDS,
    components: [{ type: 'card-list', display: 'list', items }, appButton(language)],
  };
}

export {
  WIDGETS,
  TTL_SECONDS,
  APP_URL,
  MAX_SERIES,
  messageContent,
  hiveLine,
  buildApiaryWidget,
  buildWeightWidget,
  buildAlertsWidget,
};

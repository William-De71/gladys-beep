// -----------------------------------------------------------------------------
// What a reading changes in the memory, and the scene events it fires.
//
//   - `swarm_suspected`  the weight of a hive fell by at least the configured
//                        drop (1 kg by default) below its highest value of the
//                        hour: a swarm leaving takes a large part of the
//                        colony at once. One event per hive per 6 hours.
//   - `device_offline`   BEEP says a device stopped sending (it counts a device
//                        offline after twice its sending interval, 15 minutes
//                        at least).
//   - `beep_alert`       an alert rule of the BEEP account fired (a new alert,
//                        or the same alert raised again: its count grew).
//
// The first reading is a baseline: devices already offline and alerts already
// listed fire nothing. A measurement is handled once (`lastAt`): reading
// every 5 minutes a device that sends every 15 changes nothing. At most 10
// alert events per reading.
// -----------------------------------------------------------------------------

import { MINUTE_MS, HOUR_MS, localDate, formatInstant } from './time.js';
import { hiveLabel, round } from './measurements.js';
import { WEIGHTS_KEEP_MS } from './store.js';
import { t } from './i18n.js';

const TRIGGERS = {
  SWARM: 'swarm_suspected',
  OFFLINE: 'device_offline',
  ALERT: 'beep_alert',
};
const SWARM_WINDOW_MS = 60 * MINUTE_MS;
const SWARM_SILENCE_MS = 6 * HOUR_MS;
const MAX_ALERT_EVENTS = 10;

/**
 * @description Update the memory with a reading, and say what happened.
 * Adds `weightChange` (kg since the first weight of the local day, or null)
 * to each device of the snapshot.
 * @param {object} snapshot - `{ devices: [{ id, online, values, valuesAt, ... }], alerts }`.
 * @param {object} store - The store (store.js).
 * @param {object} options - `{ now, timeZone, swarmDropKg }`.
 * @returns {{ swarms: object[], offline: object[], alerts: object[] }} The events to fire.
 */
function track(snapshot, store, { now, timeZone, swarmDropKg }) {
  const data = store.data;
  const news = { swarms: [], offline: [], alerts: [] };
  const today = localDate(now, timeZone);

  for (const device of snapshot.devices) {
    const id = String(device.id);
    data.seen[id] = [...new Set([...(data.seen[id] ?? []), ...Object.keys(device.values)])];

    const weight = device.values.weight_kg ?? null;
    const at = device.valuesAt;
    if (weight !== null && at !== null && at > (data.lastAt[id] ?? 0)) {
      const history = (data.weights[id] ?? []).filter((point) => at - point[0] <= WEIGHTS_KEEP_MS);
      const hour = history.filter((point) => at - point[0] <= SWARM_WINDOW_MS && point[0] < at);
      if (hour.length > 0) {
        const highest = Math.max(...hour.map((point) => point[1]));
        const drop = round(highest - weight, 2);
        const quiet = !data.swarmAt[id] || at - data.swarmAt[id] >= SWARM_SILENCE_MS;
        if (drop >= swarmDropKg && quiet) {
          news.swarms.push({ device, before: highest, after: weight, drop, at });
          data.swarmAt[id] = at;
        }
      }
      data.weights[id] = [...history, [at, weight]];
      const date = localDate(at, timeZone);
      if (data.day[id]?.date !== date) {
        data.day[id] = { date, kg: weight };
      }
      data.lastAt[id] = at;
    }
    const day = data.day[id];
    device.weightChange =
      weight !== null && day?.date === today && Number.isFinite(day.kg)
        ? round(weight - day.kg, 2)
        : null;

    if (data.online[id] === true && device.online === false) {
      news.offline.push({ device });
    }
    data.online[id] = device.online;
  }

  if (data.alerts === null) {
    data.alerts = Object.fromEntries(snapshot.alerts.map((alert) => [alert.id, alert.count]));
  } else {
    for (const alert of [...snapshot.alerts].sort((a, b) => a.id - b.id)) {
      const known = data.alerts[alert.id];
      if (known === undefined || alert.count > known) {
        news.alerts.push(alert);
      }
      data.alerts[alert.id] = alert.count;
    }
    news.alerts = news.alerts.slice(-MAX_ALERT_EVENTS);
  }
  return news;
}

/**
 * @description A weight for a person: "42.3 kg", "-1.25 kg" in French "42,3 kg".
 * @param {number} kg - The weight.
 * @param {string} language - The language.
 * @param {boolean} [signed] - Show a "+" for a gain.
 * @returns {string} The text.
 */
function formatKg(kg, language, signed = false) {
  const text = new Intl.NumberFormat(language, {
    maximumFractionDigits: 2,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(kg);
  return `${text} kg`;
}

/**
 * @description The data of a swarm event.
 * @param {object} swarm - `{ device, before, after, drop, at }`.
 * @param {string} externalId - The device external id.
 * @param {string} language - The language of the summary.
 * @param {string} [timeZone] - The timezone of Gladys.
 * @returns {object} The flat payload.
 */
function swarmData(swarm, externalId, language, timeZone) {
  const hive = hiveLabel(swarm.device);
  return {
    device: externalId,
    hive,
    device_name: swarm.device.name,
    weight_before: swarm.before,
    weight_after: swarm.after,
    drop_kg: swarm.drop,
    measured_at: new Date(swarm.at).toISOString(),
    summary: t('swarmSummary', language, {
      hive,
      drop: formatKg(swarm.drop, language),
      time: formatInstant(swarm.at, language, swarm.at, timeZone),
    }),
  };
}

/**
 * @description The data of an offline event.
 * @param {object} device - The parsed device.
 * @param {string} externalId - The device external id.
 * @param {string} language - The language of the summary.
 * @param {number} now - Now (ms).
 * @param {string} [timeZone] - The timezone of Gladys.
 * @returns {object} The flat payload.
 */
function offlineData(device, externalId, language, now, timeZone) {
  const hive = hiveLabel(device);
  const last = device.lastMessageAt
    ? formatInstant(device.lastMessageAt, language, now, timeZone)
    : '';
  return {
    device: externalId,
    hive,
    device_name: device.name,
    last_message_at: device.lastMessageAt ? new Date(device.lastMessageAt).toISOString() : '',
    summary: last
      ? t('offlineSummary', language, { hive, time: last })
      : t('offlineSummaryNoTime', language, { hive }),
  };
}

/**
 * @description The data of a BEEP alert event.
 * @param {object} alert - The parsed alert.
 * @param {string} externalId - The external id of its device, or ''.
 * @param {string} language - The language of the summary.
 * @returns {object} The flat payload.
 */
function alertData(alert, externalId, language) {
  const hive = alert.hiveName || alert.deviceName;
  const rule = alert.rule || t('alertNoRule', language);
  return {
    device: externalId,
    alert_id: alert.id,
    rule,
    value: alert.value,
    hive,
    device_name: alert.deviceName,
    location: alert.location,
    count: alert.count,
    summary: [rule, hive, alert.value].filter(Boolean).join(' · ').slice(0, 1000),
  };
}

export {
  TRIGGERS,
  SWARM_WINDOW_MS,
  SWARM_SILENCE_MS,
  MAX_ALERT_EVENTS,
  track,
  formatKg,
  swarmData,
  offlineData,
  alertData,
};

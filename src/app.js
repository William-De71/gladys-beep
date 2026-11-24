// -----------------------------------------------------------------------------
// The BEEP integration: every handler, registered on a Gladys client.
//
// Brings the hives monitored with BEEP (the open source bee monitoring
// platform of the BEEP foundation, app.beep.nl) into Gladys, through the API
// of the BEEP account of the user:
//   - devices (device.js): one per BEEP measurement device, named after its
//     hive: weight, change of the day, temperatures, humidity, battery...
//   - scene triggers (events.js): a swarm may have left (sudden weight
//     loss), a device stopped sending, a BEEP alert rule fired;
//   - scene action: a summary of the apiary, for a message or a voice answer;
//   - dashboard widgets (widgets.js): apiary, hive weight, BEEP alerts.
//
// BEEP has no push for third parties: the integration reads it on its own
// timer (5, 15 or 30 min; 2 requests plus one per device). Transport: cloud.
//
// index.js only creates the SDK client; the tests drive this module with the
// fake Gladys of the SDK and a fake BEEP API (test/helpers/fake-api.js).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, readLanguage, INTERNAL_KEYS, AUTO_LANGUAGE } from './config.js';
import { createBeepClient, BeepError, ERROR_KINDS } from './beep-api.js';
import {
  parseDevice,
  parseLastValues,
  parseAlert,
  hiveLabel,
  weightPoints,
  round as roundTo,
} from './measurements.js';
import { createStore, DEFAULT_PATH } from './store.js';
import { idsOf, beepIdOf, buildDevice, buildStates } from './device.js';
import { TRIGGERS, track, swarmData, offlineData, alertData } from './events.js';
import {
  WIDGETS,
  TTL_SECONDS,
  MAX_SERIES,
  messageContent,
  hiveLine,
  buildApiaryWidget,
  buildWeightWidget,
  buildAlertsWidget,
} from './widgets.js';
import { defaultTimeZone, MINUTE_MS } from './time.js';
import { LANGUAGES, t, all } from './i18n.js';

const ACTIONS = { CHECK: 'check' };
const SCENE_ACTIONS = { SUMMARY: 'apiary_summary' };
const RETRY_MS = 15 * MINUTE_MS;
// 60 calls per minute per BEEP user: 2 calls plus one per device per reading.
const MAX_DEVICES = 40;
const CURVE_CACHE_MS = 30 * MINUTE_MS;
const {
  name: NAME,
  version: VERSION,
  homepage: HOMEPAGE,
} = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/**
 * @description The message key and values of a failure.
 * @param {Error} err - A BeepError, or anything else.
 * @returns {{ key: string, values: object }} The message.
 */
function problemOf(err) {
  switch (err?.kind) {
    case ERROR_KINDS.NO_LOGIN:
      return { key: 'noLogin', values: {} };
    case ERROR_KINDS.BAD_LOGIN:
      return { key: 'statusBadLogin', values: {} };
    case ERROR_KINDS.NOT_VERIFIED:
      return { key: 'statusNotVerified', values: {} };
    case ERROR_KINDS.RATE_LIMIT:
      return { key: 'statusRateLimited', values: {} };
    case ERROR_KINDS.UNREACHABLE:
      return { key: 'statusUnreachable', values: {} };
    default:
      return { key: 'statusApiError', values: { detail: err?.message ?? String(err) } };
  }
}

/** Failures that wait for a new configuration instead of a retry. */
const WAITS_FOR_CONFIG = new Set([
  ERROR_KINDS.NO_LOGIN,
  ERROR_KINDS.BAD_LOGIN,
  ERROR_KINDS.NOT_VERIFIED,
]);

/**
 * @description Register every handler of the integration on a Gladys client.
 * @param {object} gladys - A GladysIntegration (or the fake Gladys of the SDK).
 * @param {object} [options] - Test seams.
 * @param {typeof fetch} [options.fetchImpl] - fetch.
 * @param {string} [options.baseUrl] - The BEEP API root.
 * @param {() => number} [options.now] - Clock.
 * @param {(ms: number) => Promise<void>} [options.sleep] - Wait before a retry.
 * @param {string} [options.dataDir] - Where /data files go.
 * @param {string} [options.timeZone] - The timezone of Gladys.
 * @param {boolean} [options.timer] - Read on a timer (false in the tests).
 * @param {object} [options.logger] - Logger.
 * @returns {object} Handles for the tests.
 */
function createApp(
  gladys,
  {
    fetchImpl = globalThis.fetch,
    baseUrl,
    now = () => Date.now(),
    sleep,
    dataDir = '/data',
    timeZone = defaultTimeZone(),
    timer = true,
    logger = sdkLogger,
  } = {},
) {
  let config = normalizeConfig();
  // Language of the last widget request: the fallback of the texts Gladys does
  // not ask for in a language, when the `language` setting is `auto`.
  let language = 'en';
  let createdDevices = new Set();
  let lastStatus = null;
  let snapshot = null;
  let offered = null;
  let roundTimer = null;
  let running = null;
  let stopped = false;
  const curves = new Map();

  const client = createBeepClient({
    getCredentials: () => ({ email: config.email, password: config.password }),
    userAgent: `${NAME}/${VERSION} (+${HOMEPAGE})`,
    baseUrl,
    fetchImpl,
    sleep,
  });
  const store = createStore({
    path: dataDir === '/data' ? DEFAULT_PATH : `${dataDir}/beep.json`,
    logger,
    now,
  });

  const textLanguage = () => (config.language === AUTO_LANGUAGE ? language : config.language);
  const hasLogin = () => Boolean(config.email && config.password);

  /**
   * @description Remember the language of a request, and store it when it changed.
   * @param {string} next - The language.
   */
  function rememberLanguage(next) {
    if (!LANGUAGES.includes(next) || next === language) {
      return;
    }
    language = next;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: next })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
  }

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} connected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(connected, message) {
    const signature = JSON.stringify([connected, message]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  // --- Devices ------------------------------------------------------------------

  async function refreshCreatedDevices() {
    try {
      const devices = await gladys.getDevices();
      createdDevices = new Set(devices.map((device) => device.external_id));
    } catch (err) {
      logger.warn(`Unable to read the devices: ${err.message}`);
    }
  }

  /**
   * @description Offer the BEEP devices on the Discovery screen, when the list changed.
   * @param {boolean} [force] - Publish even when unchanged.
   * @returns {Promise<void>}
   */
  async function offerDevices(force = false) {
    if (!snapshot) {
      return;
    }
    const lang = textLanguage();
    const devices = snapshot.devices.map((device) =>
      buildDevice(gladys, device, store.data.seen[String(device.id)] ?? [], lang),
    );
    const signature = JSON.stringify(devices);
    if (!force && signature === offered) {
      return;
    }
    try {
      await gladys.publishDiscoveredDevices(devices);
      offered = signature;
    } catch (err) {
      logger.warn(`Unable to offer the devices: ${err.message}`);
    }
  }

  /**
   * @description Publish the states of the created devices that changed.
   * @returns {Promise<void>}
   */
  async function publishStates() {
    if (!snapshot) {
      return;
    }
    // Only the devices the user created: Gladys drops the other states.
    const states = snapshot.devices
      .filter((device) => createdDevices.has(idsOf(gladys, device.id).device))
      .flatMap((device) => buildStates(gladys, device));
    if (states.length > 0) {
      await gladys
        .publishChangedStates(states)
        .catch((err) => logger.warn(`Unable to publish the states: ${err.message}`));
    }
  }

  function refreshWidgets() {
    Object.values(WIDGETS).forEach((key) =>
      Promise.resolve()
        .then(() => gladys.requestWidgetRefresh(key))
        .catch(() => {}),
    );
  }

  // --- Events -------------------------------------------------------------------

  async function publishEvent(key, data) {
    try {
      await gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Unable to publish the scene event ${key}: ${err.message}`);
    }
  }

  async function publishEvents(news) {
    const lang = textLanguage();
    for (const swarm of news.swarms) {
      logger.info(`Possible swarm: ${hiveLabel(swarm.device)} lost ${swarm.drop} kg`);
      await publishEvent(
        TRIGGERS.SWARM,
        swarmData(swarm, idsOf(gladys, swarm.device.id).device, lang, timeZone),
      );
    }
    for (const { device } of news.offline) {
      logger.info(`Device offline: ${hiveLabel(device)}`);
      await publishEvent(
        TRIGGERS.OFFLINE,
        offlineData(device, idsOf(gladys, device.id).device, lang, now(), timeZone),
      );
    }
    for (const alert of news.alerts) {
      logger.info(`BEEP alert ${alert.id}: ${alert.rule} (${alert.hiveName || alert.deviceName})`);
      const listed = snapshot.devices.some((device) => device.id === alert.deviceId);
      await publishEvent(
        TRIGGERS.ALERT,
        alertData(alert, listed ? idsOf(gladys, alert.deviceId).device : '', lang),
      );
    }
  }

  // --- The reading --------------------------------------------------------------

  /**
   * @description Read BEEP once: the devices, their last values, the alerts;
   * then events, devices, states, widgets, status.
   * @returns {Promise<object|null>} The snapshot, null without a login.
   */
  async function readNow() {
    if (!hasLogin()) {
      await reportStatus(false, all('noLogin'));
      return null;
    }
    try {
      const listed = (await client.devices())
        .map(parseDevice)
        .filter(Boolean)
        .sort((a, b) => hiveLabel(a).localeCompare(hiveLabel(b), undefined, { numeric: true }));
      if (listed.length > MAX_DEVICES) {
        logger.warn(`BEEP lists ${listed.length} devices: only the first ${MAX_DEVICES} are read`);
      }
      const devices = [];
      for (const device of listed.slice(0, MAX_DEVICES)) {
        const { at, values } = parseLastValues(await client.lastValues(device.id));
        devices.push({ ...device, values, valuesAt: at, weightChange: null });
      }
      const alerts = (await client.alerts()).map(parseAlert).filter(Boolean);
      snapshot = { devices, alerts, fetchedAt: now() };

      const news = track(snapshot, store, {
        now: now(),
        timeZone,
        swarmDropKg: config.swarmDropKg,
      });
      const ids = new Set(devices.map((device) => String(device.id)));
      Object.keys(store.data.online)
        .filter((id) => !ids.has(id))
        .forEach((id) => store.forgetDevice(id));
      store.prune();
      await store.save();
      const offline = devices.filter((device) => !device.online).length;
      logger.info(
        `BEEP: ${devices.length} device(s), ${offline} offline, ${alerts.length} alert(s), ` +
          `${news.swarms.length + news.offline.length + news.alerts.length} event(s)`,
      );
      await publishEvents(news);
      await offerDevices();
      await publishStates();
      refreshWidgets();
      await reportStatus(
        true,
        all('statusConnected', { devices: devices.length, offline, alerts: alerts.length }),
      );
      return snapshot;
    } catch (err) {
      const { key, values } = problemOf(err);
      logger.warn(`BEEP reading failed (${err.kind ?? 'error'}): ${err.message}`);
      await reportStatus(false, all(key, values));
      throw err;
    }
  }

  /**
   * @description One reading at a time; the next one is scheduled after it.
   * @returns {Promise<object|null>} The snapshot, null on failure.
   */
  function round() {
    if (!running) {
      running = readNow()
        .then((result) => {
          if (result) {
            schedule(config.interval * MINUTE_MS);
          }
          return result;
        })
        .catch((err) => {
          // A refused login waits for a new configuration; the rest tries again.
          if (!WAITS_FOR_CONFIG.has(err.kind)) {
            schedule(RETRY_MS);
          }
          return null;
        })
        .finally(() => {
          running = null;
        });
    }
    return running;
  }

  function schedule(ms) {
    clearTimeout(roundTimer);
    if (!timer || stopped) {
      return;
    }
    roundTimer = setTimeout(round, ms);
    roundTimer.unref?.();
  }

  // --- Dashboard widgets --------------------------------------------------------

  /**
   * @description The message a widget shows instead of its content, if any.
   * @param {string} lang - The language of the widget.
   * @returns {object|null} The content of the message.
   */
  function widgetProblem(lang) {
    rememberLanguage(lang);
    if (!hasLogin()) {
      return messageContent(t('noLogin', lang));
    }
    if (!snapshot) {
      return messageContent(t('notReadYet', lang), 30);
    }
    return null;
  }

  /**
   * @description The weight of a device over the last 7 days, read from BEEP
   * at most every 30 minutes.
   * @param {object} device - A device of the snapshot.
   * @returns {Promise<Array<{ t: string, v: number }>>} The points.
   */
  async function curveOf(device) {
    const cached = curves.get(device.id);
    if (cached && now() - cached.at < CURVE_CACHE_MS) {
      return cached.points;
    }
    try {
      const points = weightPoints(
        await client.measurements(device.id, { names: ['weight_kg'], interval: 'week' }),
      );
      curves.set(device.id, { at: now(), points });
      return points;
    } catch (err) {
      logger.warn(`Unable to read the weight of ${hiveLabel(device)}: ${err.message}`);
      return cached?.points ?? [];
    }
  }

  gladys.onWidgetGet(WIDGETS.APIARY, async ({ language: lang } = {}) => {
    return widgetProblem(lang) ?? buildApiaryWidget({ snapshot, language: lang, now: now() });
  });

  gladys.onWidgetGet(WIDGETS.WEIGHT, async ({ language: lang, settings = {} } = {}) => {
    const problem = widgetProblem(lang);
    if (problem) {
      return problem;
    }
    const chosen = beepIdOf(settings.hive);
    const weighing = snapshot.devices.filter(
      (device) =>
        (store.data.seen[String(device.id)] ?? []).includes('weight_kg') &&
        (chosen === null || device.id === chosen),
    );
    const shown = weighing.slice(0, MAX_SERIES);
    const drawn = [];
    for (const device of shown) {
      drawn.push({ device, points: await curveOf(device) });
    }
    return buildWeightWidget({ curves: drawn, language: lang });
  });

  gladys.onWidgetGet(WIDGETS.ALERTS, async ({ language: lang } = {}) => {
    return (
      widgetProblem(lang) ?? buildAlertsWidget({ snapshot, language: lang, now: now(), timeZone })
    );
  });

  // --- Scene action -------------------------------------------------------------

  gladys.onSceneAction(SCENE_ACTIONS.SUMMARY, async () => {
    // No trigger fires here: an action never starts an event.
    const current = snapshot ?? (await round());
    if (!current) {
      throw new Error(lastStatus ? JSON.parse(lastStatus)[1].en : 'BEEP could not be read');
    }
    const lang = textLanguage();
    const offline = current.devices.filter((device) => !device.online).length;
    const weights = current.devices
      .map((device) => device.values.weight_kg)
      .filter((value) => value !== undefined);
    const lines = current.devices.map((device) =>
      t('summaryHive', lang, { hive: hiveLabel(device), line: hiveLine(device, lang, now()) }),
    );
    return {
      summary: (lines.length > 0
        ? [...lines, ...(offline > 0 ? [t('summaryOffline', lang, { count: offline })] : [])].join(
            '\n',
          )
        : t('summaryNone', lang)
      ).slice(0, 10000),
      hives: current.devices.length,
      offline,
      alerts: current.alerts.length,
      total_weight_kg:
        weights.length > 0
          ? roundTo(
              weights.reduce((a, b) => a + b, 0),
              2,
            )
          : null,
    };
  });

  // --- Configuration button -----------------------------------------------------

  gladys.onAction(ACTIONS.CHECK, async () => {
    const result = await round();
    if (!result) {
      return hasLogin() ? JSON.parse(lastStatus ?? '[false,{}]')[1] : all('noLogin');
    }
    return all((lang) =>
      [
        t('checkLine', lang, {
          email: config.email,
          devices: result.devices.length,
          alerts: result.alerts.length,
        }),
        ...result.devices.map((device) =>
          t('summaryHive', lang, { hive: hiveLabel(device), line: hiveLine(device, lang, now()) }),
        ),
      ].join('\n'),
    );
  });

  // --- Devices ------------------------------------------------------------------

  gladys.onSetValue(async (device, feature) => {
    throw new Error(`Read-only feature: ${feature.external_id}`);
  });

  gladys.onScanRequest(async () => {
    await round();
    await offerDevices(true);
  });

  gladys.onDeviceCreated(async () => {
    await refreshCreatedDevices();
    // States sent before the device existed were dropped by Gladys, and the SDK
    // forgot what it sent for this device: send everything known again.
    await publishStates();
    refreshWidgets();
  });

  gladys.onDeviceDeleted(refreshCreatedDevices);

  // --- Configuration ------------------------------------------------------------

  async function loadConfig(fallback) {
    try {
      const raw = await gladys.getConfig();
      config = normalizeConfig(raw);
      language = readLanguage(raw, language);
    } catch (err) {
      if (fallback) {
        config = normalizeConfig(fallback);
      }
      logger.error('Unable to read the configuration', err);
    }
  }

  gladys.onConfigUpdated(async (raw) => {
    await loadConfig(raw);
    logger.info(
      `Configuration: every ${config.interval} min, swarm at ${config.swarmDropKg} kg, ` +
        `login ${hasLogin() ? 'set' : 'missing'}`,
    );
    client.forget();
    offered = null;
    curves.clear();
    await round();
  });

  let startup = Promise.resolve();
  gladys.on('connected', () => {
    startup = (async () => {
      stopped = false;
      await store.load();
      await loadConfig();
      await refreshCreatedDevices();
      lastStatus = null;
      offered = null;
      await round();
    })().catch((err) => logger.error('Post-connection initialization failed', err));
  });

  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    stopped = true;
    clearTimeout(roundTimer);
    await store.save();
  });

  return {
    getConfig: () => config,
    snapshot: () => snapshot,
    round,
    store,
    whenReady: () => startup,
    stop: () => {
      stopped = true;
      clearTimeout(roundTimer);
    },
  };
}

export { createApp, ACTIONS, SCENE_ACTIONS, TTL_SECONDS, MAX_DEVICES, problemOf, BeepError };

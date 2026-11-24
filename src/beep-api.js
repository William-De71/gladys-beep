// -----------------------------------------------------------------------------
// Client of the BEEP API (https://api.beep.nl/api), the open source bee
// monitoring platform of the BEEP foundation. Routes and answers follow the
// source of the API (github.com/beepnl/BEEP, routes/api.php and the
// controllers of app/Http/Controllers/Api, read on 2026-11-24):
//   - POST /login                  email + password -> the user, with `api_token`
//   - GET  /devices                the measurement devices of the user (and of
//                                  the groups they belong to)
//   - GET  /sensors/lastvalues     the last value of each measurement of a device
//   - GET  /sensors/measurements   the measurements of a device over an interval
//   - GET  /alerts                 the alerts raised by the alert rules of the user
//
// The token travels as a Bearer header, never in a URL (so never in a log),
// and lives in memory only: the integration logs in again at start and after
// a 401. Checked against the real API on 2026-11-24: a wrong login answers
// 400 {"message":"invalid_user"}, a call without a valid token 401
// {"message":"Unauthenticated."}. BEEP allows 60 calls per minute per user
// (API_GLOBAL_RATE_LIMIT) and 20 logins per minute.
//
// A network error or a 5xx is tried once more; the rest fails at once with a
// BeepError that names its kind.
// -----------------------------------------------------------------------------

export const DEFAULT_BASE_URL = 'https://api.beep.nl/api';
const TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 2000;

export const ERROR_KINDS = {
  NO_LOGIN: 'no_login',
  BAD_LOGIN: 'bad_login',
  NOT_VERIFIED: 'not_verified',
  RATE_LIMIT: 'rate_limit',
  REQUEST: 'request',
  SERVER: 'server',
  UNREACHABLE: 'unreachable',
};

export class BeepError extends Error {
  /**
   * @param {string} kind - One of ERROR_KINDS.
   * @param {string} message - What went wrong (never the password nor the token).
   * @param {number|null} [status] - The HTTP status.
   * @param {unknown} [body] - The parsed body of the answer.
   */
  constructor(kind, message, status = null, body = null) {
    super(message);
    this.name = 'BeepError';
    this.kind = kind;
    this.status = status;
    this.body = body;
  }
}

/**
 * @description The kind of an HTTP failure.
 * @param {number} status - The status.
 * @returns {string} One of ERROR_KINDS.
 */
export function kindOf(status) {
  if (status === 401) {
    return ERROR_KINDS.BAD_LOGIN;
  }
  if (status === 429) {
    return ERROR_KINDS.RATE_LIMIT;
  }
  if (status >= 500) {
    return ERROR_KINDS.SERVER;
  }
  return ERROR_KINDS.REQUEST;
}

/**
 * @description The message of a BEEP error body, short.
 * @param {unknown} body - `{"message": "..."}`, `"no_devices_found"` or text.
 * @returns {string} The detail.
 */
function detailOf(body) {
  const value =
    body && typeof body === 'object' ? (body.message ?? body.error ?? JSON.stringify(body)) : body;
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/**
 * @description Build a client.
 * @param {object} options - Options.
 * @param {() => { email: string, password: string }} options.getCredentials - The login.
 * @param {string} [options.userAgent] - The User-Agent.
 * @param {string} [options.baseUrl] - The API root (tests point it to a fake).
 * @param {typeof fetch} [options.fetchImpl] - fetch.
 * @param {(ms: number) => Promise<void>} [options.sleep] - Wait before the retry.
 * @returns {object} `{ login, devices, lastValues, measurements, alerts, forget }`.
 */
export function createBeepClient({
  getCredentials,
  userAgent = 'gladys-beep',
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const root = baseUrl.replace(/\/+$/, '');
  let token = null;
  let tokenFor = null;
  let loggingIn = null;

  async function once(method, path, { query = {}, body, auth = true } = {}) {
    const url = new URL(`${root}${path}`);
    for (const [name, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(name, String(value));
      }
    }
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: {
          Accept: 'application/json',
          'User-Agent': userAgent,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new BeepError(
        ERROR_KINDS.UNREACHABLE,
        `Cannot reach the BEEP API (${err?.cause?.code ?? err?.name ?? 'network error'})`,
      );
    }
    const text = await response.text().catch(() => '');
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      if (response.ok) {
        throw new BeepError(ERROR_KINDS.SERVER, 'The BEEP API answered something that is not JSON');
      }
      parsed = text;
    }
    if (!response.ok) {
      const detail = detailOf(parsed);
      throw new BeepError(
        kindOf(response.status),
        `HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
        response.status,
        parsed,
      );
    }
    return parsed;
  }

  /**
   * @description One call, tried once more after a network error or a 5xx.
   * @param {string} method - GET or POST.
   * @param {string} path - The path under /api.
   * @param {object} [options] - `{ query, body, auth }`.
   * @returns {Promise<unknown>} The parsed body.
   */
  async function call(method, path, options) {
    try {
      return await once(method, path, options);
    } catch (err) {
      if (err.kind !== ERROR_KINDS.SERVER && err.kind !== ERROR_KINDS.UNREACHABLE) {
        throw err;
      }
      // A 500 with a BEEP error code ("sensor-no-data-error") is an answer.
      if (err.status === 500 && typeof err.body === 'string' && /^[a-z-]+$/.test(err.body)) {
        throw err;
      }
      await sleep(RETRY_DELAY_MS);
      return once(method, path, options);
    }
  }

  /**
   * @description Log in with the email and password of the configuration.
   * @returns {Promise<object>} The user: `{ id, name, email, locale, ... }` (no token).
   */
  async function login() {
    const { email, password } = getCredentials();
    if (!email || !password) {
      throw new BeepError(ERROR_KINDS.NO_LOGIN, 'No BEEP email or password in the configuration');
    }
    let user;
    try {
      user = await call('POST', '/login', { body: { email, password }, auth: false });
    } catch (err) {
      if (err.status === 400) {
        const notVerified = detailOf(err.body) === 'email_not_verified';
        throw new BeepError(
          notVerified ? ERROR_KINDS.NOT_VERIFIED : ERROR_KINDS.BAD_LOGIN,
          notVerified ? 'The BEEP account email is not verified' : 'BEEP refused the login',
          400,
        );
      }
      throw err;
    }
    if (!user || typeof user.api_token !== 'string' || !user.api_token) {
      throw new BeepError(ERROR_KINDS.SERVER, 'The BEEP login answer has no token');
    }
    token = user.api_token;
    tokenFor = `${email}\n${password}`;
    const { api_token: _token, ...rest } = user;
    return rest;
  }

  /**
   * @description Log in once, even when several calls need it at the same time.
   * @returns {Promise<void>}
   */
  async function ensureToken() {
    const { email, password } = getCredentials();
    if (token && tokenFor === `${email}\n${password}`) {
      return;
    }
    token = null;
    if (!loggingIn) {
      loggingIn = login().finally(() => {
        loggingIn = null;
      });
    }
    await loggingIn;
  }

  /**
   * @description An authenticated GET; a 401 logs in again once.
   * @param {string} path - The path under /api.
   * @param {object} [query] - The query parameters.
   * @returns {Promise<unknown>} The parsed body.
   */
  async function get(path, query = {}) {
    await ensureToken();
    try {
      return await call('GET', path, { query });
    } catch (err) {
      if (err.status !== 401) {
        throw err;
      }
      token = null;
      await ensureToken();
      return call('GET', path, { query });
    }
  }

  /**
   * @description A GET whose "nothing here" answer (404, or BEEP's 500 with an
   * error code) is an empty value, not a failure.
   * @param {string} path - The path.
   * @param {object} query - The query.
   * @param {unknown} empty - The value for "nothing".
   * @returns {Promise<unknown>} The body or `empty`.
   */
  async function getOrEmpty(path, query, empty) {
    try {
      return await get(path, query);
    } catch (err) {
      if (err.status === 404 || (err.status === 500 && typeof err.body === 'string')) {
        return empty;
      }
      throw err;
    }
  }

  return {
    login: async () => {
      token = null;
      await ensureToken();
    },
    /**
     * @description Forget the token (a new configuration logs in again).
     */
    forget() {
      token = null;
      tokenFor = null;
    },
    /**
     * @description The measurement devices of the user and of their groups.
     * @returns {Promise<object[]>} The devices (404 "no_devices_found" = none).
     */
    async devices() {
      const body = await getOrEmpty('/devices', {}, []);
      return Array.isArray(body) ? body : [];
    },
    /**
     * @description The last value of each measurement of a device.
     * @param {number} id - The BEEP device id.
     * @returns {Promise<object|null>} `{ time, weight_kg, t_i, ... }`, null when none.
     */
    async lastValues(id) {
      const body = await getOrEmpty('/sensors/lastvalues', { id }, null);
      return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
    },
    /**
     * @description The measurements of a device over the last week (one mean
     * per hour) or day (one per 10 minutes).
     * @param {number} id - The BEEP device id.
     * @param {object} options - `{ names: string[], interval: 'day'|'week' }`.
     * @returns {Promise<object[]>} `[{ time, weight_kg, ... }]`.
     */
    async measurements(id, { names, interval = 'week' }) {
      const body = await getOrEmpty(
        '/sensors/measurements',
        {
          id,
          interval,
          index: 0,
          relative_interval: 1,
          names: names.join(','),
          timezone: 'UTC',
        },
        null,
      );
      return Array.isArray(body?.measurements) ? body.measurements : [];
    },
    /**
     * @description The alerts of the user (404 "no alerts available" = none).
     * @returns {Promise<object[]>} The alerts.
     */
    async alerts() {
      const body = await getOrEmpty('/alerts', {}, null);
      return Array.isArray(body?.alerts) ? body.alerts : [];
    },
  };
}

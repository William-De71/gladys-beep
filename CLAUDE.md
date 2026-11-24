# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for BEEP, the open source bee
monitoring platform of the BEEP foundation (app.beep.nl): a Node.js service
(Node 22+, ESM, no build step) that runs in its own sandboxed Docker container
and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It reads the BEEP API (`https://api.beep.nl/api`)
of the user's BEEP account: the measurement devices, their last values, the
weight of the last week and the alerts of the alert rules. Transport: cloud
only. Read only: nothing is ever written to BEEP. **Never tested with a real
BEEP account**: the routes and shapes follow the source of the API
(github.com/beepnl/BEEP, read on 2026-11-24); only the refused login (400
`{"message":"invalid_user"}`) and the missing token (401
`{"message":"Unauthenticated."}`) were checked against the real API.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js              SDK wiring only (new GladysIntegration + createApp)
src/app.js            every handler, registered before connect(); the reading timer,
                      events, states, status, the weight curves (cached 30 min)
src/beep-api.js       HTTP client: POST /login -> token in memory, Bearer header, a new
                      login after a 401, one retry on 5xx / network, empty "nothing" answers
src/measurements.js   the BEEP measurements kept (abbreviation -> feature key, category,
                      type, unit, bounds), parsing of devices, last values, alerts, weights
src/events.js         memory of a reading: swarm (weight drop within an hour), offline,
                      BEEP alerts, weight change of the day, event payloads
src/store.js          /data/beep.json: measurements seen, first weight of the day, weights
                      of the last 2 h, last measurement handled, swarm silence, online, alerts
src/device.js         one device per BEEP device, its features and states
src/widgets.js        apiary, weight (7 days chart), alerts
src/time.js           BEEP dates (UTC), local day, instants for a person
src/config.js         configuration (email, password, interval, swarm drop, language)
src/i18n.js           runtime texts, en / fr / de / es
test/helpers/fake-api.js            the fake BEEP API behind the `fetchImpl` option
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**, and so is every key users store: device and
  feature external ids (`device:<BEEP device id>`, feature keys of
  `src/measurements.js`), feature `category` / `type` / `unit` / `min` /
  `max` / `step`, the keys of `config_schema` and the values of its selects,
  `actions`, the widgets and their settings, scene triggers (fields,
  variables) and the scene action (outputs). `test/structure.test.js`
  compares them to `test/fixtures/discovery.baseline.json`: never update the
  baseline to make a test pass without a documented migration. A new BEEP
  measurement is a new feature key, appended to `MEASUREMENTS`.
- **The password and the token**: the password is a `secret`, sent only in the
  body of `POST /login`; the token stays in memory (never in `/data`, a URL or
  a log). A refused login waits for a new configuration (no retry loop).
- **Read only**: never call a BEEP route that writes (calibration, settings,
  inspections, alert rules).
- **`should_poll` stays false**: the integration reads on its own timer (5, 15
  or 30 min; 15 min after a failure). BEEP allows 60 calls per minute per
  user: a reading makes 2 calls plus one per device (40 devices at most).
- **Events once.** The first reading is a baseline (`online` and `alerts` of
  the store). A measurement is handled once (`lastAt`). A swarm is announced
  once per hive per 6 hours; at most 10 alert events per reading. A scene
  action or a widget never fires an event.
- **Features follow what a device sent** (`seen`), and never disappear once
  offered. A value missing from the last reading is not published.
- **Gladys has no kilogram**: weights are `counter-sensor` decimals whose name
  says "kg" (as gladys-pellet-stock and gladys-oilfox do).
- **Widget icons** must exist in the Gladys icon font (`fe-*` of
  `@gladysassistant/theme-optimized`): `hexagon` does not, `grid` does.
- **Card lists**: the `date` of an item replaces its subtitle in the Gladys
  front: the age of the measurement goes into the subtitle.
- **The container rootfs is read-only.** Write only under `/data`.
- **Four languages.** Every user-facing text (manifest, `src/i18n.js`,
  `docs/*.md`, README) exists in English, French, German and Spanish;
  `test/i18n.test.js` checks it. German uses "du", Spanish "usted". Hive and
  device names come from BEEP and are never translated.
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  Below 1.0.0 until the maintainer runs Release with `release-as: 1.0.0`.
- **Changelog.** Ne jamais éditer CHANGELOG.md à la main, il est généré à la
  release. Écris le titre de PR comme la ligne que l'utilisateur lira.
- **Commits and PR titles** follow Conventional Commits, in English.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.

## Pitfalls

- A wrong login: HTTP 400 `{"message":"invalid_user"}`; an unverified email:
  400 `"email_not_verified"`; a missing or stale token: 401
  `{"message":"Unauthenticated."}`.
- "Nothing here" answers are errors in BEEP: `GET /devices` 404
  `"no_devices_found"`, `GET /alerts` 404, `GET /sensors/lastvalues` 404
  `"error"`, `GET /sensors/measurements` 500 `"sensor-no-data-error"` (not
  retried).
- `last_message_received` is UTC without a zone ("2026-11-24 09:41:07");
  measurement times are ISO with "Z". `online` is computed by BEEP (no message
  for max(15 min, twice the interval)).
- `GET /sensors/lastvalues` may add `from_cache: true` and keys the
  integration does not know (`rssi`, `snr`, sound bins): only `MEASUREMENTS`
  are kept, within their bounds.
- In `src/app.js`, the reading is `round()`: the rounding helper of
  measurements.js is imported as `roundTo`.
- `node --test` also runs `test/helpers/`: nothing starts on import.

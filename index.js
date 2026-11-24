// -----------------------------------------------------------------------------
// Entry point of the BEEP external integration.
//
// Brings the hives monitored with BEEP (open source bee monitoring, app.beep.nl)
// into Gladys, through the API of the BEEP account of the user:
//   - devices: one per BEEP measurement device (weight, change of the day,
//     temperatures, humidity, battery...) (src/device.js);
//   - scene triggers: a swarm may have left, a device stopped sending, a BEEP
//     alert rule fired;
//   - scene action: a summary of the apiary;
//   - dashboard widgets: apiary, hive weight, BEEP alerts.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the BEEP integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});

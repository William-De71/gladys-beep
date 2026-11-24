# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - unreleased

### Added

- **devices:** one device per BEEP measurement device, named after its hive: weight, weight change of the day, temperature inside and outside, temperature probes, humidity, air pressure, light, sound level, bee counts and battery voltage, as the device measures them
- **scenes:** triggers when a swarm may have left (sudden weight loss, threshold of 0.5 to 3 kg), when a device stops sending and when a BEEP alert rule fires (once each, a restart never fires twice); action "summary of the apiary" for a message or a voice answer
- **widgets:** apiary (each hive, online or not), hive weight over 7 days (one curve per hive), BEEP alerts
- **configuration:** login with the email and password of the BEEP account, reading every 5, 15 or 30 minutes, swarm threshold, language of the texts, "Read BEEP now" button
- **i18n:** English, French, German and Spanish for the manifest, the runtime texts, the documentation and the README

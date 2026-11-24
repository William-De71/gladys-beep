// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: device and feature names, widget contents, statuses, scene texts.
// German says "du", Spanish "usted", like Gladys. Hive and device names come
// from BEEP and are never translated.
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // devices
  deviceName: {
    en: '{hive} (BEEP)',
    fr: '{hive} (BEEP)',
    de: '{hive} (BEEP)',
    es: '{hive} (BEEP)',
  },
  featureWeight: {
    en: 'Weight (kg)',
    fr: 'Poids (kg)',
    de: 'Gewicht (kg)',
    es: 'Peso (kg)',
  },
  featureWeightChange: {
    en: 'Weight change today (kg)',
    fr: 'Variation de poids du jour (kg)',
    de: 'Gewichtsänderung heute (kg)',
    es: 'Variación de peso de hoy (kg)',
  },
  featureTempInside: {
    en: 'Temperature inside',
    fr: 'Température intérieure',
    de: 'Innentemperatur',
    es: 'Temperatura interior',
  },
  featureHumidityInside: {
    en: 'Humidity inside',
    fr: 'Humidité intérieure',
    de: 'Innenluftfeuchtigkeit',
    es: 'Humedad interior',
  },
  featureTemp: {
    en: 'Temperature',
    fr: 'Température',
    de: 'Temperatur',
    es: 'Temperatura',
  },
  featureHumidity: {
    en: 'Humidity',
    fr: 'Humidité',
    de: 'Luftfeuchtigkeit',
    es: 'Humedad',
  },
  featurePressure: {
    en: 'Air pressure',
    fr: 'Pression atmosphérique',
    de: 'Luftdruck',
    es: 'Presión atmosférica',
  },
  featureLight: { en: 'Light', fr: 'Luminosité', de: 'Helligkeit', es: 'Luminosidad' },
  featureSound: {
    en: 'Sound level',
    fr: 'Niveau sonore',
    de: 'Schallpegel',
    es: 'Nivel sonoro',
  },
  featureBeesIn: {
    en: 'Bees in',
    fr: 'Abeilles entrées',
    de: 'Einfliegende Bienen',
    es: 'Abejas que entran',
  },
  featureBeesOut: {
    en: 'Bees out',
    fr: 'Abeilles sorties',
    de: 'Ausfliegende Bienen',
    es: 'Abejas que salen',
  },
  featureBattery: {
    en: 'Battery voltage',
    fr: 'Tension de la batterie',
    de: 'Batteriespannung',
    es: 'Tensión de la batería',
  },
  featureProbe: {
    en: 'Temperature probe {n}',
    fr: 'Sonde de température {n}',
    de: 'Temperaturfühler {n}',
    es: 'Sonda de temperatura {n}',
  },

  // scene texts
  swarmSummary: {
    en: '{hive}: the weight fell by {drop} within an hour ({time}), a swarm may have left.',
    fr: '{hive} : le poids a baissé de {drop} en moins d’une heure ({time}), un essaim est peut-être parti.',
    de: '{hive}: Das Gewicht ist innerhalb einer Stunde um {drop} gesunken ({time}), vielleicht ist ein Schwarm abgegangen.',
    es: '{hive}: el peso bajó {drop} en menos de una hora ({time}), puede que haya salido un enjambre.',
  },
  offlineSummary: {
    en: '{hive}: BEEP no longer receives measurements (last one {time}).',
    fr: '{hive} : BEEP ne reçoit plus de mesures (dernière à {time}).',
    de: '{hive}: BEEP empfängt keine Messwerte mehr (letzter um {time}).',
    es: '{hive}: BEEP ya no recibe mediciones (última a las {time}).',
  },
  offlineSummaryNoTime: {
    en: '{hive}: BEEP no longer receives measurements.',
    fr: '{hive} : BEEP ne reçoit plus de mesures.',
    de: '{hive}: BEEP empfängt keine Messwerte mehr.',
    es: '{hive}: BEEP ya no recibe mediciones.',
  },
  alertNoRule: { en: 'BEEP alert', fr: 'Alerte BEEP', de: 'BEEP-Alarm', es: 'Alerta de BEEP' },
  summaryNone: {
    en: 'No BEEP device in this account yet.',
    fr: 'Aucun appareil BEEP dans ce compte pour l’instant.',
    de: 'Noch kein BEEP-Gerät in diesem Konto.',
    es: 'Todavía no hay ningún dispositivo BEEP en esta cuenta.',
  },
  summaryHive: {
    en: '{hive}: {line}',
    fr: '{hive} : {line}',
    de: '{hive}: {line}',
    es: '{hive}: {line}',
  },
  summaryOffline: {
    en: '{count} offline',
    fr: '{count} hors ligne',
    de: '{count} offline',
    es: '{count} sin conexión',
  },

  // widgets
  tileHives: { en: 'Hives', fr: 'Ruches', de: 'Bienenstöcke', es: 'Colmenas' },
  tileOffline: { en: 'Offline', fr: 'Hors ligne', de: 'Offline', es: 'Sin conexión' },
  tileAlerts: { en: 'Alerts', fr: 'Alertes', de: 'Alarme', es: 'Alertas' },
  tileWeight: { en: 'Weight', fr: 'Poids', de: 'Gewicht', es: 'Peso' },
  tileToday: { en: 'Today', fr: 'Aujourd’hui', de: 'Heute', es: 'Hoy' },
  tileWeek: { en: '7 days', fr: '7 jours', de: '7 Tage', es: '7 días' },
  chartTitle: {
    en: 'Weight, last 7 days',
    fr: 'Poids sur 7 jours',
    de: 'Gewicht, letzte 7 Tage',
    es: 'Peso, últimos 7 días',
  },
  badgeOnline: { en: 'Online', fr: 'En ligne', de: 'Online', es: 'En línea' },
  badgeOffline: { en: 'Offline', fr: 'Hors ligne', de: 'Offline', es: 'Sin conexión' },
  badgeTimes: { en: '×{count}', fr: '×{count}', de: '×{count}', es: '×{count}' },
  buttonOpenBeep: { en: 'Open BEEP', fr: 'Ouvrir BEEP', de: 'BEEP öffnen', es: 'Abrir BEEP' },
  noValues: {
    en: 'No measurement yet',
    fr: 'Pas encore de mesure',
    de: 'Noch kein Messwert',
    es: 'Todavía sin mediciones',
  },
  noDevices: {
    en: 'No BEEP device in this account yet: add your BEEP base in the BEEP app first.',
    fr: 'Aucun appareil BEEP dans ce compte pour l’instant : ajoutez d’abord votre BEEP base dans l’application BEEP.',
    de: 'Noch kein BEEP-Gerät in diesem Konto: Füge zuerst deine BEEP base in der BEEP-App hinzu.',
    es: 'Todavía no hay ningún dispositivo BEEP en esta cuenta: añada primero su BEEP base en la aplicación BEEP.',
  },
  noWeight: {
    en: 'No weight measured over the last 7 days.',
    fr: 'Aucun poids mesuré ces 7 derniers jours.',
    de: 'In den letzten 7 Tagen wurde kein Gewicht gemessen.',
    es: 'No se ha medido ningún peso en los últimos 7 días.',
  },
  noAlerts: {
    en: 'No BEEP alert. Alert rules are set in the BEEP app (Alerts menu).',
    fr: 'Aucune alerte BEEP. Les règles d’alerte se règlent dans l’application BEEP (menu Alertes).',
    de: 'Kein BEEP-Alarm. Alarmregeln legst du in der BEEP-App fest (Menü Alarme).',
    es: 'Ninguna alerta de BEEP. Las reglas de alerta se configuran en la aplicación BEEP (menú Alertas).',
  },
  justNow: { en: 'just now', fr: 'à l’instant', de: 'gerade eben', es: 'ahora mismo' },
  minutesAgo: {
    en: '{n} min ago',
    fr: 'il y a {n} min',
    de: 'vor {n} Min.',
    es: 'hace {n} min',
  },
  hoursAgo: { en: '{n} h ago', fr: 'il y a {n} h', de: 'vor {n} Std.', es: 'hace {n} h' },
  daysAgo: {
    en: '{n} days ago',
    fr: 'il y a {n} jours',
    de: 'vor {n} Tagen',
    es: 'hace {n} días',
  },

  // statuses
  noLogin: {
    en: 'Enter the email and password of your BEEP account in the configuration.',
    fr: 'Saisissez l’e-mail et le mot de passe de votre compte BEEP dans la configuration.',
    de: 'Gib die E-Mail-Adresse und das Passwort deines BEEP-Kontos in der Konfiguration ein.',
    es: 'Introduzca el correo electrónico y la contraseña de su cuenta BEEP en la configuración.',
  },
  statusBadLogin: {
    en: 'BEEP refused the email or the password. Check them on app.beep.nl, then save the configuration again.',
    fr: 'BEEP a refusé l’e-mail ou le mot de passe. Vérifiez-les sur app.beep.nl, puis enregistrez de nouveau la configuration.',
    de: 'BEEP hat die E-Mail-Adresse oder das Passwort abgelehnt. Prüfe sie auf app.beep.nl und speichere die Konfiguration erneut.',
    es: 'BEEP rechazó el correo electrónico o la contraseña. Compruébelos en app.beep.nl y vuelva a guardar la configuración.',
  },
  statusNotVerified: {
    en: 'The email of this BEEP account is not verified yet: open the link BEEP sent you, then save the configuration again.',
    fr: 'L’e-mail de ce compte BEEP n’est pas encore vérifié : ouvrez le lien envoyé par BEEP, puis enregistrez de nouveau la configuration.',
    de: 'Die E-Mail-Adresse dieses BEEP-Kontos ist noch nicht bestätigt: Öffne den Link, den BEEP dir geschickt hat, und speichere die Konfiguration erneut.',
    es: 'El correo electrónico de esta cuenta BEEP aún no está verificado: abra el enlace que le envió BEEP y vuelva a guardar la configuración.',
  },
  statusRateLimited: {
    en: 'BEEP limits the number of requests: the next reading will try again.',
    fr: 'BEEP limite le nombre de requêtes : la prochaine lecture réessaiera.',
    de: 'BEEP begrenzt die Anzahl der Anfragen: Die nächste Abfrage versucht es erneut.',
    es: 'BEEP limita el número de solicitudes: la próxima lectura lo intentará de nuevo.',
  },
  statusUnreachable: {
    en: 'The BEEP API cannot be reached: the next reading will try again.',
    fr: 'L’API BEEP est injoignable : la prochaine lecture réessaiera.',
    de: 'Die BEEP-API ist nicht erreichbar: Die nächste Abfrage versucht es erneut.',
    es: 'No se puede acceder a la API de BEEP: la próxima lectura lo intentará de nuevo.',
  },
  statusApiError: {
    en: 'The BEEP API answered with an error ({detail}).',
    fr: 'L’API BEEP a répondu par une erreur ({detail}).',
    de: 'Die BEEP-API hat mit einem Fehler geantwortet ({detail}).',
    es: 'La API de BEEP respondió con un error ({detail}).',
  },
  statusConnected: {
    en: 'Connected to BEEP: {devices} device(s), {offline} offline, {alerts} alert(s).',
    fr: 'Connecté à BEEP : {devices} appareil(s), {offline} hors ligne, {alerts} alerte(s).',
    de: 'Mit BEEP verbunden: {devices} Gerät(e), {offline} offline, {alerts} Alarm(e).',
    es: 'Conectado a BEEP: {devices} dispositivo(s), {offline} sin conexión, {alerts} alerta(s).',
  },
  notReadYet: {
    en: 'BEEP has not been read yet: wait a minute.',
    fr: 'BEEP n’a pas encore été lu : patientez une minute.',
    de: 'BEEP wurde noch nicht abgefragt: Warte eine Minute.',
    es: 'BEEP todavía no se ha leído: espere un minuto.',
  },
  checkLine: {
    en: 'BEEP account {email}: {devices} device(s), {alerts} alert(s).',
    fr: 'Compte BEEP {email} : {devices} appareil(s), {alerts} alerte(s).',
    de: 'BEEP-Konto {email}: {devices} Gerät(e), {alerts} Alarm(e).',
    es: 'Cuenta BEEP {email}: {devices} dispositivo(s), {alerts} alerta(s).',
  },
};

/**
 * @description Whether a value is a language of the integration.
 * @param {unknown} value - The value.
 * @returns {boolean} True for en, fr, de, es.
 */
function isLanguage(value) {
  return LANGUAGES.includes(value);
}

/**
 * @description A text in a language, with its values.
 * @param {string} key - A TEXTS key.
 * @param {string} language - The language (English when unknown).
 * @param {object} [values] - The values of the `{placeholders}`.
 * @returns {string} The text, the key itself when unknown.
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[isLanguage(language) ? language : 'en'] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    values[name] === undefined || values[name] === null ? '' : String(values[name]),
  );
}

/**
 * @description A text in the four languages.
 * @param {string|Function} key - A TEXTS key, or `(language) => text`.
 * @param {object|Function} [values] - The values, or `(language) => values`.
 * @returns {object} `{ en, fr, de, es }`.
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      typeof key === 'function'
        ? key(language)
        : t(key, language, typeof values === 'function' ? values(language) : values),
    ]),
  );
}

/**
 * @description "just now", "12 min ago", "3 h ago", "2 days ago".
 * @param {number} minutes - Minutes ago.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function agoText(minutes, language) {
  if (minutes < 1) {
    return t('justNow', language);
  }
  if (minutes < 60) {
    return t('minutesAgo', language, { n: minutes });
  }
  if (minutes < 48 * 60) {
    return t('hoursAgo', language, { n: Math.round(minutes / 60) });
  }
  return t('daysAgo', language, { n: Math.round(minutes / 1440) });
}

export { LANGUAGES, TEXTS, isLanguage, t, all, agoText };

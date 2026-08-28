var PPD = PPD || {};

PPD.Config = (function () {
  var ADAPTER_VERSION = '0.1.0';

  function value(properties, key) {
    var found = properties && properties.getProperty
      ? properties.getProperty(key)
      : null;
    return found === null || found === undefined ? null : String(found).trim();
  }

  function isSecureIntakeUrl(url) {
    if (!/^https:\/\/[^/?#]+\/[^?#]+$/.test(String(url || ''))) return false;
    var path = String(url).replace(/^https:\/\/[^/]+/, '');
    return path === '/v1/intake-events' || path.endsWith('/v1/intake-events');
  }

  function load(properties, nowFunction) {
    var mode = (value(properties, 'TRANSPORT_MODE') || 'disabled').toLowerCase();
    if (['disabled', 'https'].indexOf(mode) === -1) {
      throw PPD.Errors.create('CONFIG_TRANSPORT_MODE_INVALID', 'Transport configuration is invalid.');
    }
    var ingestionUrl = value(properties, 'INGESTION_URL');
    var hmacKeyId = value(properties, 'QUEUE_HMAC_KEY_ID');
    var hmacSecret = value(properties, 'QUEUE_HMAC_SECRET');
    if (mode === 'https') {
      if (!isSecureIntakeUrl(ingestionUrl)) {
        throw PPD.Errors.create('CONFIG_HTTPS_URL_INVALID', 'HTTPS ingestion configuration is invalid.');
      }
      if (!hmacKeyId || !hmacSecret) {
        throw PPD.Errors.create('CONFIG_HTTPS_CREDENTIALS_MISSING', 'HTTPS ingestion configuration is incomplete.');
      }
    }
    return Object.freeze({
      adapterVersion: ADAPTER_VERSION,
      companyDomain: 'ppdpainting.com',
      expectedWorkspaceDomainId: value(properties, 'EXPECTED_WORKSPACE_DOMAIN_ID'),
      transportMode: mode,
      ingestionUrl: mode === 'https' ? ingestionUrl : null,
      hmacKeyId: mode === 'https' ? hmacKeyId : null,
      hmacSecret: mode === 'https' ? hmacSecret : null,
      proactiveEnabled: (value(properties, 'PROACTIVE_ENABLED') || '').toLowerCase() === 'true',
      now: typeof nowFunction === 'function' ? nowFunction : function () { return Date.now(); },
    });
  }

  function runtime() {
    var properties = PropertiesService.getScriptProperties();
    var config = load(properties);
    var fetcher = function (url, options) { return UrlFetchApp.fetch(url, options); };
    var transport = config.transportMode === 'https'
      ? PPD.Transport.https(config, fetcher)
      : PPD.Transport.unavailable();
    return Object.freeze({
      config: config,
      transport: transport,
      properties: properties,
      cache: CacheService.getScriptCache(),
      fetch: fetcher,
      chat: Chat,
    });
  }

  return Object.freeze({ load: load, runtime: runtime, isSecureIntakeUrl: isSecureIntakeUrl });
}());

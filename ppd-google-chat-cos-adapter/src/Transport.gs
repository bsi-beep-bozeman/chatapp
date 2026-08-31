var PPD = PPD || {};

PPD.Transport = (function () {
  var RESULT_SCHEMA = 'ppd.cos.ingestion-result.v1';
  var STATES = Object.freeze(['accepted', 'duplicate', 'rejected', 'unavailable']);

  function unavailableResult(code, retryable) {
    return Object.freeze({
      schemaVersion: RESULT_SCHEMA,
      state: 'unavailable',
      code: code,
      retryable: Boolean(retryable),
    });
  }

  function requireCode(value) {
    var code = String(value || '');
    if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(code)) {
      throw PPD.Errors.create('INGESTION_RESULT_CODE_INVALID', 'Ingestion result code is invalid.');
    }
    return code;
  }

  function requireReceipt(value) {
    var receipt = String(value || '');
    if (!/^rcpt_[A-Za-z0-9_-]{1,128}$/.test(receipt)) {
      throw PPD.Errors.create('INGESTION_RESULT_RECEIPT_INVALID', 'Ingestion result receipt is invalid.');
    }
    return receipt;
  }

  function optionalTime(value, field) {
    if (!value) return null;
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw PPD.Errors.create('INGESTION_RESULT_TIME_INVALID', 'Ingestion result ' + field + ' is invalid.');
    }
    return date.toISOString();
  }

  function validateResult(result) {
    if (!result || result.schemaVersion !== RESULT_SCHEMA) {
      throw PPD.Errors.create('INGESTION_RESULT_SCHEMA_INVALID', 'Ingestion result schema is invalid.');
    }
    if (STATES.indexOf(result.state) === -1) {
      throw PPD.Errors.create('INGESTION_RESULT_STATE_INVALID', 'Ingestion result state is invalid.');
    }
    if (result.state === 'accepted') {
      return Object.freeze({
        schemaVersion: RESULT_SCHEMA,
        state: result.state,
        receiptId: requireReceipt(result.receiptId),
        receivedAt: optionalTime(result.receivedAt, 'receivedAt'),
      });
    }
    if (result.state === 'duplicate') {
      return Object.freeze({
        schemaVersion: RESULT_SCHEMA,
        state: result.state,
        receiptId: requireReceipt(result.receiptId),
        firstReceivedAt: optionalTime(result.firstReceivedAt, 'firstReceivedAt'),
      });
    }
    if (result.state === 'rejected') {
      return Object.freeze({
        schemaVersion: RESULT_SCHEMA,
        state: result.state,
        code: requireCode(result.code),
      });
    }
    if (typeof result.retryable !== 'boolean') {
      throw PPD.Errors.create('INGESTION_RESULT_RETRY_INVALID', 'Ingestion retry state is invalid.');
    }
    return unavailableResult(requireCode(result.code), result.retryable);
  }

  function unavailable() {
    return Object.freeze({
      kind: 'unavailable',
      send: function () {
        return unavailableResult('INGESTION_NOT_CONNECTED', false);
      },
    });
  }

  function https(config, fetcher) {
    if (!config || config.transportMode !== 'https' || typeof fetcher !== 'function') {
      throw PPD.Errors.create('HTTPS_TRANSPORT_INVALID', 'HTTPS transport configuration is invalid.');
    }
    return Object.freeze({
      kind: 'https',
      send: function (envelope) {
        try {
          var body = PPD.Canonical.stringify(envelope);
          var bodyHash = PPD.Canonical.sha256(body);
          var timestamp = new Date(config.now()).toISOString();
          var path = config.ingestionUrl.replace(/^https:\/\/[^/]+/, '');
          var signatureInput = [
            'POST',
            path,
            timestamp,
            envelope.idempotencyKey,
            bodyHash,
          ].join('\n');
          var signature = PPD.Canonical.hmac(signatureInput, config.hmacSecret);
          var response = fetcher(config.ingestionUrl, {
            method: 'post',
            contentType: 'application/json; charset=utf-8',
            payload: body,
            muteHttpExceptions: true,
            headers: {
              'X-PPD-Key-Id': config.hmacKeyId,
              'X-PPD-Timestamp': timestamp,
              'Idempotency-Key': envelope.idempotencyKey,
              'X-PPD-Signature': 'v1=' + signature,
            },
          });
          var status = response.getResponseCode();
          if (status < 200 || status >= 300) {
            return unavailableResult('INGESTION_HTTP_ERROR', status === 429 || status >= 500);
          }
          return validateResult(JSON.parse(response.getContentText()));
        } catch (error) {
          return unavailableResult('INGESTION_TRANSPORT_ERROR', true);
        }
      },
    });
  }

  function scripted(results) {
    var queue = Array.isArray(results) ? results.slice() : [results];
    var sent = [];
    return {
      kind: 'scripted-test-only',
      sent: sent,
      send: function (envelope) {
        sent.push(envelope);
        var result = queue.length > 1 ? queue.shift() : queue[0];
        return validateResult(result);
      },
    };
  }

  return Object.freeze({
    states: STATES,
    validateResult: validateResult,
    unavailable: unavailable,
    https: https,
    scripted: scripted,
  });
}());

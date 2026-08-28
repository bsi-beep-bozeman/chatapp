var PPD = PPD || {};

PPD.Canonical = (function () {
  function isPlainObject(value) {
    return Object.prototype.toString.call(value) === '[object Object]';
  }

  function normalize(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (Array.isArray(value)) return value.map(normalize);
    if (isPlainObject(value)) {
      var output = {};
      Object.keys(value).sort().forEach(function (key) {
        output[key] = normalize(value[key]);
      });
      return output;
    }
    throw PPD.Errors.create(
      'CANONICAL_VALUE_UNSUPPORTED',
      'Request contains an unsupported value.'
    );
  }

  function stringify(value) {
    return JSON.stringify(normalize(value));
  }

  function hex(bytes) {
    return bytes.map(function (byte) {
      return (byte & 255).toString(16).padStart(2, '0');
    }).join('');
  }

  function sha256(value) {
    var text = typeof value === 'string' ? value : stringify(value);
    return hex(Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      text,
      Utilities.Charset.UTF_8
    ));
  }

  function hmac(value, key) {
    return hex(Utilities.computeHmacSignature(
      Utilities.MacAlgorithm.HMAC_SHA_256,
      value,
      key,
      Utilities.Charset.UTF_8
    ));
  }

  function id(prefix, value) {
    if (!/^[a-z][a-z0-9_]*$/.test(String(prefix || ''))) {
      throw PPD.Errors.create('ID_PREFIX_INVALID', 'Identifier prefix is invalid.');
    }
    return prefix + '_' + sha256(value).slice(0, 32);
  }

  function equalHex(left, right) {
    if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) {
      return false;
    }
    var difference = 0;
    for (var index = 0; index < left.length; index += 1) {
      difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return difference === 0;
  }

  return Object.freeze({
    stringify: stringify,
    sha256: sha256,
    hmac: hmac,
    id: id,
    equalHex: equalHex,
  });
}());

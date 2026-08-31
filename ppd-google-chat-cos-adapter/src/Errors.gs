var PPD = PPD || {};

PPD.Errors = {
  create: function (code, publicMessage, details) {
    var error = new Error(publicMessage || 'Request not accepted.');
    error.name = 'PpdAdapterError';
    error.code = code;
    error.publicMessage = publicMessage || 'Request not accepted.';
    error.details = details || null;
    return error;
  },

  publicMessage: function (error) {
    return error && error.name === 'PpdAdapterError'
      ? error.publicMessage
      : 'The request could not be processed safely.';
  },
};

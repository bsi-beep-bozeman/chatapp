var PPD = PPD || {};

PPD.Identity = (function () {
  function normalize(value) {
    return String(value || '').trim();
  }

  function fromEvent(event, config) {
    var user = event && event.user;
    var chatUserName = normalize(user && user.name);
    if (!/^users\/[A-Za-z0-9._@-]+$/.test(chatUserName)) {
      throw PPD.Errors.create('IDENTITY_MISSING', 'Google identity could not be verified.');
    }
    if (user.type && user.type !== 'HUMAN') {
      throw PPD.Errors.create(
        'IDENTITY_NOT_HUMAN',
        'Only a verified human user can submit this request.'
      );
    }

    var companyDomain = normalize(config && config.companyDomain).toLowerCase();
    if (!companyDomain) {
      throw PPD.Errors.create('COMPANY_DOMAIN_MISSING', 'The company identity policy is unavailable.');
    }
    var email = user.email ? normalize(user.email).toLowerCase() : null;
    if (email) {
      var emailPattern = new RegExp('^[^@\\s]+@' + companyDomain.replace(/\./g, '\\.') + '$', 'i');
      if (!emailPattern.test(email)) {
        throw PPD.Errors.create(
          'IDENTITY_DOMAIN_MISMATCH',
          'The interaction is outside the company domain.'
        );
      }
    }

    var domainId = user.domainId ? normalize(user.domainId) : null;
    var expectedDomainId = normalize(config && config.expectedWorkspaceDomainId);
    if (expectedDomainId && domainId !== expectedDomainId) {
      throw PPD.Errors.create(
        'IDENTITY_WORKSPACE_DOMAIN_MISMATCH',
        'The interaction is outside the expected Workspace domain.'
      );
    }

    return Object.freeze({
      chatUserName: chatUserName,
      email: email,
      domainId: domainId,
      type: 'HUMAN',
      source: 'google_chat_interaction',
    });
  }

  return Object.freeze({ fromEvent: fromEvent });
}());

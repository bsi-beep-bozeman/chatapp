var PPD = PPD || {};

PPD.ScopePolicy = (function () {
  var SPACE_TYPES = Object.freeze(['DIRECT_MESSAGE', 'SPACE', 'GROUP_CHAT']);
  var SENSITIVITY = Object.freeze(['shared', 'personal', 'sensitive']);

  function fromEvent(event) {
    var space = event && event.space;
    var spaceName = String(space && space.name || '').trim();
    if (!/^spaces\/[A-Za-z0-9_-]+$/.test(spaceName)) {
      throw PPD.Errors.create('SPACE_IDENTITY_MISSING', 'Google Chat space identity is invalid.');
    }

    var type = String(space && (space.spaceType || space.type) || '').trim();
    if (type === 'DM') type = 'DIRECT_MESSAGE';
    if (type === 'ROOM') type = 'SPACE';
    if (SPACE_TYPES.indexOf(type) === -1) {
      throw PPD.Errors.create('SPACE_TYPE_UNSUPPORTED', 'This Chat space type is not supported.');
    }

    return Object.freeze({
      spaceName: spaceName,
      spaceType: type,
      channel: type === 'DIRECT_MESSAGE' ? 'dm' : 'shared',
    });
  }

  function canDeliver(scope, sensitivity) {
    if (!scope || SENSITIVITY.indexOf(sensitivity) === -1) return false;
    if (sensitivity === 'shared') return true;
    return scope.channel === 'dm';
  }

  return Object.freeze({ fromEvent: fromEvent, canDeliver: canDeliver });
}());

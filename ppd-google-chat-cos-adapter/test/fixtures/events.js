function messageEvent(overrides = {}) {
  const base = {
    type: 'MESSAGE',
    eventTime: '2026-08-27T00:00:00.000Z',
    user: {
      name: 'users/123456789',
      type: 'HUMAN',
      email: 'tester@ppdpainting.com',
      domainId: 'D01',
    },
    space: { name: 'spaces/DM1', spaceType: 'DIRECT_MESSAGE' },
    message: {
      name: 'spaces/DM1/messages/M1',
      text: 'Plan tomorrow',
      thread: { name: 'spaces/DM1/threads/T1' },
    },
  };
  return {
    ...base,
    ...overrides,
    user: { ...base.user, ...(overrides.user || {}) },
    space: { ...base.space, ...(overrides.space || {}) },
    message: { ...base.message, ...(overrides.message || {}) },
  };
}

function cardEvent(parameters = {}, overrides = {}) {
  const event = messageEvent({ type: 'CARD_CLICKED', ...overrides });
  event.action = {
    actionMethodName: 'handleApprovalAction',
    parameters: Object.entries(parameters).map(([key, value]) => ({ key, value })),
  };
  return event;
}

function removeEvent(overrides = {}) {
  return messageEvent({ type: 'REMOVED_FROM_SPACE', message: {}, ...overrides });
}

module.exports = { messageEvent, cardEvent, removeEvent };

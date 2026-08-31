const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGs } = require('./helpers/load-gs');
const { messageEvent } = require('./fixtures/events');

const ctx = loadGs(['Errors.gs', 'Identity.gs', 'ScopePolicy.gs']);
const config = { companyDomain: 'ppdpainting.com', expectedWorkspaceDomainId: null };

test('identity is anchored to users/{id}, not display name or claimed role', () => {
  const event = messageEvent();
  event.user.displayName = 'Executive Owner';
  event.permissions = { canExecute: true };
  const identity = JSON.parse(JSON.stringify(ctx.PPD.Identity.fromEvent(event, config)));
  assert.deepEqual(identity, {
    chatUserName: 'users/123456789',
    email: 'tester@ppdpainting.com',
    domainId: 'D01',
    type: 'HUMAN',
    source: 'google_chat_interaction',
  });
  assert.equal(JSON.stringify(identity).includes('Executive Owner'), false);
  assert.equal(JSON.stringify(identity).includes('canExecute'), false);
});

test('an absent email remains unresolved and does not become authorization', () => {
  const identity = ctx.PPD.Identity.fromEvent(messageEvent({ user: { email: undefined } }), config);
  assert.equal(identity.email, null);
  assert.equal(identity.chatUserName, 'users/123456789');
});

test('external corroborating email and bot actors fail closed', () => {
  assert.throws(
    () => ctx.PPD.Identity.fromEvent(messageEvent({ user: { name: 'users/2', email: 'x@outside.invalid' } }), config),
    /company domain/
  );
  assert.throws(
    () => ctx.PPD.Identity.fromEvent(messageEvent({ user: { name: 'users/app', type: 'BOT', email: undefined } }), config),
    /human/
  );
});

test('configured Workspace domain ID must corroborate the event', () => {
  assert.throws(
    () => ctx.PPD.Identity.fromEvent(messageEvent(), { ...config, expectedWorkspaceDomainId: 'OTHER' }),
    /Workspace domain/
  );
});

test('shared spaces cannot receive sensitive output', () => {
  const shared = ctx.PPD.ScopePolicy.fromEvent(messageEvent({ space: { name: 'spaces/S1', spaceType: 'SPACE' } }));
  assert.equal(shared.channel, 'shared');
  assert.equal(ctx.PPD.ScopePolicy.canDeliver(shared, 'sensitive'), false);
  assert.equal(ctx.PPD.ScopePolicy.canDeliver(shared, 'shared'), true);
});

test('direct messages can receive authorized sensitive output', () => {
  const dm = ctx.PPD.ScopePolicy.fromEvent(messageEvent());
  assert.equal(dm.channel, 'dm');
  assert.equal(ctx.PPD.ScopePolicy.canDeliver(dm, 'sensitive'), true);
});

test('unknown or unnamed space types fail closed', () => {
  assert.throws(() => ctx.PPD.ScopePolicy.fromEvent(messageEvent({ space: { spaceType: 'UNKNOWN' } })), /space type/);
  assert.throws(() => ctx.PPD.ScopePolicy.fromEvent(messageEvent({ space: { name: '', spaceType: 'SPACE' } })), /space identity/);
});

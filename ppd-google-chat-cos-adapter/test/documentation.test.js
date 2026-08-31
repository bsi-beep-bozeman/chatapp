const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('README states that no live ingestion service exists', () => {
  const readme = read('README.md');
  assert.match(readme, /no live HTTPS ingestion service/i);
  assert.match(readme, /nothing was queued or changed/i);
  assert.match(readme, /standalone/i);
});

test('setup guide is company-restricted and leaves transport disabled', () => {
  const setup = read('docs/SETUP_AND_DEPLOYMENT.md');
  for (const heading of [
    'Prerequisites', 'Cloud project', 'Apps Script deployment', 'Chat API configuration',
    'Trusted testers', 'Script Properties', 'Smoke test', 'Rollback',
  ]) assert.match(setup, new RegExp(`^## ${heading}$`, 'm'), heading);
  assert.match(setup, /Audience[^\n]*Internal/i);
  assert.match(setup, /Specific people and groups in your domain/i);
  assert.match(setup, /TRANSPORT_MODE=disabled/);
  assert.match(setup, /incoming webhooks.*notification-only/i);
});

test('identity contract anchors identity and both permission rechecks', () => {
  const identity = read('docs/IDENTITY_AND_ACCESS_CONTRACT.md');
  assert.match(identity, /users\/\{id\}/);
  assert.match(identity, /never trust.*display name/i);
  assert.match(identity, /before retrieval/i);
  assert.match(identity, /immediately before execution/i);
  assert.match(identity, /role.*division.*source.*record.*purpose.*field.*action/is);
});

test('approval lifecycle binds exact action and prohibits self-approval', () => {
  const approval = read('docs/APPROVAL_LIFECYCLE.md');
  for (const control of ['Approve', 'Reject', 'Amend', 'Explain', 'Remind Me']) {
    assert.match(approval, new RegExp(control, 'i'));
  }
  assert.match(approval, /payload hash/i);
  assert.match(approval, /target/i);
  assert.match(approval, /one-time/i);
  assert.match(approval, /self-approval/i);
});

test('security docs prohibit ordinary Drive and source secrets', () => {
  const secrets = read('docs/SECRET_HANDLING.md');
  assert.match(secrets, /Apps Script Properties/);
  assert.match(secrets, /never.*ordinary Drive/i);
  assert.match(secrets, /never.*source/i);
  assert.match(secrets, /never.*HTML/i);
  for (const propertyName of [
    'TRANSPORT_MODE', 'INGESTION_URL', 'QUEUE_HMAC_KEY_ID', 'QUEUE_HMAC_SECRET',
    'PROACTIVE_ENABLED', 'CHAT_APP_SERVICE_ACCOUNT_JSON', 'EXPECTED_WORKSPACE_DOMAIN_ID',
  ]) assert.match(secrets, new RegExp(propertyName), propertyName);
});

test('production boundary names both permission rechecks and missing guarantees', () => {
  const boundary = read('docs/PROTOTYPE_VS_PRODUCTION.md');
  assert.match(boundary, /before retrieval/i);
  assert.match(boundary, /immediately before execution/i);
  assert.match(boundary, /not production.ready/i);
  assert.match(boundary, /durable.*idempotency/i);
  assert.match(boundary, /single shared-state writer/i);
});

test('testing guide separates local evidence from administrator actions', () => {
  const testing = read('docs/TESTING.md');
  assert.match(testing, /npm run check/);
  assert.match(testing, /80%/);
  assert.match(testing, /must be performed by.*administrator/i);
  assert.match(testing, /disabled transport.*not connected/i);
});

test('schema documentation records explicit outcomes and compatibility policy', () => {
  const contracts = read('docs/INTERACTION_SCHEMAS.md');
  for (const state of ['accepted', 'duplicate', 'rejected', 'unavailable']) {
    assert.match(contracts, new RegExp(`\`${state}\``));
  }
  assert.match(contracts, /event acceptance is not authorization/i);
  assert.match(contracts, /schema version/i);
});

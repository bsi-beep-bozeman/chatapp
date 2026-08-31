const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const schemaDirectory = path.join(root, 'schemas');
const names = [
  'intake-event.v1',
  'approval-decision.v1',
  'clarification-answer.v1',
  'delivery.v1',
  'ingestion-result.v1',
];

function readSchema(name) {
  return JSON.parse(fs.readFileSync(path.join(schemaDirectory, `${name}.schema.json`), 'utf8'));
}

for (const name of names) {
  test(`${name} is a closed draft-2020-12 schema`, () => {
    const schema = readSchema(name);
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.type, 'object');
    assert.equal(schema.additionalProperties, false);
    assert.ok(schema.required.includes('schemaVersion'));
    assert.equal(typeof schema.properties.schemaVersion.const, 'string');
    assert.equal(JSON.stringify(schema).includes('canExecute'), false);
    assert.equal(JSON.stringify(schema).includes('permissionFlags'), false);
  });
}

test('intake schema binds exact IDs, identity, source, purpose, hash, expiry, and idempotency', () => {
  const schema = readSchema('intake-event.v1');
  assert.equal(schema.properties.schemaVersion.const, 'ppd.cos.intake.v1');
  assert.deepEqual(schema.properties.eventType.enum, ['request.submitted', 'space.added', 'space.removed']);
  for (const field of [
    'eventId', 'eventUpdateId', 'requestId', 'correlationId', 'actor', 'source', 'purpose',
    'payload', 'payloadHash', 'createdAt', 'expiresAt', 'idempotencyKey', 'adapter',
  ]) assert.ok(schema.required.includes(field), field);
  assert.equal(schema.$defs.actor.additionalProperties, false);
  assert.equal(schema.$defs.source.additionalProperties, false);
  assert.equal(schema.properties.payload.oneOf.length, 2);
});

test('approval schema requires the five exact decisions and amendment-only fields', () => {
  const schema = readSchema('approval-decision.v1');
  assert.equal(schema.properties.schemaVersion.const, 'ppd.cos.approval-decision.v1');
  assert.deepEqual(schema.properties.decision.enum, ['approve', 'reject', 'amend', 'explain', 'remind_me']);
  assert.ok(schema.required.includes('expectedActionPayloadHash'));
  assert.ok(schema.required.includes('idempotencyKey'));
  assert.equal(schema.allOf[0].if.properties.decision.const, 'amend');
  assert.deepEqual(schema.allOf[0].then.required, ['amendment', 'amendmentHash']);
});

test('clarification and delivery schemas enforce bounded content and DM-sensitive delivery', () => {
  const clarification = readSchema('clarification-answer.v1');
  assert.equal(clarification.properties.payload.properties.answer.maxLength, 4096);
  assert.equal(clarification.properties.payload.additionalProperties, false);

  const delivery = readSchema('delivery.v1');
  assert.deepEqual(delivery.properties.sensitivity.enum, ['shared', 'personal', 'sensitive']);
  assert.equal(delivery.allOf[0].if.properties.sensitivity.const, 'sensitive');
  assert.equal(
    delivery.allOf[0].then.properties.destination.properties.spaceType.const,
    'DIRECT_MESSAGE'
  );
  assert.equal(delivery.properties.message.additionalProperties, false);
});

test('ingestion result schema exposes only the four explicit transport states', () => {
  const schema = readSchema('ingestion-result.v1');
  assert.deepEqual(schema.properties.state.enum, ['accepted', 'duplicate', 'rejected', 'unavailable']);
  assert.equal(schema.oneOf.length, 4);
  assert.deepEqual(schema.oneOf.map((branch) => branch.properties.state.const), [
    'accepted', 'duplicate', 'rejected', 'unavailable',
  ]);
  assert.ok(schema.oneOf[0].required.includes('receiptId'));
  assert.ok(schema.oneOf[2].required.includes('code'));
  assert.ok(schema.oneOf[3].required.includes('retryable'));
});

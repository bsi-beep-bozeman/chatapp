import assert from 'node:assert/strict';
import test from 'node:test';

import { loadConfig, validateConfig } from '../../src/config/config.js';

const localInput = {
  environment: 'development' as const,
  databaseUrl: 'postgresql://local-user:local-placeholder@127.0.0.1:55432/local-db',
  outboxTopic: 'cos-intake',
  secretProvider: 'mock' as const,
  registryProvider: 'mock' as const,
  queueProvider: 'mock' as const,
};

test('accepts bounded local configuration and freezes the result', () => {
  const config = validateConfig(localInput);
  assert.equal(config.databasePoolMax, 5);
  assert.equal(config.outboxBatchSize, 10);
  assert.equal(config.bodyMaxBytes, 32_768);
  assert.equal(Object.isFrozen(config), true);
});

test('production refuses every mock provider', () => {
  assert.throws(() => validateConfig({
    ...localInput,
    environment: 'production',
  }), /PRODUCTION_PROVIDER_INVALID/);

  assert.doesNotThrow(() => validateConfig({
    ...localInput,
    environment: 'production',
    secretProvider: 'secret_manager',
    registryProvider: 'access_registry',
    queueProvider: 'pubsub',
  }));
});

test('rejects missing required values and unsafe operational bounds', () => {
  assert.throws(() => validateConfig({ ...localInput, databaseUrl: '' }), /CONFIG_REQUIRED/);
  assert.throws(() => validateConfig({ ...localInput, outboxTopic: '' }), /CONFIG_REQUIRED/);
  for (const input of [
    { ...localInput, databasePoolMax: 0 },
    { ...localInput, databasePoolMax: 6 },
    { ...localInput, outboxBatchSize: 0 },
    { ...localInput, outboxBatchSize: 26 },
    { ...localInput, port: 0 },
    { ...localInput, port: 65_536 },
  ]) {
    assert.throws(() => validateConfig(input), /CONFIG_BOUNDS_INVALID/);
  }
});

test('loads named non-secret settings from the environment without defaults that enable production', () => {
  const config = loadConfig({
    NODE_ENV: 'development',
    DATABASE_URL: localInput.databaseUrl,
    PPD_OUTBOX_TOPIC: localInput.outboxTopic,
    PPD_SECRET_PROVIDER: 'mock',
    PPD_REGISTRY_PROVIDER: 'mock',
    PPD_QUEUE_PROVIDER: 'mock',
    PORT: '8081',
    PPD_DATABASE_POOL_MAX: '4',
    PPD_OUTBOX_BATCH_SIZE: '12',
  });
  assert.equal(config.port, 8081);
  assert.equal(config.databasePoolMax, 4);
  assert.equal(config.outboxBatchSize, 12);
});

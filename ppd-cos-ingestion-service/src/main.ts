import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { InMemorySecretProvider } from './auth/secret-provider.js';
import { createAppServer } from './app/server.js';
import { loadConfig } from './config/config.js';
import { createSchemaRegistry } from './contracts/schema-registry.js';
import { MockAccessRegistry } from './identity/access-registry.js';
import { MockIntakePolicy } from './identity/intake-policy.js';
import { IntakeService } from './ingress/intake-service.js';
import { PostgresIngressRepository } from './persistence/ingress-repository.js';
import { createPostgresPool, postgresReady } from './persistence/postgres.js';

export const SERVICE_NAME = 'ppd-cos-ingestion-service';

export async function start(): Promise<void> {
  const config = loadConfig(process.env);
  if (
    config.secretProvider !== 'mock'
    || config.registryProvider !== 'mock'
    || config.queueProvider !== 'mock'
  ) {
    throw new Error('PRODUCTION_INTEGRATIONS_NOT_IMPLEMENTED');
  }

  const localKeyId = process.env.PPD_LOCAL_HMAC_KEY_ID;
  const localKeyBase64 = process.env.PPD_LOCAL_HMAC_KEY_BASE64;
  const keys = new Map<string, Uint8Array>();
  if (localKeyId && localKeyBase64) {
    keys.set(localKeyId, Buffer.from(localKeyBase64, 'base64'));
  }

  const pool = createPostgresPool(config.databaseUrl, config.databasePoolMax);
  const intake = new IntakeService({
    secrets: new InMemorySecretProvider(keys),
    schemas: createSchemaRegistry(path.resolve(process.cwd(), 'schemas')),
    registry: new MockAccessRegistry(new Map()),
    policy: new MockIntakePolicy({ kind: 'deny', code: 'LOCAL_REGISTRY_REQUIRED' }),
    repository: new PostgresIngressRepository(pool),
    now: () => new Date(),
    topic: config.outboxTopic,
  });
  const server = createAppServer({ intake, ready: () => postgresReady(pool) });
  server.listen(config.port, '0.0.0.0');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void start().catch((error: unknown) => {
    const code = error instanceof Error && /^[A-Z][A-Z0-9_]{2,63}$/.test(error.message)
      ? error.message
      : 'STARTUP_FAILED';
    process.stderr.write(`${SERVICE_NAME}: ${code}\n`);
    process.exitCode = 1;
  });
}

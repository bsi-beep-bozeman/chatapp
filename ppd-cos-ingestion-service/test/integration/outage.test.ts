import assert from 'node:assert/strict';
import test from 'node:test';

import pg from 'pg';

import { InMemorySecretProvider } from '../../src/auth/secret-provider.js';
import { MockAccessRegistry } from '../../src/identity/access-registry.js';
import { MockIntakePolicy } from '../../src/identity/intake-policy.js';
import { IntakeService } from '../../src/ingress/intake-service.js';
import { PostgresIngressRepository } from '../../src/persistence/ingress-repository.js';
import { postgresReady } from '../../src/persistence/postgres.js';
import {
  fixtureKey,
  fixtureKeyId,
  fixtureNow,
  fixtureSchemas,
  signedRequest,
} from '../helpers/intake-fixture.js';

function unavailablePool(): pg.Pool {
  return new pg.Pool({
    connectionString: 'postgresql://synthetic:synthetic@127.0.0.1:1/synthetic',
    max: 1,
    connectionTimeoutMillis: 200,
  });
}

test('database outage reports not-ready and never claims durable acceptance', async () => {
  const pool = unavailablePool();
  try {
    assert.equal(await postgresReady(pool), false);
    const service = new IntakeService({
      secrets: new InMemorySecretProvider(new Map([[fixtureKeyId, fixtureKey]])),
      schemas: fixtureSchemas,
      registry: new MockAccessRegistry(new Map([[
        'users/123456789',
        {
          kind: 'mapped',
          subjectId: 'subject_test',
          canonicalEmail: 'person@example.com',
          policyVersion: 'registry_test_v1',
        },
      ]])),
      policy: new MockIntakePolicy({
        kind: 'allow',
        evaluationId: 'evaluation_test',
        policyVersion: 'policy_test_v1',
      }),
      repository: new PostgresIngressRepository(pool),
      now: () => fixtureNow,
      topic: 'cos-intake',
    });

    assert.deepEqual(await service.ingest(signedRequest()), {
      schemaVersion: 'ppd.cos.ingestion-result.v1',
      state: 'unavailable',
      code: 'DATABASE_UNAVAILABLE',
      retryable: true,
    });
  } finally {
    await pool.end();
  }
});

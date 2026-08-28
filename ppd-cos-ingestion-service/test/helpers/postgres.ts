import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import pg from 'pg';

const connectionString =
  process.env.PPD_TEST_DATABASE_URL
  ?? 'postgresql://ppd_cos_local:synthetic-local-only@127.0.0.1:55432/ppd_cos_local';

export async function withTestDatabase(
  run: (pool: pg.Pool) => Promise<void>,
): Promise<void> {
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    options: `-c search_path=${schema}`,
  });
  try {
    const migration = readFileSync(
      path.resolve(import.meta.dirname, '../../migrations/001_ingress_and_outbox.sql'),
      'utf8',
    );
    await pool.query(migration);
    await run(pool);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
}

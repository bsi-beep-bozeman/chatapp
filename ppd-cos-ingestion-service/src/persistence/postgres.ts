import pg from 'pg';

export function createPostgresPool(connectionString: string, max = 5): pg.Pool {
  if (!Number.isInteger(max) || max < 1 || max > 5) {
    throw new TypeError('DATABASE_POOL_BOUNDS_INVALID');
  }
  return new pg.Pool({
    connectionString,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: 'ppd-cos-ingestion-service',
  });
}

export async function postgresReady(pool: pg.Pool): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

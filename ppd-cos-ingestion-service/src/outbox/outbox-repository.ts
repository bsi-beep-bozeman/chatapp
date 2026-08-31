import type pg from 'pg';

export type DispatchItem = Readonly<{
  outboxId: string;
  receiptId: string;
  topic: string;
  body: Readonly<Record<string, unknown>>;
}>;

export interface OutboxRepository {
  claimBatch(workerId: string, limit: number, now: Date): Promise<DispatchItem[]>;
  markPublished(outboxId: string, workerId: string, now: Date): Promise<void>;
  markFailed(outboxId: string, workerId: string, code: string, now: Date): Promise<void>;
}

type OutboxRow = Readonly<{
  outbox_id: string;
  receipt_id: string;
  topic: string;
  delivery_envelope: Readonly<Record<string, unknown>>;
}>;

const MAX_ATTEMPTS = 5;

function validWorkerId(workerId: string): boolean {
  return /^[A-Za-z0-9._-]{1,128}$/.test(workerId);
}

export class PostgresOutboxRepository implements OutboxRepository {
  constructor(private readonly pool: pg.Pool) {}

  async claimBatch(workerId: string, limit: number, now: Date): Promise<DispatchItem[]> {
    if (!validWorkerId(workerId) || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new TypeError('OUTBOX_CLAIM_INVALID');
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<OutboxRow>({
        text: `
          WITH candidates AS (
            SELECT outbox_id
            FROM outbox_events
            WHERE (
              state = 'pending' AND available_at <= $1
            ) OR (
              state = 'claimed' AND lease_expires_at <= $1
            )
            ORDER BY created_at, outbox_id
            FOR UPDATE SKIP LOCKED
            LIMIT $2
          )
          UPDATE outbox_events AS target
          SET state = 'claimed',
              lease_owner = $3,
              lease_expires_at = $1::timestamptz + interval '60 seconds'
          FROM candidates
          WHERE target.outbox_id = candidates.outbox_id
          RETURNING target.outbox_id, target.receipt_id, target.topic,
                    target.delivery_envelope
        `,
        values: [now.toISOString(), limit, workerId],
      });
      await client.query('COMMIT');
      return result.rows.map((row) => Object.freeze({
        outboxId: row.outbox_id,
        receiptId: row.receipt_id,
        topic: row.topic,
        body: Object.freeze(row.delivery_envelope),
      }));
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original failure.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async markPublished(outboxId: string, workerId: string, now: Date): Promise<void> {
    if (!validWorkerId(workerId)) throw new TypeError('OUTBOX_LEASE_INVALID');
    const result = await this.pool.query({
      text: `
        UPDATE outbox_events
        SET state = 'published', published_at = $3,
            lease_owner = NULL, lease_expires_at = NULL,
            last_error_code = NULL
        WHERE outbox_id = $1 AND state = 'claimed' AND lease_owner = $2
      `,
      values: [outboxId, workerId, now.toISOString()],
    });
    if (result.rowCount !== 1) throw new Error('OUTBOX_LEASE_LOST');
  }

  async markFailed(outboxId: string, workerId: string, code: string, now: Date): Promise<void> {
    if (
      !validWorkerId(workerId)
      || !/^[A-Z][A-Z0-9_]{2,63}$/.test(code)
    ) {
      throw new TypeError('OUTBOX_FAILURE_INVALID');
    }
    const result = await this.pool.query({
      text: `
        UPDATE outbox_events
        SET attempt_count = attempt_count + 1,
            state = CASE
              WHEN attempt_count + 1 >= $5 THEN 'quarantined'
              ELSE 'pending'
            END,
            available_at = $4::timestamptz + make_interval(
              secs => LEAST(300, power(2, attempt_count)::integer)
            ),
            lease_owner = NULL,
            lease_expires_at = NULL,
            last_error_code = $3
        WHERE outbox_id = $1 AND state = 'claimed' AND lease_owner = $2
      `,
      values: [outboxId, workerId, code, now.toISOString(), MAX_ATTEMPTS],
    });
    if (result.rowCount !== 1) throw new Error('OUTBOX_LEASE_LOST');
  }
}

import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import type { AcceptOutcome, AcceptedEvent, IngressRepository } from './types.js';

type ExistingIngressRow = Readonly<{
  receipt_id: string;
  raw_body_hash: string;
  first_received_at: Date;
}>;

export class PostgresIngressRepository implements IngressRepository {
  constructor(private readonly pool: pg.Pool) {}

  async accept(event: AcceptedEvent): Promise<AcceptOutcome> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query<{ receipt_id: string }>({
        text: `
          INSERT INTO ingress_events (
            receipt_id, schema_version, event_type, envelope_id, request_id,
            correlation_id, idempotency_key, raw_body_hash, payload_hash,
            actor_chat_user_name, registry_subject_id, source_space_name,
            source_thread_name, source_message_name, source_space_type,
            source_channel, purpose, canonical_envelope, adapter_name,
            adapter_version, policy_version, policy_evaluation_id,
            event_created_at, event_expires_at, first_received_at
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9,
            $10, $11, $12,
            $13, $14, $15,
            $16, $17, $18, $19,
            $20, $21, $22,
            $23, $24, $25
          )
          ON CONFLICT (idempotency_key) DO NOTHING
          RETURNING receipt_id
        `,
        values: [
          event.receiptId,
          event.envelope.schemaVersion,
          event.envelope.eventType,
          event.envelopeId,
          event.envelope.requestId,
          event.envelope.correlationId,
          event.envelope.idempotencyKey,
          event.rawBodyHash,
          event.payloadHash,
          event.envelope.actor.chatUserName,
          event.registrySubjectId,
          event.envelope.source.spaceName,
          event.envelope.source.threadName,
          event.envelope.source.messageName,
          event.envelope.source.spaceType,
          event.envelope.source.channel,
          event.purpose,
          event.envelope,
          event.envelope.adapter.name,
          event.envelope.adapter.version,
          event.policyVersion,
          event.policyEvaluationId,
          event.envelope.createdAt,
          event.envelope.expiresAt,
          event.receivedAt,
        ],
      });

      if (inserted.rowCount === 1) {
        await client.query({
          text: `
            INSERT INTO outbox_events (
              outbox_id, receipt_id, topic, delivery_envelope,
              state, attempt_count, available_at, created_at
            ) VALUES ($1, $2, $3, $4, 'pending', 0, $5, $5)
          `,
          values: [
            randomUUID(),
            event.receiptId,
            event.topic,
            event.envelope,
            event.receivedAt,
          ],
        });
        await client.query('COMMIT');
        return Object.freeze({
          kind: 'accepted',
          receiptId: event.receiptId,
          receivedAt: event.receivedAt,
        });
      }

      const existing = await client.query<ExistingIngressRow>({
        text: `
          SELECT receipt_id, raw_body_hash, first_received_at
          FROM ingress_events
          WHERE idempotency_key = $1
        `,
        values: [event.envelope.idempotencyKey],
      });
      const row = existing.rows[0];
      if (!row) {
        throw new Error('IDEMPOTENCY_RECORD_UNAVAILABLE');
      }

      await client.query('COMMIT');
      if (row.raw_body_hash === event.rawBodyHash) {
        return Object.freeze({
          kind: 'duplicate',
          receiptId: row.receipt_id,
          firstReceivedAt: row.first_received_at.toISOString(),
        });
      }
      return Object.freeze({ kind: 'conflict' });
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original failure; the pool discards broken connections.
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

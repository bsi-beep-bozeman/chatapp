import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import type { SignedRequest } from '../auth/verify-adapter-request.js';
import { type IngestionResult, rejected, unavailable } from '../domain/ingestion-result.js';
import { noopLogger, type Logger } from '../telemetry/logger.js';

const INTAKE_PATH = '/v1/intake-events';
const MAX_BODY_BYTES = 32_768;

export interface IntakeHandler {
  ingest(request: SignedRequest): Promise<IngestionResult>;
}

export type ServerDependencies = Readonly<{
  intake: IntakeHandler;
  ready: () => Promise<boolean>;
  logger?: Logger;
}>;

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: Readonly<Record<string, unknown>>,
): void {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

function header(request: IncomingMessage, name: string): string {
  const value = request.headers[name];
  return typeof value === 'string' ? value : '';
}

function isJsonContentType(value: string): boolean {
  return /^application\/json(?:\s*;\s*charset=[A-Za-z0-9._-]+)?$/i.test(value);
}

async function readBoundedBody(request: IncomingMessage): Promise<Buffer | null> {
  const declaredLength = Number(header(request, 'content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    request.resume();
    return null;
  }

  const chunks: Buffer[] = [];
  let received = 0;
  let tooLarge = false;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    received += bytes.length;
    if (received > MAX_BODY_BYTES) {
      tooLarge = true;
      continue;
    }
    chunks.push(bytes);
  }
  return tooLarge ? null : Buffer.concat(chunks, received);
}

async function handleIntake(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ServerDependencies,
): Promise<void> {
  if (!isJsonContentType(header(request, 'content-type'))) {
    sendJson(response, 415, rejected('CONTENT_TYPE_INVALID'));
    return;
  }
  const rawBody = await readBoundedBody(request);
  if (!rawBody) {
    sendJson(response, 413, rejected('BODY_TOO_LARGE'));
    return;
  }

  const signedRequest: SignedRequest = {
    method: request.method ?? '',
    path: INTAKE_PATH,
    rawBody,
    headers: {
      keyId: header(request, 'x-ppd-key-id'),
      timestamp: header(request, 'x-ppd-timestamp'),
      idempotencyKey: header(request, 'idempotency-key'),
      signature: header(request, 'x-ppd-signature'),
    },
  };
  const startedAt = performance.now();
  let result: IngestionResult;
  try {
    result = await dependencies.intake.ingest(signedRequest);
  } catch {
    result = unavailable('SERVICE_UNAVAILABLE', true);
  }
  (dependencies.logger ?? noopLogger).info('intake.completed', {
    resultState: result.state,
    durationMs: Math.round(performance.now() - startedAt),
    ...('receiptId' in result ? { receiptId: result.receiptId } : {}),
    ...('code' in result ? { code: result.code } : {}),
  });
  sendJson(response, 200, result);
}

export function createAppServer(dependencies: ServerDependencies): Server {
  return createServer((request, response) => {
    void (async () => {
      if (request.method === 'POST' && request.url === INTAKE_PATH) {
        await handleIntake(request, response, dependencies);
        return;
      }
      if (request.method === 'GET' && request.url === '/health/live') {
        sendJson(response, 200, { status: 'ok' });
        return;
      }
      if (request.method === 'GET' && request.url === '/health/ready') {
        let ready = false;
        try {
          ready = await dependencies.ready();
        } catch {
          ready = false;
        }
        sendJson(response, ready ? 200 : 503, { status: ready ? 'ready' : 'unavailable' });
        return;
      }
      request.resume();
      sendJson(response, 404, { status: 'not_found' });
    })().catch(() => {
      if (!response.headersSent) {
        sendJson(response, 500, { status: 'unavailable' });
      } else {
        response.destroy();
      }
    });
  });
}

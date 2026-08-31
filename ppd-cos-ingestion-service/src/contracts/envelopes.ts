export type Actor = Readonly<{
  chatUserName: string;
  email: string | null;
  domainId: string | null;
  type: 'HUMAN';
  source: 'google_chat_interaction';
}>;

export type Source = Readonly<{
  platform: 'google_chat';
  spaceName: string;
  spaceType: 'DIRECT_MESSAGE' | 'SPACE' | 'GROUP_CHAT';
  channel: 'dm' | 'shared';
  threadName: string | null;
  messageName: string | null;
}>;

export type InboundSchemaVersion =
  | 'ppd.cos.intake.v1'
  | 'ppd.cos.clarification-answer.v1'
  | 'ppd.cos.approval-decision.v1';

export type ValidatedEnvelope = Readonly<Record<string, unknown> & {
  schemaVersion: InboundSchemaVersion;
  eventType: string;
  requestId: string;
  correlationId: string;
  actor: Actor;
  source: Source;
  createdAt: string;
  expiresAt: string;
  idempotencyKey: string;
  adapter: Readonly<{
    name: 'ppd-google-chat-cos-adapter';
    version: string;
  }>;
}>;

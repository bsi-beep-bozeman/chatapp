export type ServiceConfig = Readonly<{
  environment: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  databasePoolMax: number;
  outboxBatchSize: number;
  outboxTopic: string;
  bodyMaxBytes: 32_768;
  secretProvider: 'mock' | 'secret_manager';
  registryProvider: 'mock' | 'access_registry';
  queueProvider: 'mock' | 'pubsub';
}>;

export type ConfigInput = {
  [Key in keyof ServiceConfig]?: ServiceConfig[Key] | undefined;
};

type EnvironmentInput = Readonly<Record<string, string | undefined>>;

function integer(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

export function validateConfig(input: ConfigInput): ServiceConfig {
  const environment = input.environment ?? 'development';
  const secretProvider = input.secretProvider ?? 'mock';
  const registryProvider = input.registryProvider ?? 'mock';
  const queueProvider = input.queueProvider ?? 'mock';

  if (!['development', 'test', 'production'].includes(environment)) {
    throw new Error('CONFIG_VALUE_INVALID');
  }
  if (
    !['mock', 'secret_manager'].includes(secretProvider)
    || !['mock', 'access_registry'].includes(registryProvider)
    || !['mock', 'pubsub'].includes(queueProvider)
  ) {
    throw new Error('CONFIG_VALUE_INVALID');
  }
  if (
    environment === 'production'
    && (
      secretProvider !== 'secret_manager'
      || registryProvider !== 'access_registry'
      || queueProvider !== 'pubsub'
    )
  ) {
    throw new Error('PRODUCTION_PROVIDER_INVALID');
  }

  if (
    !input.databaseUrl
    || !/^postgres(?:ql)?:\/\//.test(input.databaseUrl)
    || !input.outboxTopic
    || !/^[A-Za-z0-9._-]{1,128}$/.test(input.outboxTopic)
  ) {
    throw new Error('CONFIG_REQUIRED');
  }
  const port = input.port ?? 8080;
  const databasePoolMax = input.databasePoolMax ?? 5;
  const outboxBatchSize = input.outboxBatchSize ?? 10;
  if (
    !Number.isInteger(port) || port < 1 || port > 65_535
    || !Number.isInteger(databasePoolMax) || databasePoolMax < 1 || databasePoolMax > 5
    || !Number.isInteger(outboxBatchSize) || outboxBatchSize < 1 || outboxBatchSize > 25
  ) {
    throw new Error('CONFIG_BOUNDS_INVALID');
  }

  return Object.freeze({
    environment,
    port,
    databaseUrl: input.databaseUrl,
    databasePoolMax,
    outboxBatchSize,
    outboxTopic: input.outboxTopic,
    bodyMaxBytes: 32_768,
    secretProvider,
    registryProvider,
    queueProvider,
  });
}

export function loadConfig(environment: EnvironmentInput): ServiceConfig {
  return validateConfig({
    environment: environment.NODE_ENV as ServiceConfig['environment'] | undefined,
    port: integer(environment.PORT),
    databaseUrl: environment.DATABASE_URL,
    databasePoolMax: integer(environment.PPD_DATABASE_POOL_MAX),
    outboxBatchSize: integer(environment.PPD_OUTBOX_BATCH_SIZE),
    outboxTopic: environment.PPD_OUTBOX_TOPIC,
    secretProvider: environment.PPD_SECRET_PROVIDER as ServiceConfig['secretProvider'] | undefined,
    registryProvider: environment.PPD_REGISTRY_PROVIDER as ServiceConfig['registryProvider'] | undefined,
    queueProvider: environment.PPD_QUEUE_PROVIDER as ServiceConfig['queueProvider'] | undefined,
  });
}

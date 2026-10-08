import { GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { parseTrustedProxies } from './trusted-proxies.js';
import type { AppConfig, DatabaseConfig } from './app-config.js';

const LOCAL_ENV = 'local';
const DEFAULT_PORT = 3333;
const DURATION_PATTERN = /^\d+(ms|s|m|h|d)?$/;
const MIN_JWT_SECRET_LENGTH = 32;
const NO_PUBLIC_ENDPOINT = 'default';
const OUTBOX_POLL_INTERVAL_MS = 1000;

export class ConfigLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigLoadError';
  }
}

interface AwsContext {
  appEnv: string;
  region: string;
  endpoint?: string;
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new ConfigLoadError(`Missing required environment variable ${name}`);
  }
  return value;
}

function awsContext(env: NodeJS.ProcessEnv): AwsContext {
  return {
    appEnv: requireEnv(env, 'APP_ENV'),
    region: requireEnv(env, 'AWS_REGION'),
    endpoint: env.AWS_ENDPOINT_URL?.trim() || undefined,
  };
}

async function loadParameters(
  client: SSMClient,
  path: string,
): Promise<Map<string, string>> {
  const values = new Map<string, string>();
  let nextToken: string | undefined;
  do {
    const page = await client.send(
      new GetParametersByPathCommand({
        Path: path,
        Recursive: true,
        NextToken: nextToken,
      }),
    );
    for (const param of page.Parameters ?? []) {
      if (param.Name && param.Value !== undefined) {
        values.set(param.Name.slice(path.length + 1), param.Value);
      }
    }
    nextToken = page.NextToken;
  } while (nextToken);
  return values;
}

async function loadSecret(
  client: SecretsManagerClient,
  secretId: string,
): Promise<string> {
  try {
    const result = await client.send(
      new GetSecretValueCommand({ SecretId: secretId }),
    );
    if (!result.SecretString) {
      throw new ConfigLoadError(`Secret ${secretId} has no string value`);
    }
    return result.SecretString;
  } catch (error) {
    if (error instanceof ConfigLoadError) throw error;
    const reason = error instanceof Error ? error.name : 'UnknownError';
    throw new ConfigLoadError(`Unable to read secret ${secretId} (${reason})`);
  }
}

function parseDatabaseSecret(raw: string, secretId: string): DatabaseConfig {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new ConfigLoadError(`Secret ${secretId} is not valid JSON`);
  }
  const missing = ['host', 'port', 'username', 'password', 'dbname'].filter(
    (key) => parsed[key] === undefined || parsed[key] === '',
  );
  if (missing.length > 0) {
    throw new ConfigLoadError(
      `Secret ${secretId} is missing keys: ${missing.join(', ')}`,
    );
  }
  const port = Number(parsed.port);
  if (!Number.isInteger(port) || port <= 0) {
    throw new ConfigLoadError(`Secret ${secretId} has an invalid port`);
  }
  return {
    host: String(parsed.host),
    port,
    username: String(parsed.username),
    password: String(parsed.password),
    dbname: String(parsed.dbname),
  };
}

/**
 * DATABASE_HOST / DATABASE_PORT let a backend running on the host reach the
 * compose Postgres, whose secret points to the `postgres` service name.
 */
function localDatabaseOverride(
  appEnv: string,
  env: NodeJS.ProcessEnv,
): Partial<Pick<DatabaseConfig, 'host' | 'port'>> {
  const host = env.DATABASE_HOST?.trim();
  const port = env.DATABASE_PORT?.trim();
  if (!host && !port) return {};
  if (appEnv !== LOCAL_ENV) {
    throw new ConfigLoadError(
      `DATABASE_HOST/DATABASE_PORT overrides are only allowed when APP_ENV=${LOCAL_ENV}`,
    );
  }
  const override: Partial<Pick<DatabaseConfig, 'host' | 'port'>> = {};
  if (host) override.host = host;
  if (port) {
    const parsedPort = Number(port);
    if (!Number.isInteger(parsedPort) || parsedPort <= 0) {
      throw new ConfigLoadError('DATABASE_PORT must be a positive integer');
    }
    override.port = parsedPort;
  }
  return override;
}

export async function loadDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<DatabaseConfig> {
  const ctx = awsContext(env);
  const override = localDatabaseOverride(ctx.appEnv, env);
  const client = new SecretsManagerClient({
    region: ctx.region,
    endpoint: ctx.endpoint,
  });
  try {
    const secretId = `order-platform/${ctx.appEnv}/database`;
    const db = parseDatabaseSecret(
      await loadSecret(client, secretId),
      secretId,
    );
    return { ...db, ...override };
  } finally {
    client.destroy();
  }
}

export async function loadAppConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<AppConfig> {
  const ctx = awsContext(env);
  localDatabaseOverride(ctx.appEnv, env);
  const ssm = new SSMClient({ region: ctx.region, endpoint: ctx.endpoint });
  const secrets = new SecretsManagerClient({
    region: ctx.region,
    endpoint: ctx.endpoint,
  });

  try {
    const prefix = `/order-platform/${ctx.appEnv}`;
    const [shared, backend, jwtSecret, database] = await Promise.all([
      loadParameters(ssm, `${prefix}/shared`),
      loadParameters(ssm, `${prefix}/backend`),
      loadSecret(secrets, `order-platform/${ctx.appEnv}/backend/jwt-secret`),
      loadDatabaseConfig(env),
    ]);

    const missing: string[] = [];
    const param = (values: Map<string, string>, scope: string, key: string) => {
      const value = values.get(key)?.trim();
      if (!value) missing.push(`${prefix}/${scope}/${key}`);
      return value ?? '';
    };

    const trustedProxies = parseTrustedProxies(
      param(backend, 'backend', 'trusted-proxies'),
    );
    const s3PublicEndpoint = param(shared, 'shared', 's3-public-endpoint');
    const config: AppConfig = {
      env: ctx.appEnv,
      port: Number(env.PORT ?? DEFAULT_PORT),
      database,
      jwt: {
        secret: jwtSecret,
        expiresIn: param(backend, 'backend', 'jwt-expires-in'),
      },
      rateLimit: {
        ttlSeconds: Number(param(backend, 'backend', 'rate-limit-ttl-seconds')),
        max: Number(param(backend, 'backend', 'rate-limit-max')),
        authMax: Number(param(backend, 'backend', 'auth-rate-limit-max')),
      },
      trustedProxies: trustedProxies ?? [],
      outbox: { pollIntervalMs: OUTBOX_POLL_INTERVAL_MS },
      aws: {
        region: ctx.region,
        endpoint: ctx.endpoint,
        s3Bucket: param(shared, 'shared', 's3-bucket'),
        s3PublicEndpoint:
          s3PublicEndpoint === NO_PUBLIC_ENDPOINT
            ? undefined
            : s3PublicEndpoint,
        s3ProductImagePrefix: param(
          shared,
          'shared',
          's3-product-image-prefix',
        ),
        s3ThumbnailPrefix: param(shared, 'shared', 's3-thumbnail-prefix'),
        s3InvoicePrefix: param(shared, 'shared', 's3-invoice-prefix'),
        sqsOrdersQueue: param(shared, 'shared', 'sqs-orders-queue'),
        dynamoCartsTable: param(shared, 'shared', 'dynamo-carts-table'),
        dynamoProductCacheTable: param(
          shared,
          'shared',
          'dynamo-product-cache-table',
        ),
      },
    };

    if (missing.length > 0) {
      throw new ConfigLoadError(
        `Missing SSM parameters: ${missing.join(', ')}`,
      );
    }
    if (config.jwt.secret.length < MIN_JWT_SECRET_LENGTH) {
      throw new ConfigLoadError(
        `JWT secret must be at least ${MIN_JWT_SECRET_LENGTH} characters long`,
      );
    }
    if (!DURATION_PATTERN.test(config.jwt.expiresIn)) {
      throw new ConfigLoadError(
        `${prefix}/backend/jwt-expires-in must look like 900, 15m or 1h`,
      );
    }
    for (const [key, value] of [
      ['rate-limit-ttl-seconds', config.rateLimit.ttlSeconds],
      ['rate-limit-max', config.rateLimit.max],
      ['auth-rate-limit-max', config.rateLimit.authMax],
    ] as const) {
      if (!Number.isInteger(value) || value <= 0) {
        throw new ConfigLoadError(
          `${prefix}/backend/${key} must be a positive integer`,
        );
      }
    }
    if (
      config.aws.s3PublicEndpoint !== undefined &&
      !isHttpUrl(config.aws.s3PublicEndpoint)
    ) {
      throw new ConfigLoadError(
        `${prefix}/shared/s3-public-endpoint must be "${NO_PUBLIC_ENDPOINT}" or an http(s) URL`,
      );
    }
    for (const [key, value] of [
      ['s3-product-image-prefix', config.aws.s3ProductImagePrefix],
      ['s3-thumbnail-prefix', config.aws.s3ThumbnailPrefix],
    ] as const) {
      if (!value.endsWith('/')) {
        throw new ConfigLoadError(`${prefix}/shared/${key} must end with "/"`);
      }
    }
    const { s3ProductImagePrefix: images, s3ThumbnailPrefix: thumbs } =
      config.aws;
    if (images.startsWith(thumbs) || thumbs.startsWith(images)) {
      throw new ConfigLoadError(
        `${prefix}/shared/s3-product-image-prefix and s3-thumbnail-prefix must not overlap, or the thumbnail Lambda would reprocess its own output`,
      );
    }
    if (trustedProxies === null) {
      throw new ConfigLoadError(
        `${prefix}/backend/trusted-proxies must be "none" or a comma-separated list of IPs, CIDR ranges, loopback, linklocal or uniquelocal`,
      );
    }
    if (!Number.isInteger(config.port) || config.port <= 0) {
      throw new ConfigLoadError('PORT must be a positive integer');
    }
    return config;
  } finally {
    ssm.destroy();
    secrets.destroy();
  }
}

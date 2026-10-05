import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm';
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { loadAppConfig } from './aws-config.loader.js';

const baseEnv = {
  APP_ENV: 'local',
  AWS_REGION: 'us-east-1',
  AWS_ENDPOINT_URL: 'http://localhost:4566',
};

const sharedParams: Record<string, string> = {
  's3-bucket': 'orders-platform',
  's3-product-image-prefix': 'products/',
  's3-thumbnail-prefix': 'thumbnails/',
  's3-public-endpoint': 'http://localhost:4566',
  's3-invoice-prefix': 'invoices/',
  'sqs-orders-queue': 'orders-queue',
  'dynamo-carts-table': 'carts',
  'dynamo-stock-cache-table': 'stock_cache',
};

const backendParams: Record<string, string> = {
  'jwt-expires-in': '1h',
  'rate-limit-ttl-seconds': '60',
  'rate-limit-max': '100',
  'auth-rate-limit-max': '10',
  'trusted-proxies': 'loopback, 10.0.0.0/8',
};

const secrets: Record<string, string> = {
  'order-platform/local/database': JSON.stringify({
    engine: 'postgres',
    host: 'postgres',
    port: 5432,
    username: 'orders',
    password: 'p@ss/word',
    dbname: 'orders',
  }),
  'order-platform/local/backend/jwt-secret': 'x'.repeat(48),
};

function mockAws(
  params: {
    shared?: Record<string, string>;
    backend?: Record<string, string>;
  } = {},
) {
  const shared = params.shared ?? sharedParams;
  const backend = params.backend ?? backendParams;

  vi.spyOn(SSMClient.prototype, 'send').mockImplementation(((
    command: GetParametersByPathCommand,
  ) => {
    const path = command.input.Path!;
    const values = path.endsWith('/shared') ? shared : backend;
    return Promise.resolve({
      Parameters: Object.entries(values).map(([key, value]) => ({
        Name: `${path}/${key}`,
        Value: value,
      })),
    });
  }) as never);

  vi.spyOn(SecretsManagerClient.prototype, 'send').mockImplementation(((
    command: GetSecretValueCommand,
  ) => {
    const value = secrets[command.input.SecretId!];
    if (value === undefined) {
      const error = new Error('not found');
      error.name = 'ResourceNotFoundException';
      return Promise.reject(error);
    }
    return Promise.resolve({ SecretString: value });
  }) as never);
}

describe('loadAppConfig', () => {
  afterEach(() => vi.restoreAllMocks());

  it('builds the typed config from SSM and Secrets Manager', async () => {
    mockAws();
    const config = await loadAppConfig({ ...baseEnv });

    expect(config.env).toBe('local');
    expect(config.port).toBe(3333);
    expect(config.jwt).toEqual({ secret: 'x'.repeat(48), expiresIn: '1h' });
    expect(config.database).toMatchObject({ host: 'postgres', port: 5432 });
    expect(config.aws.sqsOrdersQueue).toBe('orders-queue');
    expect(config.rateLimit).toEqual({ ttlSeconds: 60, max: 100, authMax: 10 });
    expect(config.trustedProxies).toEqual(['loopback', '10.0.0.0/8']);
    expect(config.aws).toMatchObject({
      region: 'us-east-1',
      endpoint: 'http://localhost:4566',
      s3PublicEndpoint: 'http://localhost:4566',
      s3ThumbnailPrefix: 'thumbnails/',
    });
  });

  it('uses the AWS default public endpoint when set to "default"', async () => {
    mockAws({ shared: { ...sharedParams, 's3-public-endpoint': 'default' } });
    const config = await loadAppConfig({ ...baseEnv });
    expect(config.aws.s3PublicEndpoint).toBeUndefined();
  });

  it('rejects a public endpoint that is not an http(s) URL', async () => {
    mockAws({ shared: { ...sharedParams, 's3-public-endpoint': 'localhost' } });
    await expect(loadAppConfig({ ...baseEnv })).rejects.toThrow(
      /s3-public-endpoint must be "default" or an http\(s\) URL/,
    );
  });

  it('rejects overlapping image and thumbnail prefixes', async () => {
    mockAws({
      shared: { ...sharedParams, 's3-thumbnail-prefix': 'products/thumbs/' },
    });
    await expect(loadAppConfig({ ...baseEnv })).rejects.toThrow(
      /must not overlap/,
    );
  });

  it('trusts no proxy when trusted-proxies is "none"', async () => {
    mockAws({ backend: { ...backendParams, 'trusted-proxies': 'none' } });
    const config = await loadAppConfig({ ...baseEnv });
    expect(config.trustedProxies).toEqual([]);
  });

  it.each(['everyone', '10.0.0.0/33', '10.0.0.1,', '*'])(
    'rejects an invalid trusted-proxies value (%s)',
    async (value) => {
      mockAws({ backend: { ...backendParams, 'trusted-proxies': value } });
      await expect(loadAppConfig({ ...baseEnv })).rejects.toThrow(
        /trusted-proxies must be "none" or a comma-separated list/,
      );
    },
  );

  it('rejects a non-numeric rate limit', async () => {
    mockAws({ backend: { ...backendParams, 'rate-limit-max': 'lots' } });
    await expect(loadAppConfig({ ...baseEnv })).rejects.toThrow(
      /rate-limit-max must be a positive integer/,
    );
  });

  it('lists every missing parameter without values', async () => {
    mockAws({ shared: { 's3-bucket': 'orders-platform' }, backend: {} });

    await expect(loadAppConfig({ ...baseEnv })).rejects.toThrow(
      /Missing SSM parameters: .*\/backend\/jwt-expires-in.*\/shared\/sqs-orders-queue/,
    );
  });

  it('fails when a secret is missing, without leaking other values', async () => {
    mockAws();
    const promise = loadAppConfig({ ...baseEnv, APP_ENV: 'staging' });

    await expect(promise).rejects.toThrow(
      'Unable to read secret order-platform/staging/backend/jwt-secret (ResourceNotFoundException)',
    );
  });

  it('applies DATABASE_HOST/DATABASE_PORT only when APP_ENV=local', async () => {
    mockAws();
    const local = await loadAppConfig({
      ...baseEnv,
      DATABASE_HOST: 'localhost',
      DATABASE_PORT: '15432',
    });
    expect(local.database).toMatchObject({ host: 'localhost', port: 15432 });
  });

  it('rejects the database override outside local', async () => {
    mockAws();
    await expect(
      loadAppConfig({
        ...baseEnv,
        APP_ENV: 'prod',
        DATABASE_HOST: 'localhost',
      }),
    ).rejects.toThrow(/only allowed when APP_ENV=local/);
  });

  it('rejects an invalid jwt-expires-in', async () => {
    mockAws({ backend: { ...backendParams, 'jwt-expires-in': 'one hour' } });
    await expect(loadAppConfig({ ...baseEnv })).rejects.toThrow(
      /jwt-expires-in must look like/,
    );
  });

  it('requires APP_ENV', async () => {
    await expect(loadAppConfig({ AWS_REGION: 'us-east-1' })).rejects.toThrow(
      'Missing required environment variable APP_ENV',
    );
  });
});

export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  dbname: string;
}

export interface AppConfig {
  env: string;
  port: number;
  database: DatabaseConfig;
  jwt: {
    secret: string;
    expiresIn: string;
  };
  rateLimit: {
    ttlSeconds: number;
    /** Requests per window, per client IP and route. */
    max: number;
    /** Stricter limit for login and registration, per client IP and per email. */
    authMax: number;
  };
  /** Proxies allowed to set X-Forwarded-For (Express `trust proxy`); empty trusts none. */
  trustedProxies: string[];
  aws: {
    s3Bucket: string;
    s3ProductImagePrefix: string;
    s3InvoicePrefix: string;
    sqsOrdersQueue: string;
    dynamoCartsTable: string;
    dynamoStockCacheTable: string;
  };
}

export function buildDatabaseUrl(db: DatabaseConfig): string {
  const user = encodeURIComponent(db.username);
  const password = encodeURIComponent(db.password);
  const name = encodeURIComponent(db.dbname);
  return `postgresql://${user}:${password}@${db.host}:${db.port}/${name}`;
}

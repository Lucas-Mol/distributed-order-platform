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
    /** Stricter per-IP limit for login and registration. */
    authMax: number;
  };
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

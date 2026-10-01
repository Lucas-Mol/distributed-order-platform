/**
 * Runs a command with DATABASE_URL built from the `database` secret, so the
 * Prisma CLI (migrate, seed) never depends on a URL stored in a file.
 * Usage: tsx scripts/with-database-url.ts <command> [args...]
 */
import { spawn } from 'node:child_process';
import { buildDatabaseUrl } from '../src/config/app-config.js';
import { loadDatabaseConfig } from '../src/config/aws-config.loader.js';

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('Usage: tsx scripts/with-database-url.ts <command> [args...]');
  process.exit(1);
}

try {
  const databaseUrl = buildDatabaseUrl(await loadDatabaseConfig());
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  child.on('error', (error) => {
    console.error(`Failed to start ${command}: ${error.message}`);
    process.exit(1);
  });
  child.on('exit', (code, signal) => {
    process.exit(signal ? 1 : (code ?? 1));
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

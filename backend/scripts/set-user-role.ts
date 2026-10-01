/**
 * Sets a user's role from the command line; this is how the first ADMIN is
 * created, since no default admin credentials exist.
 * Usage: npm run user:set-role -- <email> <CUSTOMER|MANAGER|ADMIN>
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role } from '../src/generated/prisma/client.js';

const [rawEmail, rawRole] = process.argv.slice(2);
const roles = Object.values(Role);

if (!rawEmail || !roles.includes(rawRole as Role)) {
  console.error(`Usage: npm run user:set-role -- <email> <${roles.join('|')}>`);
  process.exit(1);
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set; run through `npm run user:set-role`');
  process.exit(1);
}

const email = rawEmail.trim().toLowerCase();
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

try {
  const { count } = await prisma.user.updateMany({
    where: { email },
    data: { role: rawRole as Role },
  });
  if (count === 0) {
    console.error(`No user registered with e-mail ${email}`);
    process.exitCode = 1;
  } else {
    console.log(`[set-user-role] ${email} is now ${rawRole}`);
  }
} catch (error) {
  console.error(
    '[set-user-role] failed:',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

import 'server-only';
import { isIP } from 'node:net';
import { headers } from 'next/headers';

function trustedProxyHops(): number {
  const hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 0);
  if (!Number.isInteger(hops) || hops < 0) {
    throw new Error('TRUSTED_PROXY_HOPS must be a non-negative integer');
  }
  return hops;
}

export async function getClientIp(): Promise<string | null> {
  const forwardedFor = (await headers()).get('x-forwarded-for');
  if (!forwardedFor) {
    return null;
  }
  const chain = forwardedFor.split(',').map((entry) => entry.trim());
  const candidate = chain[chain.length - Math.max(trustedProxyHops(), 1)];
  return candidate && isIP(candidate) ? candidate : null;
}

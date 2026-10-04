import { isIP } from 'node:net';

const NO_PROXIES = 'none';
const PRESETS = new Set(['loopback', 'linklocal', 'uniquelocal']);

function isValidEntry(entry: string): boolean {
  if (PRESETS.has(entry)) return true;
  const [address, prefix, ...rest] = entry.split('/');
  const version = isIP(address);
  if (version === 0 || rest.length > 0) return false;
  if (prefix === undefined) return true;
  const bits = Number(prefix);
  return /^\d+$/.test(prefix) && bits <= (version === 4 ? 32 : 128);
}

export function parseTrustedProxies(raw: string): string[] | null {
  const value = raw.trim();
  if (value === NO_PROXIES) return [];
  const entries = value.split(',').map((entry) => entry.trim());
  return entries.length > 0 && entries.every(isValidEntry) ? entries : null;
}

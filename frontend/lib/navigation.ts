const INTERNAL_ORIGIN = 'http://internal.invalid';

export function safeNextPath(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string' || !value.startsWith('/')) {
    return fallback;
  }
  let url: URL;
  try {
    url = new URL(value, INTERNAL_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== INTERNAL_ORIGIN) {
    return fallback;
  }
  const path = `${url.pathname}${url.search}${url.hash}`;
  return path.startsWith('//') ? fallback : path;
}

export function loginPath(next: string, expired = false): string {
  const params = new URLSearchParams({ next });
  if (expired) {
    params.set('expired', '1');
  }
  return `/login?${params.toString()}`;
}

export function searchFromParam(
  value: string | string[] | undefined,
  maxLength: number,
): string {
  const search = (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
  return search.slice(0, maxLength);
}

export function pageFromSearchParam(value: string | string[] | undefined): number {
  const page = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

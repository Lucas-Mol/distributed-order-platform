import 'server-only';
import { cookies } from 'next/headers';
import { isTokenActive, readTokenClaims, type TokenClaims } from './jwt';
import { SESSION_COOKIE } from './session-cookie';

export async function getToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value;
}

export async function getSession(): Promise<TokenClaims | null> {
  const claims = readTokenClaims(await getToken());
  return isTokenActive(claims) ? claims : null;
}

export async function setSessionCookie(token: string): Promise<void> {
  const claims = readTokenClaims(token);
  if (!claims) {
    throw new Error('Backend returned an unreadable access token');
  }
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(claims.exp * 1000),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

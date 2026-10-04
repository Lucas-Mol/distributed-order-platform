export interface TokenClaims {
  sub: string;
  email: string;
  exp: number;
}

export function readTokenClaims(token: string | undefined): TokenClaims | null {
  if (!token) {
    return null;
  }
  const [, payload] = token.split('.');
  if (!payload) {
    return null;
  }
  try {
    const claims: unknown = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    );
    if (
      typeof claims !== 'object' ||
      claims === null ||
      typeof (claims as TokenClaims).sub !== 'string' ||
      typeof (claims as TokenClaims).email !== 'string' ||
      typeof (claims as TokenClaims).exp !== 'number'
    ) {
      return null;
    }
    return claims as TokenClaims;
  } catch {
    return null;
  }
}

export function isTokenActive(claims: TokenClaims | null): boolean {
  return claims !== null && claims.exp * 1000 > Date.now();
}

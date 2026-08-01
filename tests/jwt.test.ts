import { describe, it, expect } from 'vitest';
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from '../src/modules/auth/jwt';
import { UnauthorizedError } from '../src/utils/errors';

describe('JWT tokens', () => {
  it('signs and verifies an access token with claims', () => {
    const token = signAccessToken('user-1', 'wallet-abc', 'session-9');
    const claims = verifyAccessToken(token);
    expect(claims.sub).toBe('user-1');
    expect(claims.wallet).toBe('wallet-abc');
    expect(claims.sessionId).toBe('session-9');
    expect(claims.type).toBe('access');
  });

  it('signs and verifies a refresh token', () => {
    const token = signRefreshToken('user-1', 'session-9');
    const claims = verifyRefreshToken(token);
    expect(claims.sub).toBe('user-1');
    expect(claims.sessionId).toBe('session-9');
    expect(claims.type).toBe('refresh');
  });

  it('rejects a tampered access token', () => {
    const token = signAccessToken('user-1', 'wallet-abc', 'session-9');
    const tampered = `${token.slice(0, -3)}abc`;
    expect(() => verifyAccessToken(tampered)).toThrow(UnauthorizedError);
  });

  it('rejects a refresh token used as an access token', () => {
    const refresh = signRefreshToken('user-1', 'session-9');
    expect(() => verifyAccessToken(refresh)).toThrow(UnauthorizedError);
  });

  it('rejects an access token used as a refresh token', () => {
    const access = signAccessToken('user-1', 'wallet-abc', 'session-9');
    expect(() => verifyRefreshToken(access)).toThrow(UnauthorizedError);
  });
});

import jwt from 'jsonwebtoken';
import { config } from '../../config/env';
import { UnauthorizedError } from '../../utils/errors';

export interface AccessTokenClaims {
  sub: string;
  wallet: string;
  type: 'access';
  sessionId: string;
}

export interface RefreshTokenClaims {
  sub: string;
  type: 'refresh';
  sessionId: string;
}

export function signAccessToken(userId: string, wallet: string, sessionId: string): string {
  return jwt.sign(
    { wallet, type: 'access', sessionId },
    config.jwt.accessSecret,
    {
      subject: userId,
      expiresIn: config.jwt.accessTtl as jwt.SignOptions['expiresIn'],
    },
  );
}

export function signRefreshToken(userId: string, sessionId: string): string {
  return jwt.sign({ type: 'refresh', sessionId }, config.jwt.refreshSecret, {
    subject: userId,
    expiresIn: `${config.jwt.refreshTtlDays}d`,
  });
}

function isClaims<T>(decoded: string | jwt.JwtPayload, expectedType: string): decoded is jwt.JwtPayload & T {
  return typeof decoded !== 'string' && decoded.type === expectedType && typeof decoded.sub === 'string';
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  try {
    const decoded = jwt.verify(token, config.jwt.accessSecret);
    if (!isClaims<AccessTokenClaims>(decoded, 'access')) {
      throw new UnauthorizedError('INVALID_TOKEN', 'Invalid access token');
    }
    return {
      sub: decoded.sub,
      wallet: decoded.wallet as string,
      type: 'access',
      sessionId: decoded.sessionId as string,
    };
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError('INVALID_TOKEN', 'Invalid or expired access token');
  }
}

export function verifyRefreshToken(token: string): RefreshTokenClaims {
  try {
    const decoded = jwt.verify(token, config.jwt.refreshSecret);
    if (!isClaims<RefreshTokenClaims>(decoded, 'refresh')) {
      throw new UnauthorizedError('INVALID_REFRESH_TOKEN', 'Invalid refresh token');
    }
    return {
      sub: decoded.sub,
      type: 'refresh',
      sessionId: decoded.sessionId as string,
    };
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError('INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token');
  }
}

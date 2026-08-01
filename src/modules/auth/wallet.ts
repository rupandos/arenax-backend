import { createHash, verify as cryptoVerify } from 'crypto';
import { AppError } from '../../utils/errors';

export const WALLET_LOGIN_MESSAGE =
  'ArenaX wants you to sign in with your wallet.\n\nNonce: {nonce}\n\nThis signature will not trigger any blockchain transaction.';

export function buildSignMessage(nonce: string): string {
  return WALLET_LOGIN_MESSAGE.replace('{nonce}', nonce);
}

export function normalizeWalletAddress(address: string): string {
  return address.trim().toLowerCase();
}

export function isValidWalletAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address.trim());
}

/**
 * Verifies an Ed25519 (Solana-style) signature over the sign-in message.
 * The signature is expected as a base64-encoded 64-byte value.
 */
export function verifyEd25519Signature(
  publicKey: string,
  message: string,
  signature: string,
): boolean {
  const decodedPublicKey = Buffer.from(publicKey, 'base64');
  const decodedSignature = Buffer.from(signature, 'base64');

  if (decodedPublicKey.length !== 32) {
    throw new AppError(400, 'INVALID_PUBLIC_KEY', 'Public key must decode to 32 bytes');
  }
  if (decodedSignature.length !== 64) {
    throw new AppError(400, 'INVALID_SIGNATURE', 'Signature must decode to 64 bytes');
  }

  return cryptoVerify(null, Buffer.from(message, 'utf8'), decodedPublicKey, decodedSignature);
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateNonce(): string {
  return createHash('sha256').update(`${Date.now()}:${Math.random()}`).digest('hex').slice(0, 32);
}

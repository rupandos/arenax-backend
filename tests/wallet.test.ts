import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, sign } from 'crypto';
import {
  buildSignMessage,
  normalizeWalletAddress,
  isValidWalletAddress,
  verifyEd25519Signature,
  generateNonce,
  hashRefreshToken,
} from '../src/modules/auth/wallet';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const publicKeyBase64 = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64');

function signMessage(message: string): string {
  return sign(null, Buffer.from(message), privateKey).toString('base64');
}

describe('wallet utilities', () => {
  describe('buildSignMessage', () => {
    it('embeds the nonce in the sign-in message', () => {
      const message = buildSignMessage('nonce-123');
      expect(message).toContain('nonce-123');
      expect(message).toContain('ArenaX');
    });
  });

  describe('wallet address handling', () => {
    it('normalizes to lowercase', () => {
      expect(normalizeWalletAddress('ABC123')).toBe('abc123');
    });

    it('validates base58-length wallet addresses', () => {
      expect(isValidWalletAddress('GXtestVallLet1111111111111111111111111111')).toBe(true);
      expect(isValidWalletAddress('0x123')).toBe(false);
      expect(isValidWalletAddress('')).toBe(false);
    });
  });

  describe('verifyEd25519Signature', () => {
    it('accepts a valid signature over the sign message', () => {
      const nonce = generateNonce();
      const message = buildSignMessage(nonce);
      const signature = signMessage(message);
      expect(verifyEd25519Signature(publicKeyBase64, message, signature)).toBe(true);
    });

    it('rejects a signature over a different message', () => {
      const signature = signMessage('some other message');
      expect(verifyEd25519Signature(publicKeyBase64, buildSignMessage('nonce-x'), signature)).toBe(false);
    });

    it('rejects a corrupted signature', () => {
      const signature = signMessage(buildSignMessage('nonce-x'));
      const corrupted = Buffer.from(signature, 'base64').subarray(0, 60).toString('base64');
      expect(verifyEd25519Signature(publicKeyBase64, buildSignMessage('nonce-x'), corrupted)).toBe(false);
    });

    it('throws on malformed keys', () => {
      expect(() =>
        verifyEd25519Signature('c2hvcnQ=', buildSignMessage('nonce-x'), 'c2ln'),
      ).toThrow();
    });
  });

  describe('generateNonce / hashRefreshToken', () => {
    it('generates unique nonces', () => {
      expect(generateNonce()).not.toBe(generateNonce());
    });

    it('hashes refresh tokens deterministically', () => {
      expect(hashRefreshToken('token')).toBe(hashRefreshToken('token'));
      expect(hashRefreshToken('token')).not.toBe(hashRefreshToken('other'));
    });
  });
});

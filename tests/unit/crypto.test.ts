import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '@/lib/crypto';

describe('encrypt / decrypt', () => {
  it('round-trips a simple string', () => {
    const original = 'hello world';
    const encrypted = encrypt(original);
    expect(encrypted).not.toBe(original);
    expect(decrypt(encrypted)).toBe(original);
  });

  it('round-trips an empty string', () => {
    const encrypted = encrypt('');
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe('');
  });

  it('round-trips special characters', () => {
    const original = '!@#$%^&*()_+-={}[]|\\:";\'<>?,./~`';
    expect(decrypt(encrypt(original))).toBe(original);
  });

  it('round-trips unicode characters', () => {
    const original = '日本語テスト 🚀🎉';
    expect(decrypt(encrypt(original))).toBe(original);
  });

  it('produces different ciphertexts for different inputs', () => {
    const a = encrypt('alpha');
    const b = encrypt('beta');
    expect(a).not.toBe(b);
  });

  it('produces different ciphertexts for the same input (random IV)', () => {
    const a = encrypt('same');
    const b = encrypt('same');
    // AES with CryptoJS uses random salt, so ciphertexts should differ
    expect(a).not.toBe(b);
  });

  it('decrypting garbage returns empty string', () => {
    const result = decrypt('not-a-valid-ciphertext');
    // CryptoJS returns empty string for invalid decryption
    expect(result).toBe('');
  });
});

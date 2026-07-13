import "server-only";

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_OPTIONS = {
  N: SCRYPT_COST,
  r: SCRYPT_BLOCK_SIZE,
  p: SCRYPT_PARALLELIZATION,
  maxmem: 64 * 1024 * 1024,
};

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEY_LENGTH, SCRYPT_OPTIONS).toString("hex");
  return `scrypt$v1$${SCRYPT_COST}$${SCRYPT_BLOCK_SIZE}$${SCRYPT_PARALLELIZATION}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  if (!stored.startsWith("scrypt$")) {
    const actual = Buffer.from(password);
    const expected = Buffer.from(stored);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  const parts = stored.split("$");
  const versioned = parts[1] === "v1";
  const salt = versioned ? parts[5] : parts[1];
  const expected = versioned ? parts[6] : parts[2];
  if (!salt || !expected) return false;
  if (versioned && (Number(parts[2]) !== SCRYPT_COST || Number(parts[3]) !== SCRYPT_BLOCK_SIZE || Number(parts[4]) !== SCRYPT_PARALLELIZATION)) return false;
  const actual = scryptSync(password, salt, SCRYPT_KEY_LENGTH, SCRYPT_OPTIONS);
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

export function needsPasswordRehash(stored: string) {
  return !stored.startsWith(`scrypt$v1$${SCRYPT_COST}$${SCRYPT_BLOCK_SIZE}$${SCRYPT_PARALLELIZATION}$`);
}

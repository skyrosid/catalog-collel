import { argon2id, hash, verify } from 'argon2';

// OWASP Argon2id minimum: 19 MiB, two iterations, one lane.
export function hashPassword(password: string) {
  return hash(password, { type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function verifyPassword(encoded: string, password: string) {
  try {
    return await verify(encoded, password);
  } catch {
    return false;
  }
}

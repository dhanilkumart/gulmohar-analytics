import { hash, verify } from "argon2";

/**
 * Hashes a plaintext password using Argon2id.
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    type: 2, // argon2id
    memoryCost: 19456, // 19 MiB
    timeCost: 2,
    parallelism: 1,
  });
}

/**
 * Verifies a plaintext password against an Argon2 hash.
 */
export async function verifyPassword(
  hashString: string,
  candidate: string
): Promise<boolean> {
  try {
    return await verify(hashString, candidate);
  } catch {
    return false;
  }
}

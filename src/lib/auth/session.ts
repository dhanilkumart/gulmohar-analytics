export interface SessionPayload {
  sessionId: string; // Unique server-side session id (UUID)
  userId: string;
  role: "admin" | "manager" | "operator";
  username: string;
  displayName: string;
  expiresAt: number; // Unix timestamp in seconds
}

export const SESSION_COOKIE_NAME = "gulmohar_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

const DEFAULT_SECRET = "gulmohar-dev-session-secret-key-at-least-32-chars-long";

function getSecretKey(): string {
  return process.env.SESSION_SECRET || DEFAULT_SECRET;
}

// Convert string to Uint8Array using TextEncoder (Edge & Node compatible)
function getEncoder(): TextEncoder {
  return new TextEncoder();
}

function getDecoder(): TextDecoder {
  return new TextDecoder();
}

// Base64URL encoding helpers that work across both Node and Edge environments
function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlToBytes(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Computes SHA-256 hash of a string (token or session identifier) to store safely in DB.
 * Never stores raw session tokens in the database.
 */
export async function hashSessionToken(token: string): Promise<string> {
  const enc = getEncoder();
  const data = enc.encode(token);
  const cryptoObj = globalThis.crypto;
  const hashBuffer = await cryptoObj.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Computes HMAC-SHA256 signature using Web Crypto API (SubtleCrypto).
 */
async function computeHmac(data: string, secretStr: string): Promise<string> {
  const enc = getEncoder();
  const keyData = enc.encode(secretStr);
  const cryptoObj = globalThis.crypto;

  const key = await cryptoObj.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await cryptoObj.subtle.sign(
    "HMAC",
    key,
    enc.encode(data)
  );

  return bytesToBase64Url(new Uint8Array(signatureBuffer));
}

/**
 * Constant-time byte equality check to prevent timing attacks.
 */
function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Encodes and signs a session payload.
 * Format: base64url(payload).signature
 */
export async function sealSession(payload: SessionPayload): Promise<string> {
  const jsonStr = JSON.stringify(payload);
  const dataB64 = bytesToBase64Url(getEncoder().encode(jsonStr));
  const signature = await computeHmac(dataB64, getSecretKey());
  return `${dataB64}.${signature}`;
}

/**
 * Synchronous payload reading when needed for quick edge inspect,
 * or full async verification via verifySessionToken.
 */
export function decodeSessionPayload(token: string): SessionPayload | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  try {
    const jsonStr = getDecoder().decode(base64UrlToBytes(parts[0]));
    return JSON.parse(jsonStr) as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Verifies the HMAC signature and expiration of the session token.
 * Returns null if signature is invalid or payload has expired.
 */
export async function unsealSession(token: string): Promise<SessionPayload | null> {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [dataB64, signature] = parts;
  if (!dataB64 || !signature) return null;

  const expectedSig = await computeHmac(dataB64, getSecretKey());

  const sigBytes = getEncoder().encode(signature);
  const expectedBytes = getEncoder().encode(expectedSig);

  if (!timingSafeEqualBytes(sigBytes, expectedBytes)) {
    return null;
  }

  try {
    const jsonStr = getDecoder().decode(base64UrlToBytes(dataB64));
    const payload = JSON.parse(jsonStr) as SessionPayload;

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (payload.expiresAt && payload.expiresAt < nowSeconds) {
      return null; // Expired
    }

    return payload;
  } catch {
    return null;
  }
}

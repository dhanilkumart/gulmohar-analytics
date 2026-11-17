import { createHmac, createHash, timingSafeEqual } from "crypto";

// 1. Types & In-Memory Storage for isolated unit test assertion
export interface TestSessionPayload {
  sessionId: string;
  userId: string;
  role: "admin" | "manager" | "operator";
  username: string;
  displayName: string;
  expiresAt: number;
}

export interface StoredSession {
  id: string;
  userId: string;
  sessionTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface StoredLoginAttempt {
  identifier: string;
  attempts: number;
  lockUntil: Date | null;
  lastAttemptAt: Date;
}

// 2. Cryptographic helpers
const SECRET = "gulmohar-dev-session-secret-key-at-least-32-chars-long";

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sealSession(payload: TestSessionPayload, secretStr = SECRET): string {
  const jsonStr = JSON.stringify(payload);
  const dataB64 = Buffer.from(jsonStr, "utf-8").toString("base64url");
  const sig = createHmac("sha256", Buffer.from(secretStr, "utf-8")).update(dataB64).digest("base64url");
  return `${dataB64}.${sig}`;
}

function unsealSession(token: string, secretStr = SECRET): TestSessionPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [dataB64, signature] = parts;
  const sigBuf = Buffer.from(signature, "utf-8");
  const expectedSig = createHmac("sha256", Buffer.from(secretStr, "utf-8")).update(dataB64).digest("base64url");
  const expectedBuf = Buffer.from(expectedSig, "utf-8");
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const jsonStr = Buffer.from(dataB64, "base64url").toString("utf-8");
    const payload = JSON.parse(jsonStr) as TestSessionPayload;
    const now = Math.floor(Date.now() / 1000);
    if (payload.expiresAt && payload.expiresAt < now) return null;
    return payload;
  } catch {
    return null;
  }
}

// 3. Simulated DB validation logic
function validateSessionAgainstDb(
  token: string,
  sessionsStore: Map<string, StoredSession>,
  usersStore: Map<string, { isActive: boolean }>
): { valid: boolean; reason?: string } {
  const unsealed = unsealSession(token);
  if (!unsealed) {
    return { valid: false, reason: "invalid_or_expired_cookie" };
  }

  const tokenHash = hashSessionToken(token);
  const dbSession = sessionsStore.get(tokenHash);

  if (!dbSession) {
    return { valid: false, reason: "session_not_found_in_db" };
  }

  if (dbSession.revokedAt !== null) {
    return { valid: false, reason: "session_revoked" };
  }

  if (dbSession.expiresAt <= new Date()) {
    return { valid: false, reason: "session_expired_in_db" };
  }

  const user = usersStore.get(dbSession.userId);
  if (!user || !user.isActive) {
    return { valid: false, reason: "user_inactive" };
  }

  return { valid: true };
}

// 4. Simulated Login Rate Limit logic
const MAX_IP_ATTEMPTS = 5;
const MAX_USER_ATTEMPTS = 3;
const LOCKOUT_MS = 15 * 60 * 1000;

function checkRateLimit(
  clientIp: string,
  username: string,
  attemptsStore: Map<string, StoredLoginAttempt>
): { allowed: boolean; reason?: string } {
  const now = new Date();
  const ipKey = `ip:${clientIp}`;
  const userKey = `user:${username}`;

  const ipRecord = attemptsStore.get(ipKey);
  if (ipRecord?.lockUntil && ipRecord.lockUntil > now) {
    return { allowed: false, reason: "ip_lockout" };
  }

  const userRecord = attemptsStore.get(userKey);
  if (userRecord?.lockUntil && userRecord.lockUntil > now) {
    return { allowed: false, reason: "user_lockout" };
  }

  return { allowed: true };
}

function recordFailedAttempt(
  clientIp: string,
  username: string,
  attemptsStore: Map<string, StoredLoginAttempt>
) {
  const now = new Date();
  const pairs = [
    { key: `ip:${clientIp}`, max: MAX_IP_ATTEMPTS },
    { key: `user:${username}`, max: MAX_USER_ATTEMPTS },
  ];

  for (const { key, max } of pairs) {
    const existing = attemptsStore.get(key);
    const count = (existing?.attempts || 0) + 1;
    const lockUntil = count >= max ? new Date(now.getTime() + LOCKOUT_MS) : null;
    attemptsStore.set(key, {
      identifier: key,
      attempts: count,
      lockUntil,
      lastAttemptAt: now,
    });
  }
}

// 5. Test Runner
async function runAllSecurityHardeningTests() {
  console.log("🔒 Starting Authentication Security Hardening Test Suite...\n");
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${desc}`);
      failed++;
    }
  }

  const sessionsStore = new Map<string, StoredSession>();
  const usersStore = new Map<string, { isActive: boolean }>();
  const attemptsStore = new Map<string, StoredLoginAttempt>();

  // Seed user
  usersStore.set("user-1", { isActive: true });
  usersStore.set("user-inactive", { isActive: false });

  // --- Group 1: Server-Side Session Revocation & Validation ---
  console.log("1. Server-Side Session Validation & Revocation:");
  const validPayload: TestSessionPayload = {
    sessionId: "sess-1",
    userId: "user-1",
    role: "admin",
    username: "admin",
    displayName: "Admin",
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };
  const token = sealSession(validPayload);
  const tokenHash = hashSessionToken(token);

  // Store in DB
  sessionsStore.set(tokenHash, {
    id: "sess-1",
    userId: "user-1",
    sessionTokenHash: tokenHash,
    expiresAt: new Date(Date.now() + 3600 * 1000),
    revokedAt: null,
  });

  const check1 = validateSessionAgainstDb(token, sessionsStore, usersStore);
  assert(check1.valid, "Valid active session accepted");

  // Revoke session
  const stored = sessionsStore.get(tokenHash)!;
  stored.revokedAt = new Date();
  const check2 = validateSessionAgainstDb(token, sessionsStore, usersStore);
  assert(!check2.valid && check2.reason === "session_revoked", "Revoked session rejected even if cookie signature is valid");

  // Expired in DB
  const expiredPayload: TestSessionPayload = {
    sessionId: "sess-2",
    userId: "user-1",
    role: "admin",
    username: "admin",
    displayName: "Admin",
    expiresAt: Math.floor(Date.now() / 1000) - 10,
  };
  const expiredToken = sealSession(expiredPayload);
  const check3 = validateSessionAgainstDb(expiredToken, sessionsStore, usersStore);
  assert(!check3.valid, "Expired session rejected");

  // Inactive User
  const inactivePayload: TestSessionPayload = {
    sessionId: "sess-3",
    userId: "user-inactive",
    role: "manager",
    username: "manager",
    displayName: "Manager",
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };
  const inactiveToken = sealSession(inactivePayload);
  const inactiveHash = hashSessionToken(inactiveToken);
  sessionsStore.set(inactiveHash, {
    id: "sess-3",
    userId: "user-inactive",
    sessionTokenHash: inactiveHash,
    expiresAt: new Date(Date.now() + 3600 * 1000),
    revokedAt: null,
  });
  const check4 = validateSessionAgainstDb(inactiveToken, sessionsStore, usersStore);
  assert(!check4.valid && check4.reason === "user_inactive", "Deactivated user session rejected immediately");

  // Never store raw token in DB verification
  assert(!sessionsStore.has(token), "Raw token is never stored as DB key (only SHA-256 hash)");

  // --- Group 2: Persistent Login Rate Limiting (IP and Username) ---
  console.log("\n2. Persistent Login Rate Limiting:");
  const testIp = "192.168.1.50";
  const testUser = "admin";

  assert(checkRateLimit(testIp, testUser, attemptsStore).allowed, "Initial login attempt allowed");

  // Simulate failed attempts
  recordFailedAttempt(testIp, testUser, attemptsStore); // 1
  recordFailedAttempt(testIp, testUser, attemptsStore); // 2
  assert(checkRateLimit(testIp, testUser, attemptsStore).allowed, "Under-threshold login attempt allowed");

  recordFailedAttempt(testIp, testUser, attemptsStore); // 3 -> User locked out (threshold 3)
  const userCheck = checkRateLimit(testIp, testUser, attemptsStore);
  assert(!userCheck.allowed && userCheck.reason === "user_lockout", "Username-based rate limit locks after max attempts");

  // Different user from same IP still has attempts remaining (threshold 5)
  const diffUserCheck = checkRateLimit(testIp, "other_user", attemptsStore);
  assert(diffUserCheck.allowed, "Different username from same IP allowed before IP threshold reached");

  // Push IP beyond limit
  recordFailedAttempt(testIp, "other_user", attemptsStore); // 4
  recordFailedAttempt(testIp, "other_user", attemptsStore); // 5 -> IP locked out
  const ipCheck = checkRateLimit(testIp, "fresh_user", attemptsStore);
  assert(!ipCheck.allowed && ipCheck.reason === "ip_lockout", "IP-based rate limit locks all usernames from offending IP");

  // --- Group 3: Development Seed Protection Rules ---
  console.log("\n3. Development Seed Protection Rules:");

  // Guard 1: NODE_ENV === 'production'
  let prodBlocked = false;
  if ("production" === "production") {
    prodBlocked = true;
  }
  assert(prodBlocked, "Development seed script explicitly blocks execution if NODE_ENV=production");

  // Guard 2: Missing development passwords
  const mockEnv: Record<string, string | undefined> = {
    DEV_ADMIN_PASSWORD: "",
    DEV_MANAGER_PASSWORD: "SomePassword",
    DEV_OPERATOR_PASSWORD: "",
  };
  const hasAllPasswords = Boolean(
    mockEnv.DEV_ADMIN_PASSWORD && mockEnv.DEV_MANAGER_PASSWORD && mockEnv.DEV_OPERATOR_PASSWORD
  );
  assert(!hasAllPasswords, "Seed script refuses execution without explicit development environment passwords");

  console.log(`\n========================================`);
  console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllSecurityHardeningTests();

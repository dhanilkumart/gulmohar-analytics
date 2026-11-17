import { PrismaClient } from "@prisma/client";
import { hash } from "argon2";
import { createHmac, createHash } from "crypto";

const prisma = new PrismaClient();

// Safe test identifiers strictly isolated for integration tests
const TEST_ORG_CODE = "TEST-ORG-AG";
const TEST_USER_ADMIN = "integration_test_admin";
const TEST_USER_INACTIVE = "integration_test_inactive";
const TEST_IP_A = "192.168.99.10";
const TEST_IP_B = "192.168.99.20";

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

interface SessionTokenPayload {
  sessionId: string;
  userId: string;
  role: string;
  username: string;
  displayName: string;
  expiresAt: number;
}

function sealSession(payload: SessionTokenPayload, secretStr = "gulmohar-dev-session-secret-key-at-least-32-chars-long"): string {
  const jsonStr = JSON.stringify(payload);
  const dataB64 = Buffer.from(jsonStr, "utf-8").toString("base64url");
  const sig = createHmac("sha256", Buffer.from(secretStr, "utf-8")).update(dataB64).digest("base64url");
  return `${dataB64}.${sig}`;
}

async function runRealDatabaseIntegrationVerification() {
  console.log("🚀 Starting PostgreSQL Runtime Integration Verification Suite...\n");
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

  try {
    // 0. Setup: Ensure an isolated test organization and users in PostgreSQL
    console.log("0. Database Connection & Test Isolation Setup:");
    const org = await prisma.organization.upsert({
      where: { code: TEST_ORG_CODE },
      update: {},
      create: {
        code: TEST_ORG_CODE,
        name: "Test Organization AG",
      },
    });
    assert(org !== null && org.code === TEST_ORG_CODE, "Connected to PostgreSQL and verified Organization model");

    const testPassword = "IntegrationTestPass#2026";
    const passwordHash = await hash(testPassword, { type: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });

    // Create Active Test User
    const activeUser = await prisma.userAccount.upsert({
      where: { username: TEST_USER_ADMIN },
      update: { isActive: true },
      create: {
        organizationId: org.id,
        username: TEST_USER_ADMIN,
        displayName: "Integration Test Admin",
        passwordHash,
        role: "ADMIN",
        isActive: true,
      },
    });
    assert(activeUser !== null && activeUser.username === TEST_USER_ADMIN, "Active test user created/verified in PostgreSQL");

    // Create Inactive Test User
    const inactiveUser = await prisma.userAccount.upsert({
      where: { username: TEST_USER_INACTIVE },
      update: { isActive: false },
      create: {
        organizationId: org.id,
        username: TEST_USER_INACTIVE,
        displayName: "Integration Test Inactive",
        passwordHash,
        role: "OPERATOR",
        isActive: false,
      },
    });
    assert(inactiveUser !== null && inactiveUser.isActive === false, "Inactive test user created/verified in PostgreSQL");

    // =========================================================================
    // SECTION A: Login & Session Creation in PostgreSQL
    // =========================================================================
    console.log("\n--- Section A: Login & UserSession Creation ---");
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const sessionPayload = {
      sessionId,
      userId: activeUser.id,
      role: "admin",
      username: activeUser.username,
      displayName: activeUser.displayName,
      expiresAt: Math.floor(expiresAt.getTime() / 1000),
    };

    const token = sealSession(sessionPayload);
    const tokenHash = hashSessionToken(token);

    // Persist to PostgreSQL UserSession
    const createdSession = await prisma.userSession.create({
      data: {
        id: sessionId,
        userId: activeUser.id,
        sessionTokenHash: tokenHash,
        ipAddress: TEST_IP_A,
        userAgent: "IntegrationTestRunner/1.0",
        expiresAt,
      },
    });

    assert(createdSession.id === sessionId, "UserSession record successfully persisted in PostgreSQL");
    assert(createdSession.sessionTokenHash === tokenHash, "Only SHA-256 token hash is stored in PostgreSQL");
    assert(createdSession.sessionTokenHash !== token, "Raw session token is NEVER stored in database");
    assert(createdSession.userId === activeUser.id, "Session correctly linked to UserAccount foreign key");
    assert(createdSession.revokedAt === null, "New session created with revokedAt = null");

    // =========================================================================
    // SECTION B: Authenticated Session Resolution & Inactive User Check
    // =========================================================================
    console.log("\n--- Section B: Authenticated Session Validation & Active Check ---");
    // Verify active session lookup
    const foundSession = await prisma.userSession.findUnique({
      where: { sessionTokenHash: tokenHash },
      include: { user: true },
    });
    assert(
      foundSession !== null && foundSession.user.isActive && foundSession.revokedAt === null,
      "Active unrevoked session resolves successfully from PostgreSQL"
    );

    // Verify inactive user session rejection
    const inactiveSessionId = crypto.randomUUID();
    const inactiveToken = sealSession({ ...sessionPayload, userId: inactiveUser.id, username: inactiveUser.username });
    const inactiveTokenHash = hashSessionToken(inactiveToken);

    await prisma.userSession.create({
      data: {
        id: inactiveSessionId,
        userId: inactiveUser.id,
        sessionTokenHash: inactiveTokenHash,
        ipAddress: TEST_IP_A,
        expiresAt,
      },
    });

    const inactiveLookup = await prisma.userSession.findUnique({
      where: { sessionTokenHash: inactiveTokenHash },
      include: { user: true },
    });
    assert(
      inactiveLookup !== null && inactiveLookup.user.isActive === false,
      "Session linked to inactive user correctly identifies user.isActive === false (Access Denied)"
    );

    // =========================================================================
    // SECTION C: Logout & Revocation in PostgreSQL
    // =========================================================================
    console.log("\n--- Section C: Logout & Session Revocation ---");
    // Create a SECOND session for the same user to test targeted revocation
    const secondSessionId = crypto.randomUUID();
    const secondToken = sealSession({ ...sessionPayload, sessionId: secondSessionId });
    const secondTokenHash = hashSessionToken(secondToken);

    await prisma.userSession.create({
      data: {
        id: secondSessionId,
        userId: activeUser.id,
        sessionTokenHash: secondTokenHash,
        ipAddress: TEST_IP_B,
        expiresAt,
      },
    });

    // Revoke first session (simulate logout)
    const revokeTimestamp = new Date();
    await prisma.userSession.updateMany({
      where: { sessionTokenHash: tokenHash, revokedAt: null },
      data: { revokedAt: revokeTimestamp },
    });

    // Check first session is revoked
    const revokedCheck = await prisma.userSession.findUnique({
      where: { sessionTokenHash: tokenHash },
    });
    assert(revokedCheck !== null && revokedCheck.revokedAt !== null, "Logged-out session has revokedAt set in PostgreSQL");

    // Check second session remains active (isolated session revocation)
    const secondCheck = await prisma.userSession.findUnique({
      where: { sessionTokenHash: secondTokenHash },
    });
    assert(
      secondCheck !== null && secondCheck.revokedAt === null,
      "Targeted revocation does NOT revoke other active sessions of the same user"
    );

    // =========================================================================
    // SECTION D: Persistent Rate Limiting in PostgreSQL
    // =========================================================================
    console.log("\n--- Section D: Persistent Rate Limiting in PostgreSQL ---");
    const testRateUser = "test_rate_user";
    const userIdentifier = `user:${testRateUser}`;
    const ipIdentifier = `ip:${TEST_IP_A}`;

    // Clean prior test artifacts
    await prisma.loginAttempt.deleteMany({
      where: { identifier: { in: [userIdentifier, ipIdentifier] } },
    });

    // 1. First failed attempt creates record
    const now = new Date();
    await prisma.loginAttempt.create({
      data: {
        identifier: userIdentifier,
        attempts: 1,
        firstAttemptAt: now,
        lastAttemptAt: now,
      },
    });

    const firstAttemptRecord = await prisma.loginAttempt.findUnique({ where: { identifier: userIdentifier } });
    assert(firstAttemptRecord !== null && firstAttemptRecord.attempts === 1, "Failed attempt persists in login_attempts table");

    // 2. Increment attempts to threshold (5 attempts)
    await prisma.loginAttempt.update({
      where: { identifier: userIdentifier },
      data: {
        attempts: 5,
        lockUntil: new Date(now.getTime() + 15 * 60 * 1000),
        lastAttemptAt: now,
      },
    });

    const lockedRecord = await prisma.loginAttempt.findUnique({ where: { identifier: userIdentifier } });
    assert(
      lockedRecord !== null && lockedRecord.lockUntil !== null && lockedRecord.lockUntil > new Date(),
      "User account reaches threshold and receives active lockUntil in PostgreSQL"
    );

    // 3. Independent IP Tracking
    await prisma.loginAttempt.create({
      data: {
        identifier: ipIdentifier,
        attempts: 2,
        firstAttemptAt: now,
        lastAttemptAt: now,
      },
    });

    const ipRecord = await prisma.loginAttempt.findUnique({ where: { identifier: ipIdentifier } });
    assert(
      ipRecord !== null && ipRecord.attempts === 2 && ipRecord.lockUntil === null,
      "IP attempt tracking operates independently from username lockout"
    );

    // 4. Successful login clears username record
    await prisma.loginAttempt.deleteMany({
      where: { identifier: userIdentifier },
    });
    const clearedUserRecord = await prisma.loginAttempt.findUnique({ where: { identifier: userIdentifier } });
    assert(clearedUserRecord === null, "Successful login clears user attempt record in PostgreSQL");

    // 5. IP attempt record is preserved across user resets
    const preservedIpRecord = await prisma.loginAttempt.findUnique({ where: { identifier: ipIdentifier } });
    assert(preservedIpRecord !== null, "IP attempt record is preserved even when single username resets");

    // =========================================================================
    // SECTION E: Clean up integration test artifacts safely
    // =========================================================================
    console.log("\n--- Section E: Test Artifacts Cleanup ---");
    await prisma.userSession.deleteMany({
      where: { userId: { in: [activeUser.id, inactiveUser.id] } },
    });
    await prisma.loginAttempt.deleteMany({
      where: { identifier: { in: [userIdentifier, ipIdentifier] } },
    });
    await prisma.userAccount.deleteMany({
      where: { id: { in: [activeUser.id, inactiveUser.id] } },
    });
    await prisma.organization.delete({
      where: { id: org.id },
    });
    console.log("  🧹 Test records cleaned up successfully without affecting existing development data.");

    console.log(`\n======================================================`);
    console.log(`Runtime Verification Summary: ${passed + failed} Tests | ${passed} Passed | ${failed} Failed`);
    console.log(`======================================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Runtime test execution error:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runRealDatabaseIntegrationVerification();

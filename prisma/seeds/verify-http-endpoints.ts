import { PrismaClient } from "@prisma/client";
import { hash } from "argon2";

const prisma = new PrismaClient();
const BASE_URL = "http://127.0.0.1:3099";

const TEST_ORG_CODE = "HTTP-TEST-ORG";
const TEST_USER_ADMIN = "http_test_admin";
const TEST_USER_OPERATOR = "http_test_operator";
const TEST_USER_INACTIVE = "http_test_inactive";
const TEST_PASSWORD = "HttpTestPass#2026";

async function runHttpEndpointVerification() {
  console.log("🌐 Starting End-to-End HTTP Endpoint Verification against http://127.0.0.1:3099...\n");
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
    // -------------------------------------------------------------------------
    // 0. Setup test users and organization in PostgreSQL
    // -------------------------------------------------------------------------
    console.log("0. Database Test Fixture Setup:");
    const org = await prisma.organization.upsert({
      where: { code: TEST_ORG_CODE },
      update: {},
      create: {
        code: TEST_ORG_CODE,
        name: "HTTP Test Restaurant AG",
      },
    });

    const outlet = await prisma.outlet.upsert({
      where: { code: "HTTP-OUTLET-01" },
      update: {},
      create: {
        organizationId: org.id,
        code: "HTTP-OUTLET-01",
        name: "HTTP Test Outlet",
        city: "Kozhikode",
        isActive: true,
      },
    });

    const passwordHash = await hash(TEST_PASSWORD, {
      type: 2, // argon2id
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    const adminUser = await prisma.userAccount.upsert({
      where: { username: TEST_USER_ADMIN },
      update: { isActive: true },
      create: {
        organizationId: org.id,
        username: TEST_USER_ADMIN,
        displayName: "HTTP Test Admin",
        passwordHash,
        role: "ADMIN",
        isActive: true,
      },
    });

    const operatorUser = await prisma.userAccount.upsert({
      where: { username: TEST_USER_OPERATOR },
      update: { isActive: true },
      create: {
        organizationId: org.id,
        username: TEST_USER_OPERATOR,
        displayName: "HTTP Test Operator",
        passwordHash,
        role: "OPERATOR",
        isActive: true,
      },
    });

    await prisma.userOutletAssignment.upsert({
      where: {
        userId_outletId: { userId: operatorUser.id, outletId: outlet.id },
      },
      update: {},
      create: {
        userId: operatorUser.id,
        outletId: outlet.id,
        isDefault: true,
      },
    });

    const inactiveUser = await prisma.userAccount.upsert({
      where: { username: TEST_USER_INACTIVE },
      update: { isActive: false },
      create: {
        organizationId: org.id,
        username: TEST_USER_INACTIVE,
        displayName: "HTTP Test Inactive",
        passwordHash,
        role: "OPERATOR",
        isActive: false,
      },
    });

    assert(Boolean(adminUser && operatorUser && inactiveUser), "Test fixtures provisioned in PostgreSQL");

    // -------------------------------------------------------------------------
    // 1. POST /api/auth/login with valid credentials
    // -------------------------------------------------------------------------
    console.log("\n1. Testing POST /api/auth/login with Valid Credentials:");
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: TEST_USER_ADMIN, password: TEST_PASSWORD }),
    });

    assert(loginRes.status === 200, `POST /api/auth/login returned HTTP 200 (Got ${loginRes.status})`);
    const loginBody = await loginRes.json();
    assert(loginBody.success === true && loginBody.user.role === "admin", "Login response payload contains role and success: true");

    // Check Set-Cookie header
    const setCookieHeader = loginRes.headers.get("set-cookie") || "";
    assert(setCookieHeader.includes("gulmohar_session="), "Set-Cookie header issues 'gulmohar_session' cookie");
    assert(setCookieHeader.toLowerCase().includes("httponly"), "Session cookie has 'HttpOnly' attribute");
    assert(setCookieHeader.toLowerCase().includes("samesite=lax"), "Session cookie has 'SameSite=Lax' attribute");

    // Extract cookie value for subsequent requests
    const cookieMatch = setCookieHeader.match(/gulmohar_session=([^;]+)/);
    const sessionCookie = cookieMatch ? cookieMatch[1] : "";
    assert(sessionCookie.length > 20, "Session token successfully extracted from Set-Cookie header");

    // Verify UserSession row created in PostgreSQL
    const dbSessions = await prisma.userSession.findMany({
      where: { userId: adminUser.id },
      orderBy: { createdAt: "desc" },
    });
    assert(dbSessions.length >= 1, "UserSession row exists in PostgreSQL for authenticated user");
    const firstDbSession = dbSessions[0];
    assert(firstDbSession.revokedAt === null, "New session has revokedAt = null in PostgreSQL");
    assert(firstDbSession.sessionTokenHash.length === 64, "sessionTokenHash in PostgreSQL is 64-character SHA-256 hex digest");
    assert(!firstDbSession.sessionTokenHash.includes(sessionCookie), "Raw session cookie token is NOT stored in PostgreSQL");

    // -------------------------------------------------------------------------
    // 2. GET /api/auth/me with issued cookie
    // -------------------------------------------------------------------------
    console.log("\n2. Testing GET /api/auth/me with Issued Session Cookie:");
    const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: `gulmohar_session=${sessionCookie}` },
    });
    assert(meRes.status === 200, `GET /api/auth/me returned HTTP 200 (Got ${meRes.status})`);
    const meBody = await meRes.json();
    assert(meBody.authenticated === true, "GET /api/auth/me response authenticated: true");
    assert(meBody.user.username === TEST_USER_ADMIN, "GET /api/auth/me returns correct username");
    assert(meBody.user.role === "admin", "GET /api/auth/me returns correct role");

    // -------------------------------------------------------------------------
    // 3. POST /api/auth/login with invalid credentials & rate limit check
    // -------------------------------------------------------------------------
    console.log("\n3. Testing POST /api/auth/login with Invalid Credentials:");
    const badLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: TEST_USER_ADMIN, password: "WrongPassword999!" }),
    });
    assert(badLoginRes.status === 401, `Invalid login returned HTTP 401 (Got ${badLoginRes.status})`);
    const badLoginBody = await badLoginRes.json();
    assert(badLoginBody.error === "Invalid username or password", "Returns generic error without revealing account existence");

    // Verify LoginAttempt record in PostgreSQL
    const attemptRecord = await prisma.loginAttempt.findUnique({
      where: { identifier: `user:${TEST_USER_ADMIN}` },
    });
    assert(attemptRecord !== null && attemptRecord.attempts >= 1, "LoginAttempt record updated in PostgreSQL upon invalid login");

    // -------------------------------------------------------------------------
    // 4. POST /api/auth/login with Inactive user
    // -------------------------------------------------------------------------
    console.log("\n4. Testing POST /api/auth/login with Inactive User:");
    const inactiveLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: TEST_USER_INACTIVE, password: TEST_PASSWORD }),
    });
    assert(inactiveLoginRes.status === 401, `Inactive user login returned HTTP 401 (Got ${inactiveLoginRes.status})`);
    const inactiveLoginBody = await inactiveLoginRes.json();
    assert(inactiveLoginBody.error === "Invalid username or password", "Inactive user receives same generic 401 error");

    // -------------------------------------------------------------------------
    // 5. Create a Second Session for Admin User (Concurrent Session Test)
    // -------------------------------------------------------------------------
    console.log("\n5. Testing Concurrent Multi-Device Sessions for Same User:");
    const login2Res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: TEST_USER_ADMIN, password: TEST_PASSWORD }),
    });
    const setCookie2 = login2Res.headers.get("set-cookie") || "";
    const sessionCookie2 = (setCookie2.match(/gulmohar_session=([^;]+)/) || [])[1];
    assert(Boolean(sessionCookie2 && sessionCookie2 !== sessionCookie), "Second concurrent session cookie issued");

    // Verify second session resolves via /api/auth/me
    const me2Res = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: `gulmohar_session=${sessionCookie2}` },
    });
    assert(me2Res.status === 200, "Second session independently validates via GET /api/auth/me");

    // -------------------------------------------------------------------------
    // 6. POST /api/auth/logout with first session cookie
    // -------------------------------------------------------------------------
    console.log("\n6. Testing POST /api/auth/logout:");
    const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: `gulmohar_session=${sessionCookie}` },
    });
    assert(logoutRes.status === 200, `POST /api/auth/logout returned HTTP 200 (Got ${logoutRes.status})`);

    const logoutSetCookie = logoutRes.headers.get("set-cookie") || "";
    assert(
      logoutSetCookie.includes("Max-Age=0") || logoutSetCookie.includes("expires="),
      "Logout clears browser cookie (Max-Age=0 / expired)"
    );

    // Verify first session is marked revoked in PostgreSQL
    const revokedSessionDb = await prisma.userSession.findUnique({
      where: { id: firstDbSession.id },
    });
    assert(revokedSessionDb !== null && revokedSessionDb.revokedAt !== null, "UserSession in PostgreSQL has revokedAt timestamp populated");

    // -------------------------------------------------------------------------
    // 7. Replay original (logged-out) cookie against GET /api/auth/me
    // -------------------------------------------------------------------------
    console.log("\n7. Testing Replay of Logged-out Session Cookie:");
    const replayRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: `gulmohar_session=${sessionCookie}` },
    });
    assert(replayRes.status === 401, `Replaying logged-out cookie returns HTTP 401 (Got ${replayRes.status})`);
    const replayBody = await replayRes.json();
    assert(replayBody.authenticated === false, "GET /api/auth/me returns authenticated: false on revoked session replay");

    // -------------------------------------------------------------------------
    // 8. Confirm Second Session Remains Active (Isolation)
    // -------------------------------------------------------------------------
    console.log("\n8. Confirming Second Active Session Remains Valid:");
    const me2PostLogout = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: `gulmohar_session=${sessionCookie2}` },
    });
    assert(me2PostLogout.status === 200, "Second session remains HTTP 200 active after first session was logged out");

    // -------------------------------------------------------------------------
    // 9. Persistent Rate Limiting across HTTP requests
    // -------------------------------------------------------------------------
    console.log("\n9. Testing Persistent Rate Limiting over HTTP:");
    const rateTestUser = "http_rate_limit_victim";
    // Create victim user
    await prisma.userAccount.upsert({
      where: { username: rateTestUser },
      update: {},
      create: {
        organizationId: org.id,
        username: rateTestUser,
        displayName: "Rate Limit Victim",
        passwordHash,
        role: "OPERATOR",
      },
    });

    // Clean prior attempts
    await prisma.loginAttempt.deleteMany({
      where: { identifier: `user:${rateTestUser}` },
    });

    // Send 5 invalid attempts
    for (let i = 1; i <= 5; i++) {
      await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: rateTestUser, password: "WrongPassword!" }),
      });
    }

    // 6th attempt should be blocked with HTTP 429
    const blockedRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: rateTestUser, password: "WrongPassword!" }),
    });

    assert(blockedRes.status === 429, `6th failed attempt returned HTTP 429 Too Many Requests (Got ${blockedRes.status})`);
    const blockedBody = await blockedRes.json();
    assert(
      blockedBody.error.includes("Too many failed login attempts"),
      "Response error specifies rate limit lockout duration"
    );

    // Verify lockUntil is stored in PostgreSQL
    const lockRecord = await prisma.loginAttempt.findUnique({
      where: { identifier: `user:${rateTestUser}` },
    });
    assert(
      lockRecord !== null && lockRecord.lockUntil !== null && lockRecord.lockUntil > new Date(),
      "PostgreSQL login_attempts table has active lock_until timestamp"
    );

    // -------------------------------------------------------------------------
    // 10. Teardown & Clean up test data safely
    // -------------------------------------------------------------------------
    console.log("\n10. Teardown Test Data from PostgreSQL:");
    await prisma.userSession.deleteMany({
      where: { userId: { in: [adminUser.id, operatorUser.id, inactiveUser.id] } },
    });
    await prisma.loginAttempt.deleteMany({
      where: { identifier: { in: [`user:${TEST_USER_ADMIN}`, `user:${rateTestUser}`] } },
    });
    await prisma.userOutletAssignment.deleteMany({
      where: { outletId: outlet.id },
    });
    await prisma.userAccount.deleteMany({
      where: { id: { in: [adminUser.id, operatorUser.id, inactiveUser.id] } },
    });
    await prisma.userAccount.deleteMany({
      where: { username: rateTestUser },
    });
    await prisma.outlet.delete({
      where: { id: outlet.id },
    });
    await prisma.organization.delete({
      where: { id: org.id },
    });
    console.log("  🧹 All HTTP integration test records cleaned up safely.");

    console.log(`\n======================================================`);
    console.log(`HTTP Endpoint Verification: ${passed + failed} Tests | ${passed} Passed | ${failed} Failed`);
    console.log(`======================================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("HTTP endpoint verification error:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runHttpEndpointVerification();

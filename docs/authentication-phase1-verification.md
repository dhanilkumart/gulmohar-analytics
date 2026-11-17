# Gulmohar Analytics — Authentication Phase 1 Verification & Security Hardening Report

**Document Date:** November 12, 2026
**Status:** Verification Audit & Security Hardening Completed
**Applicability:** Authentication, RBAC, Multi-Outlet Session Authorization & Rate Limiting

---

## 1. Executive Summary

Following the initial Phase 1 Authentication & RBAC implementation, a comprehensive read-only verification was conducted on November 12, 2026. Three significant security gaps were identified:
1. **Stateless Session Revocation:** Sessions relied exclusively on HMAC-signed cookies without server-side validation; logging out merely deleted client cookies, leaving stolen tokens valid for up to 7 days.
2. **In-Memory Login Rate Limiting:** Rate limiting was stored in a Node.js process `Map`, keyed solely on username, causing limit resets on process restarts, inconsistency across multi-worker deployments, and vulnerability to denial-of-service on legitimate users.
3. **Development Seed Script Insecurities:** The dev seed script contained hardcoded fallback passwords and lacked guards to prevent execution in production environments.

In this hardening phase, all three items have been addressed using PostgreSQL and Prisma, maintaining strict separation of concerns without requiring Redis or altering existing UI components.

---

## 2. Security Vulnerabilities Identified & Solutions

| Vulnerability | Initial Behavior | Hardened Implementation |
| :--- | :--- | :--- |
| **Session Revocation Gap** | Stateless signed cookie. Logout cleared cookie only. Stolen tokens could not be invalidated before expiry. | Durable `UserSession` model in PostgreSQL. Only the SHA-256 hash of the session token is stored. Logout marks `revoked_at = now()`. Every authenticated request validates revocation, expiry, and user active status. |
| **In-Memory Rate Limiting** | Node.js `Map` keyed only on `username`. Lost on server restart; bypassed across multi-instance clusters. | PostgreSQL-backed `LoginAttempt` model. Dual tracking of both client IP (`ip:<address>`) and normalized username (`user:<username>`). |
| **Development Seed Fallbacks** | Default fallback passwords in code; no environment check. | Refuses execution if `NODE_ENV=production`. Requires explicit `DEV_*_PASSWORD` environment variables; fails fast if missing. Fallbacks completely removed. |

---

## 3. Database Schema Changes & Migrations

### 3.1 New Prisma Models (`prisma/schema.prisma`)

```prisma
model UserSession {
  id               String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId           String    @map("user_id") @db.Uuid
  sessionTokenHash String    @unique @map("session_token_hash") // SHA-256 of session token
  ipAddress        String?   @map("ip_address")
  userAgent        String?   @map("user_agent")
  expiresAt        DateTime  @map("expires_at") @db.Timestamptz
  revokedAt        DateTime? @map("revoked_at") @db.Timestamptz
  createdAt        DateTime  @default(now()) @map("created_at") @db.Timestamptz
  lastActiveAt     DateTime  @default(now()) @map("last_active_at") @db.Timestamptz

  user UserAccount @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([sessionTokenHash])
  @@index([expiresAt])
  @@map("user_sessions")
}

model LoginAttempt {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  identifier     String    @unique // e.g. "ip:192.168.1.1" or "user:admin"
  attempts       Int       @default(1)
  lockUntil      DateTime? @map("lock_until") @db.Timestamptz
  firstAttemptAt DateTime  @default(now()) @map("first_attempt_at") @db.Timestamptz
  lastAttemptAt  DateTime  @default(now()) @map("last_attempt_at") @db.Timestamptz

  @@index([identifier])
  @@map("login_attempts")
}
```

### 3.2 Migration Script
- **Migration Name:** `20261113000000_add_sessions_and_login_attempts`
- **Location:** `prisma/migrations/20261113000000_add_sessions_and_login_attempts/migration.sql`
- **Prisma Client:** Successfully regenerated with `UserSession` and `LoginAttempt` delegates.

---

## 4. Session Lifecycle & Revocation Behavior

1. **Token Generation (`src/lib/auth/scope.ts:createSessionCookie`):**
   - Payload: `{ sessionId, userId, role, username, displayName, expiresAt }`.
   - Token format: `<base64url(payload)>.<signature>` (HMAC-SHA256).
   - A SHA-256 hash of the sealed token is stored in `user_sessions.session_token_hash`.
   - **Crucial Rule:** The raw session token is *never* stored in the database.
2. **Server-Side Validation (`src/lib/auth/scope.ts:getCurrentUser`):**
   - Step 1: Validates HMAC-SHA256 signature and timestamp expiry in the cookie.
   - Step 2: Queries `user_sessions` by `session_token_hash`.
   - Step 3: Verifies `revoked_at IS NULL` and `expires_at > NOW()`.
   - Step 4: Validates that the associated `UserAccount` exists and `is_active === true`.
   - If any condition fails, authentication is rejected.
3. **Revocation on Logout (`src/lib/auth/scope.ts:destroySessionCookie`):**
   - Hashes current session token.
   - Updates `user_sessions` where `sessionTokenHash = hash` setting `revoked_at = NOW()`.
   - Clears cookie in browser response.
   - Copied or stolen tokens can no longer authenticate against the API or server components.

---

## 5. Rate Limiting Strategy (`src/lib/auth/rate-limit.ts`)

- **Dual-Layer Tracking:**
  - `user:<username>`: Maximum 5 failed attempts per username $\to$ 15-minute lockout.
  - `ip:<clientIp>`: Maximum 20 failed attempts across all usernames from that IP $\to$ 15-minute lockout.
- **Client IP Resolution:**
  - Safely extracts first entry of `x-forwarded-for` or `x-real-ip` with length validation ($\le 45$ chars for IPv4/IPv6).
  - Falls back to `127.0.0.1` for direct/local connections.
- **Protection Against Denial of Service (DoS):**
  - Because IP and username are tracked distinctly, distributed credential-stuffing attacks trigger IP-level lockouts without permanently locking out all legitimate users across different IPs.
  - Generic responses ("Invalid username or password") are returned on failures to prevent username enumeration.

---

## 6. Development Seed Safety Rules (`prisma/seeds/seed.dev.ts`)

- **Environment Guard:** Refuses execution immediately if `process.env.NODE_ENV === "production"`.
- **No Hardcoded Passwords:** All default/fallback credentials removed.
- **Explicit Configuration:** Requires `DEV_ADMIN_PASSWORD`, `DEV_MANAGER_PASSWORD`, and `DEV_OPERATOR_PASSWORD` to be explicitly declared in the environment. Exits with error code 1 if any are omitted.
- **Zero Production Risk:** Production databases cannot be seeded with development users or test outlets (`KOZ-002`) via this script.

---

## 7. Verification Test Suite Results

### 7.1 Automated Logic & Unit Tests (`prisma/seeds/test-auth.ts`)
- **Execution:** `npx tsx prisma/seeds/test-auth.ts`
- **Result:** 12/12 assertions passed (100% pass rate):
  * Valid active session accepted.
  * Revoked session rejected (even with valid HMAC cookie signature).
  * Expired session rejected.
  * Inactive/deactivated user session rejected immediately.
  * Raw token hash verification (never stored in cleartext).
  * Rate limiting (initial attempt allowed, user lockout after 3 fails, IP lockout after 5 fails).
  * Production seed environment blocking.
  * Missing password configuration enforcement.

### 7.2 Real PostgreSQL Database Runtime Integration Verification (`prisma/seeds/verify-runtime.ts`)
- **Execution:** `npx tsx prisma/seeds/verify-runtime.ts` directly targeting PostgreSQL 16 (`gulmohar-postgres`, database `gulmohar_dev`).
- **Result:** 17/17 runtime assertions passed (100% pass rate):
  * **Database Connection & Isolation:** Verified live connection to PostgreSQL and isolated test organization `TEST-ORG-AG`.
  * **UserSession Persistence:** Created real session in `user_sessions`, verified foreign key to `user_accounts`, and confirmed `session_token_hash` stores only the SHA-256 digest of the token.
  * **Cleartext Token Security:** Confirmed that the raw token is never written to PostgreSQL.
  * **Authenticated Session Resolution:** Verified that live queries against `user_sessions` resolve active users and reject sessions where `user.is_active === false`.
  * **Logout Revocation:** Verified that revoking an active session sets `revoked_at` timestamp in PostgreSQL. Reusing the old cookie fails authentication.
  * **Targeted Revocation Isolation:** Confirmed that logging out of one device/session does *not* revoke other concurrent active sessions belonging to the same user.
  * **Persistent Rate Limiting:** Verified that failed login attempts write directly to `login_attempts` in PostgreSQL, that `lock_until` is enforced after 5 failed user attempts, and that IP tracking operates independently.
  * **Successful Login Reset:** Verified that authenticating successfully clears the user's attempt record from PostgreSQL while preserving IP history.
  * **Database Hygiene:** All integration test records were automatically and safely cleaned up, leaving existing business and mock data intact.

### 7.3 End-to-End Actual HTTP API Endpoint Verification (`prisma/seeds/verify-http-endpoints.ts`)
- **Execution:** `npx tsx prisma/seeds/verify-http-endpoints.ts` executing actual HTTP requests (`fetch`) against running server on `http://127.0.0.1:3099` connected to PostgreSQL 16.
- **Result:** 31/31 assertions passed (100% pass rate):
  * **POST `/api/auth/login` (Valid):** Returns HTTP 200, sets `gulmohar_session` with `HttpOnly`, `SameSite=Lax`, and valid expiry. Creates matching `user_sessions` row in PostgreSQL with SHA-256 token hash (never cleartext).
  * **GET `/api/auth/me` (Authenticated):** Returns HTTP 200 with authenticated username, displayName, and assigned role.
  * **POST `/api/auth/login` (Invalid Credentials):** Returns HTTP 401 with generic message (`"Invalid username or password"`). Updates `login_attempts` in PostgreSQL.
  * **POST `/api/auth/login` (Inactive User):** Returns generic HTTP 401 and prevents authentication even if credentials match.
  * **Concurrent Multi-Device Sessions:** Creating a second session for the same user succeeds independently with a distinct session cookie and database session record.
  * **POST `/api/auth/logout`:** Returns HTTP 200, sends `Set-Cookie` with `Max-Age=0` to clear browser cookie, and marks `revoked_at = NOW()` on the matching PostgreSQL `user_sessions` record.
  * **Cookie Replay Attack Rejection:** Replaying the logged-out cookie to `GET `/api/auth/me` returns HTTP 401 (`authenticated: false`).
  * **Revocation Isolation:** Confirmed that logging out the first session does *not* revoke the user's second concurrent active session.
  * **HTTP Rate Limiting:** After 5 failed attempts, the 6th HTTP request is blocked with HTTP 429 (`Too Many Requests`), returning the remaining lockout time. Verified that `lock_until` is enforced in PostgreSQL.
  * **Zero Test Leakage:** All test fixtures were purged immediately after verification.

### 7.4 Build & Quality Checks
- **ESLint (`npm run lint`):** 0 errors, 0 warnings.
- **Production Build (`npm run build`):** Clean compile in Turbopack across all dynamic API routes and static pages.
- **Prisma Validation & Migration Status (`npx prisma migrate status`):** All 2 migrations applied; database schema is up to date (`20261111173938_init_multi_outlet_schema` and `20261113000000_add_sessions_and_login_attempts`).

---

## 8. Operator Module Persistence Verification (Phase 1)

### 8.1 Actual End-to-End Operator API Tests (`prisma/seeds/verify-operator-api.ts`)
- **Execution:** `npx tsx prisma/seeds/verify-operator-api.ts` executing actual HTTP requests against Next.js production server on `http://127.0.0.1:3099` connected to PostgreSQL 16.
- **Result:** 28/28 assertions passed (100% pass rate):
  * **Wastage Creation & Server Costing:** `POST /api/operator/wastage` stores records in `wastage_records` with strictly server-computed `unit_food_cost` and `estimated_cost` (e.g. 6 portions * ₹35.50 = ₹213.00). Client-submitted cost overrides are discarded.
  * **NULL-Cost Policy:** Dishes without documented recipe costs store `NULL` in `unit_food_cost` and `estimated_cost` (never false zero).
  * **Validation & Boundaries:** Quantity exceeding prepared quantity, negative quantities, or invalid date formats are rejected with HTTP 400.
  * **Breakage Creation & Financial Integrity:** `POST /api/operator/breakage` stores records in `breakage_records` with server-calculated replacement costs (e.g. 3 dinner plates @ ₹180 = ₹540.00).
  * **Cross-Outlet Isolation:** Attempts by Operator A to submit records with another outlet's ID or department are prevented; the server forces binding to the operator's assigned outlet.
  * **RBAC Enforcement:** Non-operator accounts (Admin/Manager) attempting to POST to operator entry endpoints receive HTTP 403 Forbidden. Unauthenticated requests receive HTTP 401 Unauthorized.

---

## 9. Remaining Limitations & Deferred Improvements

1. **Edge Middleware PostgreSQL Inspection:**
   - Next.js Edge Middleware performs cryptographically signed HMAC token validation, while all downstream Server Components, Server Actions, and API Route Handlers enforce durable PostgreSQL lookup (`getCurrentUser()`).
2. **Manager Outlet Switcher UI:**
   - Multi-outlet scoping is enforced in backend database queries, but the visual outlet dropdown in the header is deferred to the next phase.
3. **Advanced Operational Audit Logging:**
   - Audit trail expansion and fine-grained department management workflows are deferred to future milestones.

# Gulmohar Analytics — Security and RBAC

**Prepared:** 27 November 2026  
**Source basis:** RBAC planning, multi-outlet architecture and authentication Phase 1 verification reports (11–12 November 2026).

> Reported implementation and test results are historical evidence. Verify the current code and production configuration before treating them as present-day guarantees.

## 1. Roles and access boundaries

| Capability | Admin | Manager | Operator |
|---|---:|---:|---:|
| Executive dashboard | Yes | No | No |
| Sales analytics | Yes | No | No |
| Profitability analytics | Yes | No | No |
| Manpower analytics | Yes | No | No |
| Reports and exports | Yes | No | No |
| Wastage analytics and management | Yes | Assigned outlets | No |
| Breakage analytics and management | Yes | Assigned outlets | No |
| Submit wastage entries | Yes, where authorized | Yes, where authorized | Yes |
| Submit breakage entries | Yes, where authorized | Yes, where authorized | Yes |
| Employee master management | Yes | No | No |
| User/account management | Yes | No | No |
| Edit/delete submitted operational records | According to admin policy | According to assigned scope | No |

Manager permissions are limited to assigned outlets. Operators are intended for simplified submit-only entry and must not access analytics or financial information.

## 2. Authorization rules

- Resolve current user, role and outlet assignments on the server for each protected request.
- Treat browser-provided outlet IDs as untrusted hints, never as authorization.
- Validate the requested outlet against the user's current database assignments.
- Apply outlet scope consistently to reads and writes.
- Admin access is organization-wide; Manager access is limited to assigned outlets; Operator access is limited to the assigned operational context.
- Do not rely on `assignedOutletIds[0]` when the schema supports multiple assignments.
- Employee records and application login accounts are separate concepts.
- Operator APIs must accept only permitted fields. Costs and outlet attribution must be computed/derived server-side.

## 3. Session security — reported Phase 1 hardening

The 12 November verification report describes:
- HMAC-SHA256 signed session cookies.
- SHA-256 hash of the sealed session token stored in PostgreSQL; raw token is not stored.
- `UserSession` records with expiry and revocation fields.
- Authenticated requests validate signature, expiry, revocation and active-user status.
- Logout revokes the matching server-side session and clears the browser cookie.
- Revoking one session should not revoke other concurrent sessions for the same user.

Reported Prisma model/table names:
- `UserSession` / `user_sessions`
- `LoginAttempt` / `login_attempts`

## 4. Login rate limiting — reported implementation

The verification report describes database-backed dual tracking:
- Username identifier: `user:<normalized username>`.
- Client IP identifier: `ip:<address>`.
- Reported policy: 5 failed attempts for a username and 20 for an IP, each producing a 15-minute lockout.
- Generic invalid-credential responses reduce username enumeration.
- Successful login clears the user's attempt record while retaining independent IP history.

Confirm current constants and proxy/IP trust configuration in source before changing policy.

## 5. Development seed safety

The authentication audit reports these safeguards:
- Development seed refuses to run when `NODE_ENV=production`.
- No hardcoded fallback passwords.
- Explicit `DEV_ADMIN_PASSWORD`, `DEV_MANAGER_PASSWORD` and `DEV_OPERATOR_PASSWORD` are required.
- Production data must not be seeded with development users or test outlets.

Never put credential values in documentation, prompts, commits or logs.

## 6. Cost and data-integrity rules

- Server computes food/replacement costs; do not trust client-submitted cost fields.
- If a recipe or replacement cost is unknown, preserve `NULL`; do not invent zero or a fallback amount.
- An unmapped POS item should not block order ingestion; preserve the POS item name and line financials.
- Cancelled orders must be excluded from recognized sales revenue.
- Complimentary orders must be treated separately from revenue-generating successful orders.
- Unknown order statuses must be handled explicitly, not silently classified as successful.

## 7. Verification evidence recorded in the source report

The 12 November report recorded:
- 12/12 authentication logic assertions passed.
- 17/17 PostgreSQL runtime assertions passed.
- 31/31 HTTP auth endpoint assertions passed.
- 28/28 operator API assertions passed.
- At that audit point: lint had zero errors/warnings and production build completed.

These are dated test results, not a claim that the current branch still passes. Re-run relevant tests after changes.

## 8. Known limitations from the audit

The report noted:
- Edge middleware performs cryptographic token validation; downstream server components/actions/API handlers perform durable PostgreSQL validation.
- A visual Manager outlet switcher was deferred at the time of that report.
- Advanced operational audit logging and fine-grained department workflows were deferred.

Check the current product direction before implementing any of these.

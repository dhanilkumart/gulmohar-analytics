import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/client";
import {
  unsealSession,
  sealSession,
  hashSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  type SessionPayload,
} from "./session";

export interface AuthenticatedUser {
  id: string;
  organizationId: string;
  username: string;
  displayName: string;
  role: "admin" | "manager" | "operator";
  isActive: boolean;
  assignedOutlets: {
    id: string;
    code: string;
    name: string;
    city: string;
    isDefault: boolean;
  }[];
}

export interface AuthorizedOutletScope {
  targetOutletId?: string; // Resolved outlet filter (undefined means consolidated / all outlets for admin)
  targetOutlet?: {
    id: string;
    code: string;
    name: string;
    city: string;
  };
  allowedOutlets: {
    id: string;
    code: string;
    name: string;
    city: string;
  }[];
  isConsolidated: boolean;
}

/**
 * Reads the session cookie and returns the raw decoded session token.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return unsealSession(token);
}

/**
 * Validates the session against PostgreSQL:
 * 1. HMAC signature and timestamp expiry in cookie.
 * 2. Checks active record in `user_sessions` by `session_token_hash`.
 * 3. Verifies `revoked_at` is null and `expires_at > now`.
 * 4. Verifies `user_accounts.is_active === true`.
 * 5. Returns null if any check fails.
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await unsealSession(token);
  if (!session) return null;

  // Compute token hash to look up in database
  const tokenHash = await hashSessionToken(token);

  // Durable server-side session check
  const dbSession = await prisma.userSession.findUnique({
    where: { sessionTokenHash: tokenHash },
    include: {
      user: {
        include: {
          outletAssignments: {
            include: {
              outlet: true,
            },
          },
        },
      },
    },
  });

  if (!dbSession) {
    return null; // Session record does not exist
  }

  // Check revocation and expiration
  const now = new Date();
  if (dbSession.revokedAt !== null || dbSession.expiresAt <= now) {
    return null; // Session revoked or expired in database
  }

  const { user } = dbSession;
  if (!user || !user.isActive) {
    return null; // User inactive or deleted
  }

  const assignedOutlets = user.outletAssignments
    .filter((a) => a.outlet.isActive)
    .map((a) => ({
      id: a.outlet.id,
      code: a.outlet.code,
      name: a.outlet.name,
      city: a.outlet.city,
      isDefault: a.isDefault,
    }));

  return {
    id: user.id,
    organizationId: user.organizationId,
    username: user.username,
    displayName: user.displayName,
    role: user.role.toLowerCase() as "admin" | "manager" | "operator",
    isActive: user.isActive,
    assignedOutlets,
  };
}

/**
 * Requires an authenticated user, throwing an Error if unauthenticated.
 */
export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHORIZED: Authentication required");
  }
  return user;
}

/**
 * Resolves current role and authorized outlet scope from PostgreSQL.
 */
export async function resolveAuthorizedOutletScope(
  user: AuthenticatedUser,
  requestedOutletId?: string | null
): Promise<AuthorizedOutletScope> {
  // Case 1: Admin & Manager (CEO)
  // Both have organization-level visibility across all outlets
  if (user.role === "admin" || user.role === "manager") {
    const allOutlets = await prisma.outlet.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      select: { id: true, code: true, name: true, city: true },
      orderBy: { code: "asc" },
    });

    if (requestedOutletId && requestedOutletId !== "all") {
      const match = allOutlets.find((o) => o.id === requestedOutletId || o.code === requestedOutletId);
      if (!match) {
        throw new Error("FORBIDDEN: Target outlet does not exist in this organization.");
      }
      return {
        targetOutletId: match.id,
        targetOutlet: match,
        allowedOutlets: allOutlets,
        isConsolidated: false,
      };
    }

    return {
      targetOutletId: undefined,
      targetOutlet: undefined,
      allowedOutlets: allOutlets,
      isConsolidated: true,
    };
  }

  // Case 2: Operator (floor users)
  if (user.assignedOutlets.length === 0) {
    throw new Error("FORBIDDEN: User has no active assigned outlets.");
  }

  const allowedOutlets = user.assignedOutlets.map((o) => ({
    id: o.id,
    code: o.code,
    name: o.name,
    city: o.city,
  }));

  // Operator cannot switch outlets: always uses their assigned outlet
  const target = user.assignedOutlets[0];
  return {
    targetOutletId: target.id,
    targetOutlet: target,
    allowedOutlets,
    isConsolidated: false,
  };
}

/**
 * Safely resolves an unambiguous target outlet for writing operational records
 * (e.g., preparation, wastage, breakage, department creation).
 *
 * Rules:
 * 1. If an explicit requestedOutletId is supplied, verify it belongs to user's scope.
 * 2. If user has an unambiguous target (e.g. operator with single assignment, or single assigned outlet), use it.
 * 3. If user has organization-wide scope (Admin/Manager):
 *    - If there is exactly ONE active outlet in the organization, use it safely.
 *    - If there are MULTIPLE active outlets and no unambiguous target was passed,
 *      throw an explicit error rather than silently defaulting to the first outlet.
 * 4. Ensures the target outlet belongs strictly to the user's organization.
 */
export async function resolveSafeWriteOutletId(
  user: AuthenticatedUser,
  requestedOutletId?: string | null
): Promise<string> {
  const scope = await resolveAuthorizedOutletScope(user, requestedOutletId);

  // If explicit outlet was requested and resolved by scope
  if (scope.targetOutletId) {
    return scope.targetOutletId;
  }

  // If consolidated (Admin or Manager with no explicit target specified)
  if (scope.isConsolidated) {
    if (scope.allowedOutlets.length === 1) {
      return scope.allowedOutlets[0].id;
    }
    if (scope.allowedOutlets.length === 0) {
      throw new Error("INVALID_OUTLET: No active outlet found for this organization.");
    }
    throw new Error(
      "AMBIGUOUS_OUTLET: Multiple active outlets exist for your organization. Please specify an unambiguous target outlet."
    );
  }

  // For users with assigned outlets (e.g. Operator)
  if (scope.allowedOutlets.length === 1) {
    return scope.allowedOutlets[0].id;
  }

  if (scope.allowedOutlets.length > 1) {
    throw new Error(
      "AMBIGUOUS_OUTLET: Multiple outlets assigned to user. Please specify a target outlet."
    );
  }

  throw new Error("INVALID_OUTLET: No authorized outlet available for record creation.");
}

/**
 * Creates a server-side session in PostgreSQL, hashes its token, and sets the secure cookie.
 */
export async function createSessionCookie(
  payload: Omit<SessionPayload, "expiresAt" | "sessionId">,
  meta?: { ipAddress?: string; userAgent?: string }
): Promise<string> {
  const cookieStore = await cookies();
  const expiresAtSec = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const expiresAtDate = new Date(expiresAtSec * 1000);
  const sessionId = crypto.randomUUID();

  const fullPayload: SessionPayload = {
    ...payload,
    sessionId,
    expiresAt: expiresAtSec,
  };

  const token = await sealSession(fullPayload);
  const tokenHash = await hashSessionToken(token);

  // Persist session to PostgreSQL
  await prisma.userSession.create({
    data: {
      id: sessionId,
      userId: payload.userId,
      sessionTokenHash: tokenHash,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
      expiresAt: expiresAtDate,
    },
  });

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return token;
}

/**
 * Server-side session revocation:
 * Marks the active session record in PostgreSQL as revoked (`revokedAt = now`)
 * and clears the browser cookie.
 */
export async function destroySessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    try {
      const tokenHash = await hashSessionToken(token);
      await prisma.userSession.updateMany({
        where: { sessionTokenHash: tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch (e) {
      console.error("[Session Revocation Error]:", e);
    }
  }

  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

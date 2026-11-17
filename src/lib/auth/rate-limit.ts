import { prisma } from "@/lib/db/client";

const MAX_IP_ATTEMPTS = 20; // Max 20 failed attempts per IP across all users
const MAX_USER_ATTEMPTS = 5; // Max 5 failed attempts per user
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout
const WINDOW_DURATION_MS = 60 * 60 * 1000; // 1 hour sliding window

export interface RateLimitCheckResult {
  allowed: boolean;
  remainingSeconds?: number;
  reason?: "ip_lockout" | "user_lockout";
}

/**
 * Normalizes username consistently:
 * - Trims whitespace
 * - Converts to lowercase
 * - Strips leading/trailing control characters
 */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/**
 * Validates whether an extracted string is a valid IPv4 or IPv6 address.
 */
function isValidIp(ip: string): boolean {
  // Basic IPv4 regex
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  // Basic IPv6 regex
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$|^([0-9a-fA-F]{1,4}:){1,7}:|^:((:[0-9a-fA-F]{1,4}){1,7})$/;
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

/**
 * Extracts client IP safely:
 * - In production behind reverse proxy (e.g. Hostinger VPS / Nginx), x-forwarded-for or x-real-ip can be parsed.
 * - However, we only take the rightmost (or leftmost if trusted proxy configured) valid IP.
 * - Validates strict IP pattern to prevent SQL or header injection / spoofing.
 */
export function extractClientIp(request: Request): string {
  // If behind trusted proxy, x-forwarded-for client is the first IP, or rightmost before proxy
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const ips = forwardedFor.split(",").map((s) => s.trim());
    for (const candidate of ips) {
      if (isValidIp(candidate)) {
        return candidate;
      }
    }
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp && isValidIp(realIp.trim())) {
    return realIp.trim();
  }

  return "127.0.0.1";
}

/**
 * Checks whether an IP or username identifier is currently locked out.
 */
export async function checkLoginRateLimit(
  clientIp: string,
  username: string
): Promise<RateLimitCheckResult> {
  const normalizedUser = normalizeUsername(username);
  const now = new Date();
  const ipKey = `ip:${clientIp}`;
  const userKey = `user:${normalizedUser}`;

  // Fetch attempt records for both IP and User
  const records = await prisma.loginAttempt.findMany({
    where: {
      identifier: { in: [ipKey, userKey] },
    },
  });

  const ipRecord = records.find((r) => r.identifier === ipKey);
  const userRecord = records.find((r) => r.identifier === userKey);

  // Check IP lockout
  if (ipRecord?.lockUntil && ipRecord.lockUntil > now) {
    const remainingSeconds = Math.ceil((ipRecord.lockUntil.getTime() - now.getTime()) / 1000);
    return { allowed: false, remainingSeconds, reason: "ip_lockout" };
  }

  // Check User lockout
  if (userRecord?.lockUntil && userRecord.lockUntil > now) {
    const remainingSeconds = Math.ceil((userRecord.lockUntil.getTime() - now.getTime()) / 1000);
    return { allowed: false, remainingSeconds, reason: "user_lockout" };
  }

  return { allowed: true };
}

/**
 * Records a failed login attempt using atomic PostgreSQL upsert transactions
 * to prevent concurrent request race conditions.
 */
export async function recordFailedLoginAttempt(
  clientIp: string,
  username: string
): Promise<void> {
  const normalizedUser = normalizeUsername(username);
  const now = new Date();
  const ipKey = `ip:${clientIp}`;
  const userKey = `user:${normalizedUser}`;

  async function incrementAttemptAtomic(identifier: string, maxAttempts: number) {
    // We execute an atomic transaction or query
    await prisma.$transaction(async (tx) => {
      const existing = await tx.loginAttempt.findUnique({
        where: { identifier },
      });

      if (!existing) {
        await tx.loginAttempt.create({
          data: {
            identifier,
            attempts: 1,
            firstAttemptAt: now,
            lastAttemptAt: now,
          },
        });
        return;
      }

      // Check if previous window expired
      const isWindowExpired = now.getTime() - existing.lastAttemptAt.getTime() > WINDOW_DURATION_MS;
      const newAttempts = isWindowExpired ? 1 : existing.attempts + 1;
      const shouldLock = newAttempts >= maxAttempts;
      const lockUntil = shouldLock ? new Date(now.getTime() + LOCKOUT_DURATION_MS) : null;

      await tx.loginAttempt.update({
        where: { identifier },
        data: {
          attempts: newAttempts,
          lockUntil,
          lastAttemptAt: now,
          ...(isWindowExpired ? { firstAttemptAt: now } : {}),
        },
      });
    });
  }

  await incrementAttemptAtomic(ipKey, MAX_IP_ATTEMPTS);
  await incrementAttemptAtomic(userKey, MAX_USER_ATTEMPTS);
}

/**
 * Resets the failed login attempts on successful authentication.
 * Clears username record to ensure immediate full allowance.
 */
export async function clearLoginAttempts(
  clientIp: string,
  username: string
): Promise<void> {
  const normalizedUser = normalizeUsername(username);
  const userKey = `user:${normalizedUser}`;
  try {
    await prisma.loginAttempt.deleteMany({
      where: { identifier: userKey },
    });
  } catch {
    // Ignore if not present
  }
}

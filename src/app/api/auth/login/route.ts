import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionCookie } from "@/lib/auth/scope";
import {
  extractClientIp,
  checkLoginRateLimit,
  recordFailedLoginAttempt,
  clearLoginAttempts,
} from "@/lib/auth/rate-limit";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password || typeof username !== "string" || typeof password !== "string") {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    const cleanUsername = username.trim().toLowerCase();
    const clientIp = extractClientIp(request);
    const userAgent = request.headers.get("user-agent") || undefined;

    // 1. Check persistent PostgreSQL rate limiting (both IP and Username)
    const rateCheck = await checkLoginRateLimit(clientIp, cleanUsername);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: `Too many failed login attempts. Please try again in ${rateCheck.remainingSeconds || 900} seconds.`,
        },
        { status: 429 }
      );
    }

    // 2. Lookup user in PostgreSQL
    const user = await prisma.userAccount.findUnique({
      where: { username: cleanUsername },
    });

    // Constant-time failure simulation to avoid user enumeration timing attacks
    if (!user || !user.isActive) {
      await recordFailedLoginAttempt(clientIp, cleanUsername);
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    // 3. Verify Argon2id password hash
    const isValid = await verifyPassword(user.passwordHash, password);
    if (!isValid) {
      await recordFailedLoginAttempt(clientIp, cleanUsername);
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    // 4. Success: Clear login attempts for username
    await clearLoginAttempts(clientIp, cleanUsername);

    // 5. Create server-side session in PostgreSQL & set signed HTTP-only cookie
    const roleLower = user.role.toLowerCase() as "admin" | "manager" | "operator";
    await createSessionCookie(
      {
        userId: user.id,
        role: roleLower,
        username: user.username,
        displayName: user.displayName,
      },
      {
        ipAddress: clientIp,
        userAgent,
      }
    );

    // 6. Role-based redirect
    let redirectUrl = "/dashboard";
    if (roleLower === "manager") {
      redirectUrl = "/dashboard/wastage";
    } else if (roleLower === "operator") {
      redirectUrl = "/operator/entry";
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: roleLower,
      },
      redirectUrl,
    });
  } catch (error) {
    console.error("[Login API Error]:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred during login. Please try again." },
      { status: 500 }
    );
  }
}

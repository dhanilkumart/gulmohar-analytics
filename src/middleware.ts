import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { unsealSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";

// Public paths that do not require an active session
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/webhooks/petpooja",
  "/favicon.ico",
];

// Paths restricted strictly to Admin (excluding Manager/CEO)
const ADMIN_ONLY_PREFIXES = [
  "/dashboard/outlets",
  "/api/admin/outlets",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Allow public paths and Next.js internal static assets
  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // 2. Read session cookie
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await unsealSession(token) : null;

  // 3. If unauthenticated, handle API vs page redirect
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized: Active session required" }, { status: 401 });
    }
    // If accessing root '/' or page while unauthenticated, go to login
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("returnUrl", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // 4. Role-based route enforcement
  const { role } = session;

  // Operator routing:
  // Operator is restricted to /operator/* (or their entry portal)
  if (role === "operator") {
    if (pathname.startsWith("/api/admin")) {
      return NextResponse.json({ error: "Forbidden: Admin privileges required" }, { status: 403 });
    }
    if (pathname.startsWith("/dashboard")) {
      return NextResponse.redirect(new URL("/operator/entry", request.url));
    }
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/operator/entry", request.url));
    }
    return NextResponse.next();
  }

  // Manager routing:
  // Manager (CEO) has organization-wide access identical to Admin except outlet management
  if (role === "manager") {
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    if (pathname.startsWith("/operator")) {
      return NextResponse.next();
    }
    if (ADMIN_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Forbidden: Admin privileges required" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  // Admin routing:
  // Admin has full access to all modules
  if (role === "admin") {
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

import { NextResponse } from "next/server";
import { getCurrentUser, resolveAuthorizedOutletScope } from "@/lib/auth/scope";

/**
 * GET /api/dashboard/outlets
 * Returns the list of outlets the current authenticated user is authorized to access,
 * and the currently active/resolved outlet.
 */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role === "operator") {
      return NextResponse.json({ error: "Forbidden: Operators use floor portal" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const requestedOutletId = searchParams.get("outletId");

    const scope = await resolveAuthorizedOutletScope(user, requestedOutletId);

    return NextResponse.json({
      success: true,
      role: user.role,
      activeOutletId: scope.targetOutletId || (scope.isConsolidated ? "all" : scope.allowedOutlets[0]?.id),
      activeOutlet: scope.targetOutlet || (scope.allowedOutlets.length === 1 ? scope.allowedOutlets[0] : null),
      isConsolidated: scope.isConsolidated,
      canSwitch: user.role === "admin" || scope.allowedOutlets.length > 1,
      totalOutlets: scope.allowedOutlets.length,
      outlets: user.role === "manager" ? [] : scope.allowedOutlets,
      allowedOutlets: user.role === "manager" ? [] : scope.allowedOutlets,
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message && err.message.startsWith("FORBIDDEN")) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("[Dashboard Outlets API Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

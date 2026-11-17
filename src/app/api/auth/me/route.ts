import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/scope";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      assignedOutlets: user.assignedOutlets,
    },
  });
}

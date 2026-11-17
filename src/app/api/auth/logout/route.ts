import { NextResponse } from "next/server";
import { destroySessionCookie } from "@/lib/auth/scope";

export async function POST() {
  await destroySessionCookie();
  return NextResponse.json({ success: true, redirectUrl: "/login" });
}

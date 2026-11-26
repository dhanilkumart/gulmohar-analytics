import { NextResponse } from "next/server";
import { isOrderDate, requireOrdersContext } from "@/lib/data/orders";
import { prisma } from "@/lib/db/client";
import { DEFAULT_MAX_PAGES, PETPOOJA_PAGE_SIZE_LIMIT, PetpoojaGetOrdersClient, PetpoojaTimeoutError } from "@/lib/petpooja/get-orders-client";
import type { PetpoojaGetOrdersResponse } from "@/types/petpooja";

// Preview only: never call the sync orchestrator, normalizer or ingestion service.
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const context = await requireOrdersContext();
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: "Forbidden origin" }, { status: 403, headers });
    }
    let body: unknown;
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: "Invalid JSON request" }, { status: 400, headers });
    }
    const date = body && typeof body === "object" && "date" in body ? body.date : null;
    if (!isOrderDate(date)) {
      return NextResponse.json({ error: "Choose a valid order date" }, { status: 400, headers });
    }
    const outlet = await prisma.outlet.findFirst({
      where: { id: context.outletId, organizationId: context.organizationId, isActive: true },
      select: { petpoojaRestId: true },
    });
    if (!outlet?.petpoojaRestId) {
      return NextResponse.json({ error: "Petpooja restaurant mapping is not configured" }, { status: 500, headers });
    }
    const client = new PetpoojaGetOrdersClient({ restId: outlet.petpoojaRestId });
    // Validate without returning credential values or upstream error bodies.
    try { client.validateConfig(); } catch {
      return NextResponse.json({ error: "Petpooja credentials are not fully configured" }, { status: 500, headers });
    }
    const pages: PetpoojaGetOrdersResponse[] = [];
    const cursors = new Set<string>();
    let cursor = "";
    for (let index = 0; index < DEFAULT_MAX_PAGES; index++) {
      const page = await client.fetchPage(date, cursor, { signal: request.signal });
      const orders = page.order_json ?? [];
      if (orders.some(entry => entry.Restaurant?.restID?.trim() !== outlet.petpoojaRestId || !entry.Order || !Array.isArray(entry.OrderItem))) {
        return NextResponse.json({ error: "Petpooja returned an unexpected restaurant or order structure" }, { status: 502, headers });
      }
      pages.push(page);
      if (orders.length < PETPOOJA_PAGE_SIZE_LIMIT) {
        return NextResponse.json({ requestedDate: date, pages }, { headers });
      }
      const next = orders.at(-1)?.Order.refId?.trim();
      if (!next || cursors.has(next)) break;
      cursors.add(next);
      cursor = next;
    }
    return NextResponse.json({ error: "Petpooja pagination did not complete; no partial result is displayed" }, { status: 502, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message.startsWith("UNAUTHORIZED") ? 401 : message.startsWith("FORBIDDEN") ? 403 : message.startsWith("CONFIGURATION") ? 500 : error instanceof PetpoojaTimeoutError ? 504 : 502;
    const safeError = status === 401 ? "Unauthorized: Active session required" : status === 403 ? "Forbidden: Management access to the configured outlet required" : status === 500 ? "Configured outlet is unavailable" : "Unable to fetch Petpooja orders. Please try again.";
    return NextResponse.json({ error: safeError }, { status, headers });
  }
}

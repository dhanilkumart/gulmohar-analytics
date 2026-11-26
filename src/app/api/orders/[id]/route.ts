import { NextResponse } from "next/server";
import { getOrderDetail, requireOrdersContext } from "@/lib/data/orders";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const context = await requireOrdersContext();
    const { id } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: "Invalid order identifier" }, { status: 400, headers });
    }
    const order = await getOrderDetail(context, id);
    return order ? NextResponse.json({ order }, { headers })
      : NextResponse.json({ error: "Order not found" }, { status: 404, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message.startsWith("UNAUTHORIZED") ? 401 : message.startsWith("FORBIDDEN") ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? "Unable to load order details" : message }, { status, headers });
  }
}

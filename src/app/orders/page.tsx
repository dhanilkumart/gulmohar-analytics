import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PageContainer } from "@/components/layout/page-container";
import { OrdersPageClient } from "@/components/orders/orders-page-client";
import { getOrdersPage, requireOrdersContext } from "@/lib/data/orders";
import { parseGlobalRangeParams, type RawSearchParams } from "@/lib/date-range-params";
import type { OrdersPageData } from "@/types/order";

export const metadata = { title: "Orders — Gulmohar Insights" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const { range } = parseGlobalRangeParams(params);
  const requestedPage = Number(Array.isArray(params.page) ? params.page[0] : params.page ?? 1);
  let data: OrdersPageData | null = null;
  let loadError: string | null = null;
  try {
    const context = await requireOrdersContext();
    data = await getOrdersPage(context, range, requestedPage);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("UNAUTHORIZED")) redirect("/login?returnUrl=/orders");
    if (message === "FORBIDDEN: Orders require management access") redirect("/operator/entry");
    loadError = message.startsWith("VALIDATION") || message.startsWith("CONFIGURATION") || message.startsWith("FORBIDDEN") ? message : "Unable to load orders. Please try again.";
  }
  return <AppShell><PageContainer title="Orders">{data ? <OrdersPageClient data={data} range={range} /> : <div role="alert" className="surface-card rounded-xl border p-6 text-sm text-destructive">{loadError}</div>}</PageContainer></AppShell>;
}

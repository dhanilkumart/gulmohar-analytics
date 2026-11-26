"use client";

import { useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionHeader } from "@/components/dashboard/ui-kit";
import { OrderDetailsSheet } from "./order-details-sheet";
import { OrdersTable, petpoojaOrderDetail } from "./orders-table";
import type { OrderDetail, OrderSummary, OrdersPageData, PetpoojaOrdersPreview } from "@/types/order";
import type { DateRange } from "@/lib/analytics/date-range";

export function OrdersPageClient({ data, range }: { data: OrdersPageData; range: DateRange }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [fetchDate, setFetchDate] = useState(range.to);
  const [preview, setPreview] = useState<PetpoojaOrdersPreview | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState(1);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailRequest = useRef<AbortController | null>(null);
  const previewOrders = useMemo(() => (preview?.pages.flatMap(page => page.order_json ?? []) ?? []).map(petpoojaOrderDetail), [preview]);

  function navigate(page: number, dates?: DateRange) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("page", String(page));
    if (dates) { next.set("range", "custom"); next.set("from", dates.from); next.set("to", dates.to); }
    startTransition(() => router.replace(`/orders?${next}`, { scroll: false }));
  }

  function applyDates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const from = String(form.get("from"));
    const to = String(form.get("to"));
    if (from > to) { (event.currentTarget.elements.namedItem("to") as HTMLInputElement).setCustomValidity("End date must be on or after start date"); event.currentTarget.reportValidity(); return; }
    navigate(1, { from, to });
  }

  async function selectDatabase(order: OrderSummary) {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setDetail(null); setDetailError(null); setDetailOpen(true); setDetailLoading(true);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(order.id)}`, { cache: "no-store", signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load order details");
      if (!controller.signal.aborted) setDetail(result.order);
    } catch (error) {
      if (!controller.signal.aborted) setDetailError(error instanceof Error ? error.message : "Unable to load order details");
    } finally { if (!controller.signal.aborted) setDetailLoading(false); }
  }

  function selectPreview(order: OrderSummary) {
    detailRequest.current?.abort();
    setDetail(previewOrders.find(row => row.id === order.id) ?? null);
    setDetailError(null); setDetailLoading(false); setDetailOpen(true);
  }

  async function fetchPetpooja(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFetching(true); setFetchError(null); setPreview(null); setPreviewPage(1);
    try {
      const response = await fetch("/api/orders/petpooja", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: fetchDate }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to fetch orders");
      setPreview(result);
    } catch (error) { setFetchError(error instanceof Error ? error.message : "Unable to fetch orders"); }
    finally { setFetching(false); }
  }

  return <>
    <section className="surface-card space-y-5 rounded-xl border p-4 sm:p-6" aria-label="Database orders">
      <SectionHeader title="Database orders" description="All order statuses · one row per order · business dates and IST times" />
      <div className="flex flex-wrap items-end gap-3">
        <form className="flex flex-wrap items-end gap-3" key={`${range.from}-${range.to}`} onSubmit={applyDates}>
          <div className="space-y-1.5"><Label htmlFor="orders-from">From</Label><Input id="orders-from" type="date" name="from" required defaultValue={range.from} className="w-auto" /></div>
          <div className="space-y-1.5"><Label htmlFor="orders-to">To (inclusive)</Label><Input id="orders-to" type="date" name="to" required defaultValue={range.to} className="w-auto" onChange={event => event.currentTarget.setCustomValidity("")} /></div>
          <Button variant="outline" disabled={pending}>Apply range</Button>
        </form>
        <div className="space-y-1.5"><Label htmlFor="orders-single-date">Single date</Label><Input id="orders-single-date" type="date" className="w-auto" value={range.from === range.to ? range.from : ""} onChange={event => { if (event.target.value) navigate(1, { from: event.target.value, to: event.target.value }); }} /></div>
        <Button type="button" variant="ghost" disabled={pending || !data.bounds} onClick={() => { if (data.bounds) navigate(1, data.bounds); }}>All dates</Button>
      </div>
      <OrdersTable orders={data.orders} count={data.count} page={data.page} pageSize={data.pageSize} onPageChange={page => navigate(page)} onSelect={selectDatabase} pending={pending} />
    </section>

    <section className="surface-card space-y-5 rounded-xl border p-4 sm:p-6" aria-label="Petpooja orders preview">
      <SectionHeader title="Fetch Orders from Petpooja" description="Preview the API response. Fetching does not save or update database orders." />
      <form onSubmit={fetchPetpooja} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5"><Label htmlFor="petpooja-date">Order date</Label><Input id="petpooja-date" type="date" required className="w-auto" value={fetchDate} onChange={event => setFetchDate(event.target.value)} disabled={fetching} /></div>
        <Button disabled={fetching || !fetchDate}>{fetching ? "Fetching…" : "Get Data"}</Button>
      </form>
      {fetchError && <p role="alert" className="text-sm text-destructive">{fetchError}</p>}
      {fetching && <p role="status" className="text-sm text-muted-foreground">Fetching Petpooja response pages…</p>}
      {preview && <div className="space-y-3">
        <p className="text-xs text-muted-foreground">Requested {preview.requestedDate} · {previewOrders.length} returned orders · {preview.pages.length} response page(s). Petpooja may include adjacent business dates; both tabs show the same complete response.</p>
        <Tabs defaultValue="raw">
          <TabsList><TabsTrigger value="raw">Raw</TabsTrigger><TabsTrigger value="table">Table</TabsTrigger></TabsList>
          <TabsContent value="raw"><pre className="max-h-[600px] overflow-auto rounded-xl border bg-secondary/50 p-4 font-mono text-xs" aria-label="Raw Petpooja JSON">{JSON.stringify(preview.pages.length === 1 ? preview.pages[0] : preview.pages, null, 2)}</pre></TabsContent>
          <TabsContent value="table"><OrdersTable orders={previewOrders.slice((previewPage - 1) * 25, previewPage * 25)} count={previewOrders.length} page={previewPage} pageSize={25} onPageChange={setPreviewPage} onSelect={selectPreview} /></TabsContent>
        </Tabs>
      </div>}
    </section>
    <OrderDetailsSheet open={detailOpen} order={detail} loading={detailLoading} error={detailError} onOpenChange={open => { setDetailOpen(open); if (!open) detailRequest.current?.abort(); }} />
  </>;
}

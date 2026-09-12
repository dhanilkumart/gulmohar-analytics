"use client";

import { Suspense, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

/**
 * Application shell adapted from the Lovable UI's `AppShell`
 * (gulmohar-analytics-ui/src/components/app/app-shell.tsx): a
 * collapsible desktop sidebar plus a header/content column. This
 * replaces the previous plain `<Sidebar/><Header/>` composition in
 * `src/app/dashboard/layout.tsx` so the desktop collapse toggle (owned
 * here) and the sidebar it controls share state — there is exactly one
 * sidebar and one header on screen at a time; the mobile nav drawer
 * (inside Header) reuses the same `Sidebar` content rather than a
 * second shell.
 *
 * Page content (`children`) is unchanged by this step — each page still
 * owns its own `PageContainer` for title/description/max-width/padding.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="bg-background flex min-h-svh w-full">
      <aside
        className={cn(
          "border-sidebar-border bg-sidebar sticky top-0 hidden h-svh shrink-0 border-r transition-[width] duration-200 lg:block",
          collapsed ? "w-[84px]" : "w-64"
        )}
      >
        {/* Sidebar renders NavLink, which reads the current query string
            (via useSearchParams) to preserve the global date-range/
            comparison selection across navigation — that hook requires a
            Suspense boundary. */}
        <Suspense fallback={null}>
          <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((current) => !current)} />
        </Suspense>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header renders the date-range/comparison controls, which read
            the current selection via useSearchParams — same requirement. */}
        <Suspense
          fallback={
            <div className="border-border bg-background/85 sticky top-0 z-30 h-[57px] border-b" />
          }
        >
          <Header />
        </Suspense>
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}

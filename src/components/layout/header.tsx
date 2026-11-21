"use client";

import { Suspense, useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";
import { DateRangeControl } from "./date-range-control";
import { ComparisonControl } from "./comparison-control";
import { NotificationCenter } from "./notification-center";
import { UserMenu } from "./user-menu";

/**
 * Global sticky header. Adapted from the Lovable UI shell's `AppShell`
 * top bar (gulmohar-analytics-ui/src/components/app/app-shell.tsx):
 * mobile nav trigger + brand (mobile only, since the sidebar already
 * carries the brand on desktop), the global date-range/comparison
 * controls, the notification/management-attention control, and the
 * user menu.
 *
 * Per-page title/description are intentionally NOT rendered here — the
 * existing `PageContainer` component already renders them inside each
 * page's own content, and this step does not modify page content beyond
 * reading the resolved range. `DateRangeControl`/`ComparisonControl` are
 * placed here (global, shell-level) rather than per-page as in Lovable's
 * own `PageHeader`, since pages aren't being redesigned yet — this is
 * the same placement decision made for the earlier placeholder slot.
 */
export function Header() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="border-border bg-background/85 sticky top-0 z-30 flex items-center gap-3 border-b px-4 py-3 backdrop-blur-md sm:px-6">
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            aria-label="Open navigation"
            className="bg-card rounded-xl lg:hidden"
          >
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="bg-sidebar w-[280px] p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Suspense fallback={null}>
            <Sidebar onNavigate={() => setMobileNavOpen(false)} />
          </Suspense>
        </SheetContent>
      </Sheet>

      <div className="min-w-0 flex-1 lg:hidden">
        <p className="font-display truncate text-sm font-extrabold">ASHIRVAD GULMOHAR</p>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
        <DateRangeControl />
        <ComparisonControl />
        <NotificationCenter />
        <UserMenu />
      </div>
    </div>
  );
}

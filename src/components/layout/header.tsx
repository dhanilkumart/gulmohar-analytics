"use client";

import { Suspense, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";
import { DateRangeControl } from "./date-range-control";
import { NotificationCenter } from "./notification-center";
import { UserMenu } from "./user-menu";
import { getDashboardRouteMeta } from "./dashboard-route-meta";

/**
 * Global sticky header.
 *
 * Left side:
 * - Mobile nav trigger (mobile/tablet < lg)
 * - Dashboard page title and subtitle vertically centered and aligned to left
 *
 * Right side:
 * - Date range filter
 * - Notification center
 * - User profile menu
 * (Compare option has been removed per UI requirements)
 */
export function Header() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();
  const routeMeta = getDashboardRouteMeta(pathname);

  return (
    <div className="border-border bg-background/85 sticky top-0 z-30 flex items-center justify-between gap-3 border-b px-4 py-3 backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
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

        <div className="min-w-0">
          <h1 className="font-display truncate text-lg font-bold tracking-tight sm:text-xl text-foreground leading-tight">
            {routeMeta.title}
          </h1>
          {routeMeta.description ? (
            <p className="text-muted-foreground hidden truncate text-xs sm:block">
              {routeMeta.description}
            </p>
          ) : null}
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
        <DateRangeControl />
        <NotificationCenter />
        <UserMenu />
      </div>
    </div>
  );
}

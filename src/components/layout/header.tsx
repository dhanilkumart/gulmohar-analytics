import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SidebarNav } from "./sidebar-nav";

/** Top header bar. Owns the mobile nav drawer (the sidebar is desktop-only). */
export function Header() {
  return (
    <header className="bg-background flex h-14 shrink-0 items-center gap-3 border-b px-4 lg:px-6">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden">
            <Menu className="size-5" />
            <span className="sr-only">Open navigation</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle>Ashirvad Gulmohar</SheetTitle>
          </SheetHeader>
          <SidebarNav />
        </SheetContent>
      </Sheet>

      <span className="text-sm font-medium lg:hidden">Ashirvad Gulmohar</span>

      <div className="ml-auto flex items-center gap-3">
        <span className="text-muted-foreground text-sm">Pure Vegetarian</span>
      </div>
    </header>
  );
}

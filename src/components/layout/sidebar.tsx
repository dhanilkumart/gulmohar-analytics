import { SidebarNav } from "./sidebar-nav";

/** Desktop sidebar — hidden below the `lg` breakpoint in favor of the header's mobile drawer. */
export function Sidebar() {
  return (
    <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border hidden w-64 shrink-0 border-r lg:flex lg:flex-col">
      <div className="border-sidebar-border flex h-14 items-center border-b px-4">
        <span className="text-sm font-semibold">Ashirvad Gulmohar</span>
      </div>
      <SidebarNav />
    </aside>
  );
}

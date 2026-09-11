import type { ReactNode } from "react";

interface PageContainerProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

/** Responsive content container + heading used by every /dashboard/* page. */
export function PageContainer({ title, description, children }: PageContainerProps) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 lg:px-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

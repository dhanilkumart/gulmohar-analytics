import type { ReactNode } from "react";

interface PageContainerProps {
  title?: string;
  description?: string;
  children?: ReactNode;
  /** When true, renders the title/description block inside the content area. Defaults to false since titles are now in the global header. */
  showInnerHeading?: boolean;
}

/**
 * Responsive full-width content container used by every /dashboard/* page.
 * Title and subtitle are displayed in the global Header, avoiding duplicate titles.
 */
export function PageContainer({ title, description, children, showInnerHeading = false }: PageContainerProps) {
  return (
    <div className="flex w-full flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      {showInnerHeading && title ? (
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="text-muted-foreground text-sm">{description}</p>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

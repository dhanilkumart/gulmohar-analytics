import { Card, CardContent } from "@/components/ui/card";
import type { ResolvedGlobalRange } from "@/lib/date-range-params";

/**
 * `resolvedRange` is optional and only used to prove, during this
 * integration step, that the global date-range/comparison selection
 * reaches every page — it is not a real analytics widget.
 */
export function PlaceholderCard({
  note,
  resolvedRange,
}: {
  note: string;
  resolvedRange?: ResolvedGlobalRange;
}) {
  return (
    <Card>
      <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
        <p>{note}</p>
        {resolvedRange ? (
          <p className="text-xs">
            Active reporting period: <span className="font-medium">{resolvedRange.range.from}</span>{" "}
            to <span className="font-medium">{resolvedRange.range.to}</span>
            {resolvedRange.comparison === "previous" && resolvedRange.previousRange ? (
              <>
                {" "}
                — compared to{" "}
                <span className="font-medium">
                  {resolvedRange.previousRange.from} to {resolvedRange.previousRange.to}
                </span>
              </>
            ) : null}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

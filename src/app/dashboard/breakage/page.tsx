import { PageContainer } from "@/components/layout/page-container";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";

export default function BreakagePage() {
  return (
    <PageContainer
      title="Breakage"
      description="Manual breakage cost by item, reason and department."
    >
      <PlaceholderCard note="Breakage dashboard screen — not built yet. Backed by src/lib/analytics/breakage.ts." />
    </PageContainer>
  );
}

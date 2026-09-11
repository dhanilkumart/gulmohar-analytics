import { PageContainer } from "@/components/layout/page-container";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";

export default function WastagePage() {
  return (
    <PageContainer
      title="Wastage"
      description="Wastage cost, wastage %, sell-through %, and preparation vs. sold vs. wasted (tracked products only)."
    >
      <PlaceholderCard note="Wastage dashboard screen — not built yet. Backed by src/lib/analytics/wastage.ts and preparation.ts." />
    </PageContainer>
  );
}

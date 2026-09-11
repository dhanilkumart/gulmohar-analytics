import { PageContainer } from "@/components/layout/page-container";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";

export default function ReportsPage() {
  return (
    <PageContainer
      title="Reports"
      description="Estimated operational contribution and combined reporting views."
    >
      <PlaceholderCard note="Reports dashboard screen — not built yet. Backed by src/lib/analytics/summary.ts and operational-contribution.ts." />
    </PageContainer>
  );
}

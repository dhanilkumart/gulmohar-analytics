import { PageContainer } from "@/components/layout/page-container";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";

export default function DashboardOverviewPage() {
  return (
    <PageContainer
      title="Overview"
      description="Restaurant-wide KPIs across sales, profitability, wastage and manpower."
    >
      <PlaceholderCard note="Overview dashboard screen — not built yet. Application scaffolding only." />
    </PageContainer>
  );
}

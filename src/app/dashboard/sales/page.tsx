import { PageContainer } from "@/components/layout/page-container";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";

export default function SalesPage() {
  return (
    <PageContainer
      title="Sales"
      description="Daily, weekly, monthly and yearly sales, order count and item quantities."
    >
      <PlaceholderCard note="Sales dashboard screen — not built yet. Backed by src/lib/analytics/sales.ts." />
    </PageContainer>
  );
}

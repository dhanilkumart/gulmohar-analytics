import { PageContainer } from "@/components/layout/page-container";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";

export default function ProfitabilityPage() {
  return (
    <PageContainer
      title="Profitability"
      description="Food cost, gross food margin, and product-level profitability."
    >
      <PlaceholderCard note="Profitability dashboard screen — not built yet. Backed by src/lib/analytics/profitability.ts." />
    </PageContainer>
  );
}

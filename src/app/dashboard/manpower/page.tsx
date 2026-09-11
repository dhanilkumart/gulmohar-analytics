import { PageContainer } from "@/components/layout/page-container";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";

export default function ManpowerPage() {
  return (
    <PageContainer
      title="Manpower"
      description="Attendance, working hours, department headcount vs. benchmark, and labor-cost estimates."
    >
      <PlaceholderCard note="Manpower dashboard screen — not built yet. Backed by src/lib/analytics/attendance.ts and manpower.ts." />
    </PageContainer>
  );
}

import { requireUser } from "@/lib/auth/scope";
import { redirect } from "next/navigation";
import { PageContainer } from "@/components/layout/page-container";
import { MasterDataDashboard } from "@/components/admin/master-data-dashboard";

export const metadata = {
  title: "Master Data Management | Gulmohar Restaurant",
  description: "Admin Master Data Management for Departments, Products, Ingredients, Recipes, Breakage Items, and Reasons",
};

export default async function MasterDataPage() {
  const user = await requireUser();

  // Defense-in-depth: admin and manager (CEO) can access master data
  if (user.role !== "admin" && user.role !== "manager") {
    redirect("/dashboard/wastage");
  }

  return (
    <PageContainer
      title="Master Data Management"
      description="Organization-level catalogs, outlet assignments, menu products, preparation items, ingredients, recipes, breakage items, and standardized reasons."
    >
      <MasterDataDashboard />
    </PageContainer>
  );
}

import { requireUser } from "@/lib/auth/scope";
import { redirect } from "next/navigation";
import { PageContainer } from "@/components/layout/page-container";
import { MasterDataDashboard } from "@/components/admin/master-data-dashboard";

export const metadata = {
  title: "Master Data Management | Ashirvad Gulmohar",
  description: "Admin Master Data Management for Departments, Products, Ingredients, Recipes, Breakage Items, and Reasons",
};

export default async function MasterDataPage() {
  const user = await requireUser();

  // Defense-in-depth: only admin can access this page
  if (user.role !== "admin") {
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

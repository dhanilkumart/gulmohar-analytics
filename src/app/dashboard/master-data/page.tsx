import { requireUser } from "@/lib/auth/scope";
import { redirect } from "next/navigation";
import { MasterDataDashboard } from "@/components/admin/master-data-dashboard";

export const metadata = {
  title: "Master Data Management | Ashirvad Gulmohar",
  description: "Admin Master Data Management for Departments, Products, Ingredients, and Recipes",
};

export default async function MasterDataPage() {
  const user = await requireUser();

  // Defense-in-depth: only admin can access this page
  if (user.role !== "admin") {
    redirect("/dashboard/wastage");
  }

  return (
    <div className="space-y-6">
      <MasterDataDashboard />
    </div>
  );
}

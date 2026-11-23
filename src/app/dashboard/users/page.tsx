import { requireUser } from "@/lib/auth/scope";
import { redirect } from "next/navigation";
import { PageContainer } from "@/components/layout/page-container";
import { UsersManagementDashboard } from "@/components/admin/users-management-dashboard";

export const metadata = {
  title: "User Management | Gulmohar Restaurant",
  description: "User and Role Management for Staff and System Operators",
};

export default async function UserManagementPage() {
  const user = await requireUser();

  // Defense-in-depth: only admin and manager (CEO) can access this page
  if (user.role !== "admin" && user.role !== "manager") {
    redirect("/dashboard/wastage");
  }

  return (
    <PageContainer
      title="User Management"
      description="Manage application accounts, system roles, and outlet floor access for your organization."
    >
      <UsersManagementDashboard />
    </PageContainer>
  );
}


import { resolveRestaurantContext } from "@/lib/context/restaurant-context";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/scope";
import { OperatorPortal } from "@/components/operator/operator-portal";

export const metadata = {
  title: "Operator Portal — Gulmohar Restaurant",
  description: "Floor operations data entry for kitchen food waste and tableware breakage.",
};

export default async function OperatorEntryPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login?returnUrl=/operator/entry");
  }

  // Operator and Manager can access Operator entry. If Admin visits, they can also access or test it.
  const { outlet: activeOutlet } = await resolveRestaurantContext(user);

  return <OperatorPortal user={user} outlet={activeOutlet} />;
}

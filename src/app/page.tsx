import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Ashirvad Gulmohar Restaurant Intelligence
        </h1>
        <p className="text-muted-foreground mx-auto max-w-md">
          Sales, profitability, wastage and manpower analytics for Ashirvad
          Gulmohar.
        </p>
      </div>
      <Button asChild>
        <Link href="/dashboard">Go to dashboard</Link>
      </Button>
    </div>
  );
}

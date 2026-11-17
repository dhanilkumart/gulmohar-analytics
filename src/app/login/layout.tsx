import { Suspense } from "react";
import LoginPage from "./page";

export default function LoginRoute() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-muted/40" />}>
      <LoginPage />
    </Suspense>
  );
}

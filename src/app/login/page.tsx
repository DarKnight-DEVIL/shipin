import { Suspense } from "react";
import LoginClient from "./LoginClient";
import LoginSkeleton from "@/components/ui/LoginSkeleton";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginClient />
    </Suspense>
  );
}
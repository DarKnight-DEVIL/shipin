import { Suspense } from "react";
import VerifyEmailClient from "@/components/auth/VerifyEmailClient";
import "@/styles/verify-email.css";

export const metadata = {
  title: "Verify your email",
  description: "Confirm your email address to complete your ShipIN account.",
};

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="verify verify--boot" aria-busy="true" />}>
      <VerifyEmailClient />
    </Suspense>
  );
}
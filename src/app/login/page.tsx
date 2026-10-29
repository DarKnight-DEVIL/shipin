import { Suspense } from "react";
import LoginClient from "./LoginClient";
import "./login.css";

export default function LoginPage() {
  // The fallback is just the themed dark background, so there is no flash of a
  // different style while the client component loads.
  return (
    <Suspense fallback={<main className="login login--boot" aria-busy="true" />}>
      <LoginClient />
    </Suspense>
  );
}
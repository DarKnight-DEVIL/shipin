"use client";

import { auth } from "@/lib/firebase";
import {
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";

export default function LoginPage() {
  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();

      const result = await signInWithPopup(auth, provider);

      console.log("Logged in user:", result.user);

      alert(`Welcome ${result.user.displayName}`);
    } catch (error) {
      console.error(error);
      alert("Login failed");
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
      <div className="bg-slate-900 p-10 rounded-2xl border border-slate-800 w-[400px]">
        <h1 className="text-3xl font-bold mb-8 text-center text-purple-400">
          ShipIN Login
        </h1>

        <button
          onClick={handleGoogleLogin}
          className="w-full bg-white text-black py-3 rounded-xl font-semibold hover:bg-gray-200 transition"
        >
          Continue with Google
        </button>
      </div>
    </main>
  );
}
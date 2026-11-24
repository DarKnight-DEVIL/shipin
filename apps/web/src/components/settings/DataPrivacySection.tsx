"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

/**
 * Data deletion request, in the customer's own hands.
 *
 * The erasure endpoint existed but nothing in the UI called it, so a customer
 * could only ask support to delete their account. This is the self-service path:
 * type the word to confirm, POST, then sign out locally because the account the
 * session belongs to no longer exists.
 *
 * The endpoint refuses while financial obligations are open, and that message is
 * surfaced verbatim rather than swallowed.
 */
const CONFIRMATION = "DELETE";

export default function DataPrivacySection() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function eraseAccount() {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const user = auth.currentUser;
      if (!user) {
        setError("You are not signed in. Refresh the page and try again.");
        return;
      }

      const token = await user.getIdToken();
      const response = await fetch("/api/user/erase", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
      } | null;

      if (!response.ok || !payload?.success) {
        setError(
          payload?.error ??
            "We could not complete the deletion. Email support@shipin.co and we will finish it for you."
        );
        return;
      }

      setMessage("Your account and personal data have been deleted.");
      await signOut(auth).catch(() => undefined);
      router.push("/");
    } catch {
      setError(
        "We could not reach the server. Try again, or email support@shipin.co."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-red-900/40 bg-red-950/20 p-5">
      <h2 className="text-base font-semibold text-white">
        Delete my account and data
      </h2>
      <p className="mt-2 text-sm text-slate-300">
        This anonymises your profile and request records, deletes your sign-in
        account and cannot be undone. Requests that still have an open payment,
        refund or shipment are blocked until they are settled, so nothing is
        lost mid-transaction. See the{" "}
        <a
          href="/privacy-policy#your-rights"
          className="text-orange-300 underline hover:text-orange-200"
        >
          data rights section
        </a>{" "}
        of our Privacy Policy.
      </p>

      <label
        className="mt-4 block text-sm text-slate-300"
        htmlFor="erase-confirm"
      >
        Type <strong>{CONFIRMATION}</strong> to confirm
      </label>
      <input
        id="erase-confirm"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        disabled={busy}
        autoComplete="off"
        className="mt-2 w-full max-w-xs rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-red-500"
      />

      <div className="mt-4">
        <button
          type="button"
          onClick={eraseAccount}
          disabled={busy || query.trim().toUpperCase() !== CONFIRMATION}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Deleting…" : "Delete my account"}
        </button>
      </div>

      {message && (
        <p role="status" className="mt-3 text-sm text-emerald-300">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}

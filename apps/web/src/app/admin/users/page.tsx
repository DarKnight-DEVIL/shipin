"use client";

/**
 * Admin user management.
 *
 * Lists every account and lets an administrator grant or revoke admin
 * access. The server enforces the two safety rules (no self-demotion, never
 * demote the last administrator), so this page only mirrors them in the UI.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { ShieldCheck, Trash2, UserCog } from "lucide-react";

import { auth } from "@/lib/firebase";
import { customerApi, CustomerApiError } from "@/lib/customerApiClient";

type AssignableRole = "admin" | "customer";

interface AdminUserRow {
  uid: string;
  email: string;
  displayName: string;
  role: AssignableRole;
  mfaEnabled: boolean;
  /** From Auth: the profile copy is only written by the override below. */
  emailVerified: boolean;
  createdAt: number | null;
}

interface UsersPageResponse {
  users: AdminUserRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Which row has the reason prompt open, and what has been typed into it.
  const [verifyingUid, setVerifyingUid] = useState<string | null>(null);
  const [verifyReason, setVerifyReason] = useState("");
  /*
   * The row whose deletion panel is open, plus what has been typed into it. Kept as
   * the whole row rather than a uid so the panel can name the account it will delete
   * even after the list beneath it refreshes.
   */
  const [pendingDelete, setPendingDelete] = useState<AdminUserRow | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteEmail, setDeleteEmail] = useState("");
  const [signedInUid, setSignedInUid] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      /*
       * The route serves pages; the table searches and acts on the whole book
       * (a role change must see every admin), so the pages are collected here.
       */
      const users: AdminUserRow[] = [];
      let cursor: string | null = null;

      for (let page = 0; page < 200; page += 1) {
        const search: string = cursor
          ? `?cursor=${encodeURIComponent(cursor)}`
          : "";
        const result: UsersPageResponse = await customerApi<UsersPageResponse>(
          `/api/admin/users${search}`,
          { method: "GET" }
        );

        users.push(...result.users);

        if (!result.hasMore || !result.nextCursor) break;
        cursor = result.nextCursor;
      }

      setUsers(users);
    } catch (caught) {
      setError(
        caught instanceof CustomerApiError
          ? caught.message
          : "Could not load users."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Load from the auth subscription callback so the list follows the signed-in
  // administrator instead of running on every mount.
  useEffect(
    () =>
      onAuthStateChanged(auth, (signedIn) => {
        // The server refuses deleting yourself; hiding the button says so earlier.
        setSignedInUid(signedIn?.uid ?? null);
        void load();
      }),
    [load]
  );

  async function changeRole(user: AdminUserRow) {
    const nextRole: AssignableRole =
      user.role === "admin" ? "customer" : "admin";

    setBusyUid(user.uid);
    setError(null);
    setMessage(null);

    try {
      await customerApi("/api/admin/users", {
        method: "PATCH",
        body: { uid: user.uid, role: nextRole },
      });

      setUsers((rows) =>
        rows.map((row) =>
          row.uid === user.uid ? { ...row, role: nextRole } : row
        )
      );
      setMessage(
        `${user.email || user.uid} is now ${nextRole === "admin" ? "an administrator" : "a customer"}.`
      );
    } catch (caught) {
      setError(
        caught instanceof CustomerApiError
          ? caught.message
          : "Could not change that role."
      );
    } finally {
      setBusyUid(null);
    }
  }

  /**
   * Verify an address on the customer's behalf.
   *
   * This bypasses a security control, so the reason is not optional: the server
   * rejects a call without one and records it in `adminAuditLog`. The prompt is
   * inline rather than `window.prompt` so the flow can be driven by a keyboard,
   * announced by a screen reader, and tested.
   */
  async function verifyEmail(user: AdminUserRow, reason: string) {
    setBusyUid(user.uid);
    setError(null);
    setMessage(null);

    try {
      await customerApi(`/api/admin/users/${user.uid}/verify-email`, {
        method: "POST",
        body: { reason: reason.trim() },
      });

      setUsers((rows) =>
        rows.map((row) =>
          row.uid === user.uid ? { ...row, emailVerified: true } : row
        )
      );
      setMessage(
        `${user.email || user.uid} is verified. They must sign out and back in before the dashboard accepts their token.`
      );
      setVerifyingUid(null);
      setVerifyReason("");
    } catch (caught) {
      const alreadyVerified =
        caught instanceof CustomerApiError &&
        // The address was verified elsewhere between loading the list and now.
        /already verified/i.test(caught.message);

      if (alreadyVerified) {
        setUsers((rows) =>
          rows.map((row) =>
            row.uid === user.uid ? { ...row, emailVerified: true } : row
          )
        );
        setMessage(
          `${user.email || user.uid} was already verified. The list has been refreshed.`
        );
        setVerifyingUid(null);
        setVerifyReason("");
        return;
      }

      setError(
        caught instanceof CustomerApiError
          ? caught.message
          : "Could not verify that address."
      );
    } finally {
      setBusyUid(null);
    }
  }

  /**
   * Delete a throwaway account.
   *
   * This is the only irreversible action on the page, so the panel asks for the
   * address to be typed out and the server checks that same address itself: a
   * mistouched row cannot destroy an account. Accounts with orders or wallet history
   * are refused by the route (they go through the anonymising erasure flow instead),
   * which is why the failure message is shown verbatim rather than as a generic one.
   */
  async function deleteAccount(user: AdminUserRow, reason: string) {
    setBusyUid(user.uid);
    setError(null);
    setMessage(null);

    try {
      await customerApi(`/api/admin/users/${user.uid}/delete`, {
        method: "POST",
        body: { reason: reason.trim(), confirmEmail: deleteEmail.trim() },
      });

      setUsers((rows) => rows.filter((row) => row.uid !== user.uid));
      setMessage(
        `${user.email || user.uid} was deleted. The sign-in account and its records are gone.`
      );
      setPendingDelete(null);
      setDeleteReason("");
      setDeleteEmail("");
    } catch (caught) {
      setError(
        caught instanceof CustomerApiError
          ? caught.message
          : "Could not delete that account."
      );
    } finally {
      setBusyUid(null);
    }
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return users;

    return users.filter(
      (user) =>
        user.email.toLowerCase().includes(query) ||
        user.displayName.toLowerCase().includes(query) ||
        user.uid.toLowerCase().includes(query)
    );
  }, [users, search]);

  const adminCount = users.filter((user) => user.role === "admin").length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <UserCog size={26} className="text-red-400" />
            <h1 className="text-2xl font-bold text-white">Users</h1>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            {adminCount} administrator{adminCount === 1 ? "" : "s"} of{" "}
            {users.length} account{users.length === 1 ? "" : "s"}. Revoking
            access takes effect on the account&apos;s next request.
          </p>
        </div>

        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search email, name or id"
          className="w-full max-w-xs rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-red-500"
        />
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300"
        >
          {error}
        </p>
      ) : null}

      {message ? (
        <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {message}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-400">Loading users…</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">2FA</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((user) => (
                <tr key={user.uid}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">
                      {user.displayName || "Unnamed account"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {user.email || user.uid}
                    </p>
                    {user.emailVerified ? null : (
                      // Named here because it explains the action next to it: an
                      // unverified account cannot use any API route.
                      <span className="mt-1 inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                        Email unverified
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        user.role === "admin"
                          ? "inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-semibold text-red-300"
                          : "inline-flex rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-300"
                      }
                    >
                      {user.role === "admin" ? <ShieldCheck size={12} /> : null}
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {user.mfaEnabled ? "Enabled" : "Not set up"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => void changeRole(user)}
                        disabled={busyUid !== null}
                        className={
                          user.role === "admin"
                            ? "rounded-lg bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/25 disabled:opacity-50"
                            : "rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
                        }
                      >
                        {busyUid === user.uid
                          ? "Saving…"
                          : user.role === "admin"
                            ? "Revoke admin"
                            : "Make admin"}
                      </button>

                      {user.emailVerified ? null : (
                        <button
                          type="button"
                          onClick={() => {
                            setVerifyingUid(user.uid);
                            setVerifyReason("");
                            setError(null);
                            setMessage(null);
                          }}
                          disabled={busyUid !== null || verifyingUid !== null}
                          className="rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/25 disabled:opacity-50"
                        >
                          Verify email
                        </button>
                      )}

                      {/*
                        * Admins are refused by the server (it protects the console from
                        * deleting its own owner) and so is your own account, so neither
                        * offers a button that would only fail.
                        */}
                      {user.role === "admin" || user.uid === signedInUid ? null : (
                        <button
                          type="button"
                          onClick={() => {
                            setPendingDelete(user);
                            setDeleteReason("");
                            setDeleteEmail("");
                            setError(null);
                            setMessage(null);
                          }}
                          disabled={busyUid !== null}
                          className="rounded-lg bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
                        >
                          <span className="inline-flex items-center gap-1">
                            <Trash2 size={12} />
                            Delete
                          </span>
                        </button>
                      )}
                    </div>

                    {verifyingUid === user.uid ? (
                      <form
                        className="mt-2 flex flex-wrap items-center justify-end gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void verifyEmail(user, verifyReason);
                        }}
                      >
                        <label
                          htmlFor={`verify-reason-${user.uid}`}
                          className="sr-only"
                        >
                          Reason for verifying {user.email || user.uid} by hand
                        </label>
                        <input
                          id={`verify-reason-${user.uid}`}
                          value={verifyReason}
                          onChange={(event) => setVerifyReason(event.target.value)}
                          autoFocus
                          required
                          minLength={3}
                          maxLength={200}
                          placeholder="Why, e.g. customer lost mailbox access"
                          className="w-full max-w-xs rounded-lg border border-amber-500/40 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none focus:border-amber-400"
                        />
                        <button
                          type="submit"
                          disabled={busyUid !== null || verifyReason.trim().length < 3}
                          className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
                        >
                          {busyUid === user.uid ? "Verifying…" : "Confirm"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setVerifyingUid(null);
                            setVerifyReason("");
                          }}
                          className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}

              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center text-sm text-slate-500"
                  >
                    No accounts match that search.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {pendingDelete ? (
        <DeleteAccountPanel
          user={pendingDelete}
          reason={deleteReason}
          email={deleteEmail}
          busy={busyUid === pendingDelete.uid}
          onReason={setDeleteReason}
          onEmail={setDeleteEmail}
          onCancel={() => {
            setPendingDelete(null);
            setDeleteReason("");
            setDeleteEmail("");
          }}
          onConfirm={() => void deleteAccount(pendingDelete, deleteReason)}
        />
      ) : null}
    </div>
  );
}

/**
 * The confirmation panel for deleting an account.
 *
 * Kept a blocking dialog rather than an inline prompt because this is the one
 * irreversible action on the page: the rest of the table has to be unreachable while
 * it is open. The typed address is the anti-mistouch guard - it is compared with the
 * account's address by the server too, so disabling the button here is a courtesy and
 * not the enforcement.
 */
function DeleteAccountPanel({
  user,
  reason,
  email,
  busy,
  onReason,
  onEmail,
  onCancel,
  onConfirm,
}: {
  user: AdminUserRow;
  reason: string;
  email: string;
  busy: boolean;
  onReason: (value: string) => void;
  onEmail: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const accountEmail = user.email || user.uid;
  const emailMatches =
    user.email.trim() !== "" &&
    email.trim().toLowerCase() === user.email.trim().toLowerCase();
  const canDelete = emailMatches && reason.trim().length >= 3 && !busy;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      {/*
       * No click-outside dismissal: a stray click on the backdrop should not close the
       * one dialog that guards an irreversible action. Escape and Cancel are deliberate.
       */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        aria-describedby="delete-account-warning"
        className="w-full max-w-lg space-y-4 rounded-2xl border border-rose-500/40 bg-slate-900 p-5 shadow-2xl"
      >
        <div>
          <h2
            id="delete-account-title"
            className="flex items-center gap-2 text-lg font-semibold text-white"
          >
            <Trash2 size={18} className="text-rose-400" />
            Delete this account?
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {user.displayName || "Unnamed account"} ·{" "}
            <span className="text-slate-300">{accountEmail}</span>
          </p>
        </div>

        <p
          id="delete-account-warning"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
        >
          The sign-in account and its profile are removed permanently. This cannot be
          undone. Accounts with orders or wallet history are refused here - those go
          through the customer&apos;s erasure flow, which anonymises and keeps the
          financial records.
        </p>

        <div className="space-y-2">
          <label
            htmlFor="delete-account-reason"
            className="block text-xs font-medium text-slate-300"
          >
            Why is this being deleted?
          </label>
          <input
            id="delete-account-reason"
            value={reason}
            onChange={(event) => onReason(event.target.value)}
            autoFocus
            minLength={3}
            maxLength={200}
            placeholder="e.g. throwaway account from a checkout test"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-rose-400"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="delete-account-email"
            className="block text-xs font-medium text-slate-300"
          >
            Type <span className="font-mono text-slate-200">{accountEmail}</span> to
            confirm
          </label>
          <input
            id="delete-account-email"
            value={email}
            onChange={(event) => onEmail(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white outline-none focus:border-rose-400"
          />
          {email.trim() !== "" && !emailMatches ? (
            <p className="text-xs text-rose-300">
              That is not the address on this account.
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canDelete}
            className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete account"}
          </button>
        </div>
      </div>
    </div>
  );
}

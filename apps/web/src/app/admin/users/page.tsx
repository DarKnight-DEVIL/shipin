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
import { ShieldCheck, UserCog } from "lucide-react";

import { auth } from "@/lib/firebase";
import { customerApi, CustomerApiError } from "@/lib/customerApiClient";

type AssignableRole = "admin" | "customer";

interface AdminUserRow {
  uid: string;
  email: string;
  displayName: string;
  role: AssignableRole;
  mfaEnabled: boolean;
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
  useEffect(() => onAuthStateChanged(auth, () => void load()), [load]);

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
                  <td className="px-4 py-3 text-right">
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
    </div>
  );
}

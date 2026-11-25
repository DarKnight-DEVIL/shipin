import { redirect } from "next/navigation";

/**
 * `/admin` had no page, so the only way to reach the dashboard was to know the
 * URL. Landing here rendered the admin layout - sidebar, MFA banner - around a
 * not-found document, which looks like a broken page and logs a 404 in the
 * console on every visit.
 *
 * Redirect rather than render a second dashboard: two entry points would drift.
 */
export default function AdminIndexPage() {
  redirect("/admin/dashboard");
}

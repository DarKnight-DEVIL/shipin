"use client";

/**
 * First-run checklist for a new customer.
 *
 * The dashboard's empty state already invites a first request; what it cannot
 * say is *why* a request stalls. A customer who never verifies their email is
 * blocked from paying, and one with no shipping address is blocked from a
 * quote — both silently, because nothing tells them until they try.
 *
 * Deliberately small: three steps, each a link to the place that fixes it, and
 * a dismissal the customer controls. Everything is derived from state the
 * dashboard already has (request count) or the auth session (emailVerified), so
 * the checklist costs no extra reads.
 *
 * Both external sources are read through `useSyncExternalStore`: localStorage
 * and the auth session are exactly that, and doing it this way keeps the server
 * render (nothing, via the server snapshot) identical to the first hydration
 * pass, so there is no setState-in-effect and no hydration mismatch.
 *
 * Hidden once the account is verified *and* has a request: at that point it is
 * noise. The dismissal is device-local on purpose — the alternative is a
 * profile write plus a migration for a UI hint.
 */

import { useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { Check, ChevronRight, Mail, MapPin, PackagePlus, X } from "lucide-react";

import { auth } from "@/lib/firebase";

export const GETTING_STARTED_DISMISSED_KEY = "shipin:getting-started-dismissed";

/* ------------------------------------------------------------ localStorage -- */

function subscribeToStorage(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  window.addEventListener("storage", onChange);
  window.addEventListener(GETTING_STARTED_DISMISSED_KEY, onChange);

  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(GETTING_STARTED_DISMISSED_KEY, onChange);
  };
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(GETTING_STARTED_DISMISSED_KEY) === "1";
  } catch {
    // Private mode blocks storage; showing the checklist is the safe default.
    return false;
  }
}

/** The server has no storage, so it renders nothing (see the snapshots below). */
const serverDismissed = () => true;

/* --------------------------------------------------------------- auth state -- */

let emailVerified = false;
const authListeners = new Set<() => void>();
let unsubscribeFromAuth: (() => void) | undefined;

function subscribeToAuth(onChange: () => void): () => void {
  authListeners.add(onChange);

  if (!unsubscribeFromAuth) {
    unsubscribeFromAuth = onAuthStateChanged(auth, (user) => {
      emailVerified = Boolean(user?.emailVerified);
      for (const listener of authListeners) listener();
    });
  }

  return () => {
    authListeners.delete(onChange);

    if (authListeners.size === 0 && unsubscribeFromAuth) {
      unsubscribeFromAuth();
      unsubscribeFromAuth = undefined;
    }
  };
}

const readEmailVerified = () => emailVerified;
const serverEmailVerified = () => false;

interface GettingStartedProps {
  /** The customer already has at least one request. */
  hasRequests: boolean;
}

export default function GettingStarted({ hasRequests }: GettingStartedProps) {
  const dismissed = useSyncExternalStore(
    subscribeToStorage,
    readDismissed,
    serverDismissed
  );
  const verified = useSyncExternalStore(
    subscribeToAuth,
    readEmailVerified,
    serverEmailVerified
  );

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(GETTING_STARTED_DISMISSED_KEY, "1");
    } catch {
      /* the checklist stays hidden for this session only */
    }

    // `storage` events do not fire in the tab that wrote them.
    window.dispatchEvent(new Event(GETTING_STARTED_DISMISSED_KEY));
  }, []);

  if (dismissed) return null;
  // Nothing left to teach.
  if (verified && hasRequests) return null;

  const steps = [
    {
      done: verified,
      icon: Mail,
      title: "Verify your email",
      detail: "Payment needs a verified address.",
      href: "/settings",
      cta: "Verify",
    },
    {
      done: false,
      icon: MapPin,
      title: "Add a shipping address",
      detail: "Quotes are calculated to a destination.",
      href: "/addresses",
      cta: "Add",
    },
    {
      done: hasRequests,
      icon: PackagePlus,
      title: "Create your first request",
      detail: "Paste a product link and we take it from there.",
      href: "/requests/new",
      cta: "Start",
    },
  ];

  const remaining = steps.filter((step) => !step.done).length;

  return (
    <section
      aria-label="Getting started"
      className="dash-card px-5 py-4"
      data-testid="getting-started"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-semibold text-[var(--foreground)]">
            Getting started
          </h2>
          <p className="mt-0.5 text-[12px] text-[var(--muted)]">
            {remaining === 1 ? "1 step left" : `${remaining} steps left`} before
            your first order can move.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss getting started"
          className="rounded-md p-1.5 text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
        >
          <X size={14} />
        </button>
      </div>

      <ol className="mt-3 space-y-1.5">
        {steps.map((step) => (
          <li key={step.title}>
            <Link
              href={step.href}
              className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--surface-2)]"
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  step.done
                    ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                    : "bg-[var(--surface-2)] text-[var(--muted)]"
                }`}
                aria-hidden="true"
              >
                {step.done ? <Check size={14} /> : <step.icon size={14} />}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-[12.5px] font-medium ${
                    step.done
                      ? "text-[var(--muted)] line-through"
                      : "text-[var(--foreground)]"
                  }`}
                >
                  {step.title}
                </span>
                <span className="block truncate text-[11.5px] text-[var(--muted)]">
                  {step.detail}
                </span>
              </span>
              {step.done ? (
                <span className="text-[11px] font-medium text-[var(--accent)]">
                  Done
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--accent)]">
                  {step.cta}
                  <ChevronRight size={12} />
                </span>
              )}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

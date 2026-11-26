"use client";

/**
 * SMS codes — announced, not yet available.
 *
 * The factor belongs to Firebase Identity Platform, which this deployment does not
 * have, so enrolment cannot work: the code would never be sent. Showing a disabled
 * card with "Coming soon" is the honest version of that — a hidden card reads as
 * "this product has no SMS", and an enabled form that always fails reads as a bug.
 *
 * Nothing here calls the Firebase SDK, and `startSmsEnrollment` /
 * `confirmSmsEnrollment` are gone with it: an unreachable enrolment path is how a
 * half-built factor leaks into production.
 */

import type { MfaConfigStatus } from "@/lib/mfaSetupClient";
import SecurityCard, { StatusPill } from "./SecurityCard";

export default function SmsEnrollmentCard({
  status,
}: {
  status: MfaConfigStatus;
  onChanged?: () => Promise<void> | void;
}) {
  /*
   * An account enrolled before this card was disabled keeps its phone factor on the
   * Auth user. Say so instead of implying the factor vanished — sign-in still asks
   * for that code.
   */
  const legacyNumber = status.sms.enabled ? status.sms.phoneNumber : null;

  return (
    <SecurityCard
      title="SMS codes"
      description="A six-digit code by text message. Not available yet — there is nothing to set up here, and no codes are sent until it launches."
      badge={<StatusPill enabled={false} label="Coming soon" />}
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-400">
          An authenticator app is the second factor to use today: it works offline, it
          is not tied to a phone number that can be ported, and it is the one this
          account is checked against at sign-in.
        </p>

        {legacyNumber ? (
          <p className="text-sm text-amber-300">
            This account was enrolled for SMS on {legacyNumber} before the feature was
            withdrawn. That factor still applies at sign-in; it cannot be changed here.
          </p>
        ) : null}
      </div>
    </SecurityCard>
  );
}

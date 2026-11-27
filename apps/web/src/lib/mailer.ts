import "server-only";

import { Resend } from "resend";
import nodemailer from "nodemailer";
import { readEnv } from "@/config/env";

import {
  SMTP_CONNECTION_TIMEOUT_MS,
  SMTP_GREETING_TIMEOUT_MS,
  SMTP_SOCKET_TIMEOUT_MS,
} from "@/config/constants";
import { childLogger } from "@/lib/logger";
import { allowOutboundEmail } from "@/lib/outboundRateLimit";
import { createShipINError } from "@/utils/errors";

const mailerLog = childLogger({ service: "mailer" });

// Primary: Resend (modern email API, no SMTP limits)
let resend: Resend | null = null;
/** Whether the environment has already been read, with or without a Resend key. */
let initialized = false;
/**
 * Placeholder used by builds and CI, compared exactly: a real key is compared
 * against this string, never searched for it.
 */
const BUILD_PLACEHOLDER = "dummy_for_build";
let smtpEmail: string | undefined;
let smtpPassword: string | undefined;
/** Empty means "use SMTP_SERVICE, or Gmail", the historical behaviour. */
let smtpHost: string | undefined;
let smtpPort: number | undefined;
let smtpSecure = false;
let smtpService: string | undefined;

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  /**
   * Extra MIME headers, e.g. `List-Unsubscribe`. Transactional mail needs them
   * so a mail client can offer its own unsubscribe button.
   */
  headers?: Record<string, string>;
}

export async function sendMail({
  to,
  subject,
  html,
  text,
  from,
  headers,
}: SendMailOptions) {
  // Lazy-load env vars on first send (bypasses build-time static analysis).
  // Gated on `initialized` rather than on `resend`: with SMTP only, `resend`
  // stays null and the env would otherwise be re-read on every send.
  if (!initialized) {
    initialized = true;

    // Allow Gmail SMTP-only during build/CI with dummy env (won't actually send)
    const envResendKey = readEnv("RESEND_API_KEY");
    const envSmtpEmail = readEnv("SMTP_EMAIL");
    const envSmtpPassword = readEnv("SMTP_PASSWORD");
    const envSmtpHost = readEnv("SMTP_HOST");
    const envSmtpPort = readEnv("SMTP_PORT");
    const envSmtpSecure = readEnv("SMTP_SECURE");
    const envSmtpService = readEnv("SMTP_SERVICE");

    // SMTP credentials are needed for the fallback path even when Resend is
    // configured, so they are always captured.
    smtpEmail = envSmtpEmail;
    smtpPassword = envSmtpPassword;

    // SMTP_HOST is for non-Gmail providers (SendGrid, Mailgun, a self-hosted
    // relay). Unset keeps the old Gmail service shortcut.
    smtpHost = envSmtpHost;
    smtpService = envSmtpService;
    smtpSecure = envSmtpSecure === "true";

    const parsedPort = Number.parseInt(envSmtpPort ?? "", 10);
    smtpPort = Number.isFinite(parsedPort) ? parsedPort : undefined;

    if (envResendKey && envResendKey !== BUILD_PLACEHOLDER) {
      resend = new Resend(envResendKey);
    }
  }

  // Validation: must have at least SMTP email or Resend key
  if (!smtpEmail) {
    throw new Error("SMTP_EMAIL is required for email sending");
  }

  /*
   * Per-recipient cap, the last gate before the provider: every caller (the
   * notification service, verification resends, the support email route,
   * compliance mail) shares one token bucket per destination address, so no
   * code path can point a burst at one inbox. A refusal throws rather than
   * dropping silently — the caller has to know the mail did not go out.
   */
  if (!(await allowOutboundEmail(to))) {
    throw createShipINError(
      "Too many emails to this recipient; try again later.",
      "OUTBOUND_RATE_LIMITED",
      429
    );
  }

  const fromAddress = from ?? `"ShipIN" <${smtpEmail}>`;

  // Track whether Resend was the configured primary path.
  const resendWasConfigured = !!resend;

  // Try Resend first (only if configured)
  if (resend) {
    try {
      const { data, error } = await resend.emails.send({
        from: fromAddress,
        to,
        subject,
        html,
        text,
        ...(headers ? { headers } : {}),
      });

      if (error) {
        throw new Error(`Resend error: ${error.message ?? "unknown"}`);
      }

      return { id: data?.id, provider: "resend" };
    } catch (resendError) {
      mailerLog.error("Resend failed, falling back to SMTP", {
        error:
          resendError instanceof Error
            ? resendError.message
            : String(resendError),
      });
    }
  }

  // Fallback to SMTP (only if we have email + password)
  if (smtpPassword && smtpPassword !== BUILD_PLACEHOLDER) {
    const timeoutOptions = {
      auth: { user: smtpEmail, pass: smtpPassword },
      connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
      socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
    };

    const smtpTransporter = nodemailer.createTransport(
      smtpHost
        ? {
            host: smtpHost,
            port: smtpPort ?? (smtpSecure ? 465 : 587),
            secure: smtpSecure,
            ...timeoutOptions,
          }
        : {
            service: smtpService || "gmail",
            ...timeoutOptions,
          }
    );
    const info = await smtpTransporter.sendMail({
      from: fromAddress,
      to,
      subject,
      html,
      text,
      ...(headers ? { headers } : {}),
    });

    return { id: info.messageId, provider: "smtp" };
  } else if (resendWasConfigured) {
    // Resend was configured as the primary path, but it failed and SMTP
    // credentials are not available for fallback. Provide a clear message.
    throw new Error(
      "Resend API call failed and SMTP fallback is not configured. " +
        "Please check Resend credentials or set SMTP_EMAIL and SMTP_PASSWORD for fallback."
    );
  } else {
    throw new Error(
      "Email sending not configured (RESEND_API_KEY or SMTP_EMAIL+PASSWORD required)"
    );
  }
}

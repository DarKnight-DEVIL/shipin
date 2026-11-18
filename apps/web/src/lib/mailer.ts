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

const mailerLog = childLogger({ service: "mailer" });

// Primary: Resend (modern email API, no SMTP limits)
let resend: Resend | null = null;
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
}

export async function sendMail({
  to,
  subject,
  html,
  text,
  from,
}: SendMailOptions) {
  // Lazy-load env vars on first send (bypasses build-time static analysis)
  if (!resend) {
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

    if (envResendKey && envResendKey !== "dummy_for_build") {
      resend = new Resend(envResendKey);
    }
  }

  // Validation: must have at least SMTP email or Resend key
  if (!smtpEmail) {
    throw new Error("SMTP_EMAIL is required for email sending");
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
  if (smtpPassword && smtpPassword !== "dummy_for_build") {
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
          },
    );
    const info = await smtpTransporter.sendMail({
      from: fromAddress,
      to,
      subject,
      html,
      text,
    });

    return { id: info.messageId, provider: "smtp" };
  } else if (resendWasConfigured) {
    // Resend was configured as the primary path, but it failed and SMTP
    // credentials are not available for fallback. Provide a clear message.
    throw new Error(
      "Resend API call failed and SMTP fallback is not configured. " +
        "Please check Resend credentials or set SMTP_EMAIL and SMTP_PASSWORD for fallback.",
    );
  } else {
    throw new Error(
      "Email sending not configured (RESEND_API_KEY or SMTP_EMAIL+PASSWORD required)",
    );
  }
}

import "server-only";

import { Resend } from "resend";
import nodemailer from "nodemailer";
import { readEnv } from "@/config/env";

// Primary: Resend (modern email API, no SMTP limits)
let resend: Resend | null = null;
let smtpEmail: string | undefined;
let smtpPassword: string | undefined;

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
    const envResendKey = readEnv('RESEND_API_KEY');
    const envSmtpEmail = readEnv('SMTP_EMAIL');
    const envSmtpPassword = readEnv('SMTP_PASSWORD');

    if (envResendKey && envResendKey !== 'dummy_for_build') {
      resend = new Resend(envResendKey);
      smtpEmail = envSmtpEmail;
    } else {
      smtpEmail = envSmtpEmail;
      smtpPassword = envSmtpPassword;
    }
  }

  // Validation: must have at least SMTP email or Resend key
  if (!smtpEmail) {
    throw new Error("SMTP_EMAIL is required for email sending");
  }

  const fromAddress = from ?? `"ShipIN" <${smtpEmail}>`;

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
        console.warn("[Mailer] Resend failed, falling back to SMTP:", error);
        throw new Error(`Resend error: ${error.message ?? "unknown"}`);
      }

      console.log("[Mailer] Email sent via Resend:", data?.id);
      return { id: data?.id, provider: "resend" };
    } catch (resendError) {
      console.warn("[Mailer] Resend unavailable or misconfigured:", resendError);
    }
  }

  // Fallback to SMTP (only if we have email + password)
  if (smtpPassword && smtpPassword !== 'dummy_for_build') {
    const smtpTransporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: smtpEmail, pass: smtpPassword },
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    const info = await smtpTransporter.sendMail({
      from: fromAddress,
      to,
      subject,
      html,
      text,
    });

    console.log("[Mailer] Email sent via SMTP:", info.messageId);
    return { id: info.messageId, provider: "smtp" };
  } else {
    console.warn("[Mailer] Email sending skipped - no configured credentials");
    throw new Error("Email sending not configured (RESEND_API_KEY or SMTP_EMAIL+PASSWORD required)");
  }
}
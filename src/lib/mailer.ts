import "server-only";

import { Resend } from "resend";
import nodemailer from "nodemailer";
import { serverEnv } from "@/config/env";

// Primary: Resend (modern email API, no SMTP limits)
const resend = new Resend(serverEnv.RESEND_API_KEY);

// Fallback: Gmail SMTP via Nodemailer (used only if Resend fails)
const smtpTransporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: serverEnv.SMTP_EMAIL,
    pass: serverEnv.SMTP_PASSWORD,
  },
  connectionTimeout: 15000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

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
  const fromAddress = from ?? `"ShipIN" <${serverEnv.SMTP_EMAIL}>`;

  // Try Resend first
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
    console.warn("[Mailer] Resend unavailable, trying SMTP fallback:", resendError);
  }

  // Fallback to SMTP
  const info = await smtpTransporter.sendMail({
    from: fromAddress,
    to,
    subject,
    html,
    text,
  });

  console.log("[Mailer] Email sent via SMTP:", info.messageId);
  return { id: info.messageId, provider: "smtp" };
}
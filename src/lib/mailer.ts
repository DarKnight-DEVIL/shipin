import "server-only";

import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",

  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD,
  },
});

export async function sendMail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  console.log(
    "📧 Sending email to:",
    to
  );

  const info =
    await transporter.sendMail({
      from: `"ShipIN" <${process.env.SMTP_EMAIL}>`,

      to,
      subject,
      html,
    });

  console.log(
    "✅ Email sent:",
    info.messageId
  );

  return info;
}
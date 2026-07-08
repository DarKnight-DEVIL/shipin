type EmailType =
  | "quote"
  | "payment"
  | "shipped"
  | "delivered"
  | "refunded"
  | "support";

interface EmailData {
  requestId: string;
  amount?: number;
  trackingNumber?: string;
  supportMessage?: string;
}

const baseTemplate = (
  title: string,
  body: string
) => `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">

<div style="background:#7c3aed;padding:24px;text-align:center;">
<h1 style="color:white;margin:0;">ShipIN</h1>
</div>

<div style="padding:32px">

<h2 style="margin-top:0;color:#111827">
${title}
</h2>

${body}

<hr style="margin:32px 0;border:none;border-top:1px solid #eee"/>

<p style="color:#6b7280;font-size:14px">
Thank you for choosing ShipIN ❤️
</p>

</div>

</div>
`;

export function generateEmail(
  type: EmailType,
  data: EmailData
) {
  switch (type) {
    case "quote":
      return {
        subject: "Your ShipIN Quote is Ready",
        html: baseTemplate(
          "Quote Ready",
          `
<p>Your quote has been prepared.</p>

<p><strong>Request:</strong> #${data.requestId.slice(
            0,
            6
          )}</p>

<p><strong>Total:</strong> $${Number(
            data.amount
          ).toFixed(2)}</p>

<p>Please log in to review and accept your quote.</p>
`
        ),
      };

    case "payment":
      return {
        subject: "Payment Received",
        html: baseTemplate(
          "Payment Received",
          `
<p>We've successfully received your payment.</p>

<p><strong>Request:</strong> #${data.requestId.slice(
            0,
            6
          )}</p>

<p><strong>Amount:</strong> $${Number(
            data.amount
          ).toFixed(2)}</p>

<p>Our purchasing team will now begin buying your items.</p>
`
        ),
      };

    case "shipped":
      return {
        subject: "Your Package Has Shipped",
        html: baseTemplate(
          "Package Shipped",
          `
<p>Your package is now on its way.</p>

<p><strong>Tracking Number:</strong></p>

<p style="font-size:18px;font-weight:bold;">
${data.trackingNumber}
</p>
`
        ),
      };

    case "delivered":
      return {
        subject: "Package Delivered",
        html: baseTemplate(
          "Delivered",
          `
<p>Your ShipIN order has been marked as delivered.</p>

<p>We hope you enjoy your purchase!</p>
`
        ),
      };

    case "refunded":
      return {
        subject: "Refund Processed",
        html: baseTemplate(
          "Refund Completed",
          `
<p>Your refund has been processed successfully.</p>

<p>If you have any questions, simply reply to this email.</p>
`
        ),
      };

    case "support":
      return {
        subject: "Support Reply",
        html: baseTemplate(
          "Support Team Reply",
          `
<p>Our support team has replied:</p>

<div style="
background:#f3f4f6;
padding:16px;
border-radius:8px;
margin-top:16px;
">
${data.supportMessage}
</div>
`
        ),
      };
  }
}
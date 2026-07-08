import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",

  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD,
  },
});

export const sendQuoteReadyEmail = async (
  email: string,
  requestId: string,
  total: number
) => {
  try {
    const info = await transporter.sendMail({
      from: `"ShipIN" <${process.env.SMTP_EMAIL}>`,

      to: email,

      subject: "Your ShipIN Quote is Ready",

      html: `
        <div style="font-family: Arial, sans-serif; max-width:600px; margin:auto;">
          <h1 style="color:#7c3aed;">
            Your quote is ready!
          </h1>

          <p>
            Your ShipIN quote for request
            <strong>#${requestId.slice(0, 6)}</strong>
            is now available.
          </p>

          <p>
            Grand Total:
            <strong>$${total.toFixed(2)}</strong>
          </p>

          <p>
            Login to ShipIN to review your quote and continue.
          </p>

          <a
            href="http://localhost:3000/requests/${requestId}"
            style="
              display:inline-block;
              padding:12px 20px;
              background:#7c3aed;
              color:white;
              text-decoration:none;
              border-radius:8px;
              margin-top:20px;
            "
          >
            Review Quote
          </a>

          <p style="margin-top:40px;color:#666;">
            ShipIN Team
          </p>
        </div>
      `,
    });

    console.log(
      "EMAIL SENT:",
      info.messageId
    );

    return true;
  } catch (error) {
    console.error(
      "EMAIL ERROR:",
      error
    );

    return false;
  }
};
export const sendPaymentReceivedEmail = async (
  email: string,
  requestId: string,
  amount: number
) => {
  try {
    const info = await transporter.sendMail({
      from: `"ShipIN" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject: "Payment Received - ShipIN",

      html: `
        <h1>Payment Received</h1>

        <p>
          We have successfully received your payment for request
          #${requestId.slice(0,6)}.
        </p>

        <p>
          Amount Paid:
          <strong>$${amount.toFixed(2)}</strong>
        </p>

        <p>
          We will now begin purchasing your items.
        </p>
      `,
    });

    console.log(
      "PAYMENT EMAIL SENT:",
      info.messageId
    );

    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
};
export const sendShippedEmail = async (
  email: string,
  requestId: string,
  carrier: string,
  trackingNumber: string,
  trackingUrl: string
) => {
  try {
    await transporter.sendMail({
      from: `"ShipIN" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject: "Your ShipIN Order Has Shipped",

      html: `
        <h1>Your package is on the way!</h1>

        <p>
          Request #${requestId.slice(0,6)}
        </p>

        <p>
          Carrier: ${carrier}
        </p>

        <p>
          Tracking Number: ${trackingNumber}
        </p>

        <a href="${trackingUrl}">
          Track Package
        </a>
      `,
    });

    return true;
  } catch {
    return false;
  }
};
export const sendDeliveredEmail = async (
  email: string,
  requestId: string
) => {
  try {
    await transporter.sendMail({
      from: `"ShipIN" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject: "Your ShipIN Order Was Delivered",

      html: `
        <h1>Delivered</h1>

        <p>
          Request #${requestId.slice(0,6)}
          has been delivered successfully.
        </p>

        <p>
          Thank you for using ShipIN.
        </p>
      `,
    });

    return true;
  } catch {
    return false;
  }
};
export const sendRefundedEmail = async (
  email: string,
  requestId: string
) => {
  try {
    await transporter.sendMail({
      from: `"ShipIN" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject: "Refund Issued - ShipIN",

      html: `
        <h1>Refund Issued</h1>

        <p>
          A refund has been issued for request
          #${requestId.slice(0,6)}.
        </p>

        <p>
          The refund may take upto 3-7 business days
          to appear depending on your payment method.
        </p>
      `,
    });

    return true;
  } catch {
    return false;
  }
};
export const sendSupportReplyEmail = async (
  email: string,
  requestId: string,
  reply: string
) => {
  try {
    await transporter.sendMail({
      from: `"ShipIN Support" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject: "New Support Reply - ShipIN",

      html: `
        <h1>Support Reply</h1>

        <p>
          You have received a new reply regarding request
          #${requestId.slice(0,6)}.
        </p>

        <div
          style="
            padding:16px;
            background:#f3f4f6;
            border-radius:8px;
          "
        >
          ${reply}
        </div>
      `,
    });

    return true;
  } catch {
    return false;
  }
};

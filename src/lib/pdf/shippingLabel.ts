import jsPDF from "jspdf";
import type { Request } from "@/types/request";

export function generateShippingLabel(request: Request) {
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a6",
  });

const address = request.shippingAddress;
const tracking = request.tracking;

/*
 * A shipping label cannot be generated
 * without a delivery address.
 *
 * Some older Firestore requests may not
 * contain shippingAddress.
 */
if (!address) {
  alert(
    "This request does not have a shipping address. Please add or select a shipping address before generating the shipping label."
  );

  return;
}

  let y = 12;

  // Header
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.text("ShipIN", 10, y);

  y += 7;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text("INTERNATIONAL SHIPPING LABEL", 10, y);

  y += 5;

  pdf.line(10, y, 95, y);

  // Ship To
  y += 9;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("SHIP TO", 10, y);

  y += 7;

  pdf.setFontSize(13);
  pdf.text(
    address.recipientName || "Customer",
    10,
    y
  );

  y += 6;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);

  pdf.text(address.addressLine1 || "", 10, y);

  if (address.addressLine2) {
    y += 5;
    pdf.text(address.addressLine2, 10, y);
  }

  y += 5;

  pdf.text(
    `${address.city || ""}${
      address.state
        ? `, ${address.state}`
        : ""
    }`,
    10,
    y
  );

  y += 5;

  pdf.text(
    `${address.postalCode || ""}`,
    10,
    y
  );

  y += 5;

  pdf.setFont("helvetica", "bold");

  pdf.text(
    address.country || "",
    10,
    y
  );

  // Phone
  if (address.phone) {
    y += 8;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);

    pdf.text(
      `Phone: ${address.phone}`,
      10,
      y
    );
  }

  // Divider
  y += 7;

  pdf.line(10, y, 95, y);

  // Internal tracking
  y += 9;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);

  pdf.text(
    "SHIPIN TRACKING ID",
    10,
    y
  );

  y += 7;

  pdf.setFontSize(14);

  pdf.text(
    tracking?.internalTrackingId ||
      "NOT ASSIGNED",
    10,
    y
  );

  // Request reference
  y += 10;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);

  pdf.text(
    `Request: #${request.id.slice(0, 8).toUpperCase()}`,
    10,
    y
  );

  // Carrier — operational information
  if (tracking?.carrier) {
    y += 6;

    pdf.text(
      `Carrier: ${tracking.carrier}`,
      10,
      y
    );
  }

  /*
   * IMPORTANT:
   * We intentionally do NOT print
   * tracking.trackingNumber here.
   *
   * The external carrier tracking number
   * remains internal to ShipIN.
   */

  // Footer
  y += 12;

  pdf.line(10, y, 95, y);

  y += 6;

  pdf.setFontSize(7);

  pdf.text(
    "ShipIN Package Forwarding",
    10,
    y
  );

  // Download PDF
  const filename =
    tracking?.internalTrackingId
      ? `shipping-label-${tracking.internalTrackingId}.pdf`
      : `shipping-label-${request.id}.pdf`;

  pdf.save(filename);
}
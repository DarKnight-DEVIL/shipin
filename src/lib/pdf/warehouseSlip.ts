/**
 * Warehouse slip PDF generation.
 */

import jsPDF from "jspdf";
import type { Request } from "@/types/request";

export function generateWarehouseSlip(request: Request) {
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a6",
  });

  const address = request.shippingAddress;
  const warehouse = request.warehouse;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text("SHIPIN WAREHOUSE SLIP", 10, 15);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(`Request ID: ${request.id}`, 10, 25);
  pdf.text(`Status: ${request.status}`, 10, 31);

  if (address) {
    pdf.text("Delivery Address:", 10, 40);
    pdf.setFontSize(9);
    let y = 46;
    if (address.recipientName) { pdf.text(address.recipientName, 10, y); y += 5; }
    if (address.addressLine1) { pdf.text(address.addressLine1, 10, y); y += 5; }
    if (address.city) { pdf.text(`${address.city}${address.state ? ", " + address.state : ""}`, 10, y); y += 5; }
    if (address.postalCode) { pdf.text(address.postalCode, 10, y); y += 5; }
  }

  if (warehouse?.checklist) {
    pdf.setFontSize(9);
    pdf.text("Checklist:", 10, 70);
    pdf.text(`- Package Received: ${warehouse.checklist.packageReceived ? "Yes" : "No"}`, 10, 76);
    pdf.text(`- Inspection Completed: ${warehouse.checklist.inspectionCompleted ? "Yes" : "No"}`, 10, 81);
    pdf.text(`- Photos Uploaded: ${warehouse.checklist.photosUploaded ? "Yes" : "No"}`, 10, 86);
    pdf.text(`- Measured: ${warehouse.checklist.measured ? "Yes" : "No"}`, 10, 91);
    pdf.text(`- Ready for Shipment: ${warehouse.checklist.readyForShipment ? "Yes" : "No"}`, 10, 96);
  }

  const filename = `warehouse-slip-${request.id}.pdf`;
  pdf.save(filename);
  return true;
}
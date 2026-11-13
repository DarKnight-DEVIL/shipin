import type { Request } from "@/types/request";

/**
 * CSV helpers for admin exports.
 *
 * Two things matter beyond joining commas:
 *
 *  - A value that starts with `=`, `+`, `-` or `@` is executable in Excel and
 *    Sheets, so it is prefixed with an apostrophe. Vendor names and notes are
 *    operator-entered text and end up in a spreadsheet.
 *  - Anything containing a quote, comma or newline is quoted, with embedded
 *    quotes doubled, so one stray character cannot shift every later column.
 */

const HEADER = [
  "ShipIN request",
  "Customer",
  "Status",
  "Vendor",
  "Order number",
  "Amount (USD)",
  "Receipt link",
  "Notes",
  "Recorded at",
] as const;

function escapeCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;

  return /[",\n\r]/.test(guarded)
    ? `"${guarded.replace(/"/g, '""')}"`
    : guarded;
}

function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return escapeCell(String(value));
}

export interface PurchaseHistoryCsv {
  csv: string;
  rowCount: number;
}

/**
 * One row per vendor purchase, so a request bought at three stores produces
 * three rows and the amounts reconcile per store rather than in aggregate.
 */
export function buildPurchaseHistoryCsv(
  requests: Request[]
): PurchaseHistoryCsv {
  const lines: string[] = [HEADER.map(cell).join(",")];

  for (const request of requests) {
    for (const purchase of request.purchases ?? []) {
      const recordedAt = purchase.recordedAt;

      lines.push(
        [
          cell(request.id),
          cell(request.email),
          cell(request.status),
          cell(purchase.vendor),
          cell(purchase.orderNumber),
          cell(purchase.amount.toFixed(2)),
          cell(purchase.receiptUrl),
          cell(purchase.notes),
          cell(
            recordedAt && typeof recordedAt.toDate === "function"
              ? recordedAt.toDate().toISOString()
              : ""
          ),
        ].join(",")
      );
    }
  }

  // CRLF and a trailing newline: what Excel expects, and harmless elsewhere.
  return { csv: `${lines.join("\r\n")}\r\n`, rowCount: lines.length - 1 };
}

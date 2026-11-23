// Lightweight check for overdue credential rotation dates.
// Reads the credential rotation table from docs/OPERATIONS.md Section 9
// and flags any credentials whose "Next due" date has passed.
// Does NOT auto-rotate anything - just reports.

import fs from "fs";
import path from "path";
import { format } from "date-fns";

// Known credentials and their rotation cadence (90 days)
const CREDENTIALS = [
  {
    name: "PAYPAL_CLIENT_SECRET",
    usedBy: "Vercel production; PayPal REST OAuth and captures",
    cadenceDays: 90,
  },
  {
    name: "R2_ACCESS_KEY_ID",
    usedBy: "Vercel production; uploads and presigned reads",
    cadenceDays: 90,
  },
  {
    name: "R2_SECRET_ACCESS_KEY",
    usedBy: "Vercel production; uploads and presigned reads",
    cadenceDays: 90,
  },
  {
    name: "CRON_SECRET",
    usedBy: "Vercel production; cron workflows (quote expiry, PayPal reconcile, retention purge)",
    cadenceDays: 90,
    lastRotated: new Date("2026-11-14"),
  },
  {
    name: "FIREBASE_ADMIN_PRIVATE_KEY",
    usedBy: "Vercel production; staging E2E_FIREBASE_ADMIN_* secrets",
    cadenceDays: 90,
  },
];

// Resolve OPERATIONS.md relative to where the script runs.
// The GitHub Actions workflow cd's to /c/Users/darkn/shipin first.
const opsPath = path.join(process.cwd(), "docs", "OPERATIONS.md");

async function main() {
  const opsContent = await fs.promises.readFile(opsPath, "utf-8");

  // Extract the credential rotation table from Section 9
  // Find the table after "## 9. Credential rotation"
  const tableSectionMatch = opsContent.match(
    /## 9\.\s+Credential rotation[\s\S]*?(?=\n##|\n---|$)/
  );

  let tableRows = [];
  if (tableSectionMatch) {
    const lines = tableSectionMatch[0].split("\n");
    let inTable = false;
    for (const line of lines) {
      // Start collecting after the header row
      if (line.includes("| Credential | Used by | Cadence | Last rotated / set | Next due |")) {
        inTable = true;
        continue;
      }
      if (inTable && line.startsWith("|")) {
        const cols = line
          .split("|")
          .map((c) => c.trim())
          .filter((c) => c && c !== "|");
        if (cols.length >= 6) {
          // Columns: index 1=Credential, 2=Used by, 3=Cadence, 4=Last rotated / set, 5=Next due
          const credentialName = cols[1];
          const usedBy = cols[2];
          const cadenceText = cols[3];
          const lastRotatedText = cols[4] || "";
          const nextDueText = cols[5] || "";

          tableRows.push({
            credentialName,
            usedBy,
            cadenceText,
            lastRotatedText,
            nextDueText,
          });
        }
        // Stop at next section heading
        if (cols.length > 0 && !line.includes("Credential") && line.trim().startsWith("##")) {
          inTable = false;
        }
      } else {
        // Reset if we hit a non-table line
        if (line.startsWith("##") && !line.includes("9.")) {
          inTable = false;
        }
      }
    }
  }

  // Build a map of table entries by credential name
  const tableMap = {};
  for (const row of tableRows) {
    tableMap[row.credentialName] = row;
  }

  const now = new Date();
  const overdue = [];
  const current = [];

  console.log("🔑 Credential Rotation Status Check\n");
  console.log("=".repeat(60));

  for (const cred of CREDENTIALS) {
    const tableEntry = tableMap[cred.name];

    // Determine last rotated date
    let lastRotatedDate;
    if (tableEntry && tableEntry.lastRotatedText.includes("Not recorded")) {
      // Never rotated - use project start approximation
      lastRotatedDate = new Date("2024-01-01");
    } else if (tableEntry && tableEntry.lastRotatedText) {
      // Parse date from table - try various formats
      let parsedDate = null;
      // Try "YYYY-MM-DD" format
      const yyMdMatch = tableEntry.lastRotatedText.match(/\d{4}-\d{2}-\d{2}/);
      if (yyMdMatch) {
        parsedDate = new Date(yyMdMatch[0]);
      }
      // Try "Month DD, YYYY" format via Date.parse
      if (!parsedDate) {
        const parsed = Date.parse(tableEntry.lastRotatedText);
        if (!isNaN(parsed)) {
          parsedDate = new Date(parsed);
        }
      }
      if (parsedDate) lastRotatedDate = parsedDate;
    }
    if (!lastRotatedDate) lastRotatedDate = new Date("2024-01-01");

    // Calculate next due date (90 days from last rotated)
    const nextDue = new Date(lastRotatedDate);
    nextDue.setDate(nextDue.getDate() + cred.cadenceDays);

    // Also check the table's "Next due" if it has a valid date (not "Now")
    let tableNextDue;
    if (tableEntry && tableEntry.nextDueText && !tableEntry.nextDueText.includes("Now")) {
      // Try to parse the date
      const yyMdMatch = tableEntry.nextDueText.match(/\d{4}-\d{2}-\d{2}/);
      if (yyMdMatch) {
        tableNextDue = new Date(yyMdMatch[0]);
      }
    }

    // Use the table's next due if available, otherwise compute
    const effectiveNextDue = tableNextDue || nextDue;

    // Check if overdue (next due date is in the past or today)
    const isOverdue = now >= effectiveNextDue;

    // Also check if the table says "Now"
    const tableNow = tableEntry && tableEntry.nextDueText && tableEntry.nextDueText.includes("Now");

    if (tableNow || isOverdue) {
      const daysOverdue = Math.floor((now - effectiveNextDue) / (1000 * 60 * 60 * 24));
      const daysSinceLast = Math.floor((now - lastRotatedDate) / (1000 * 60 * 60 * 24));

      overdue.push({
        name: cred.name,
        usedBy: cred.usedBy,
        lastRotated: lastRotatedDate,
        nextDue: effectiveNextDue,
        daysOverdue,
        daysSinceLast,
        cadenceDays: cred.cadenceDays,
      });
    } else {
      const daysUntilDue = Math.floor((effectiveNextDue - now) / (1000 * 60 * 60 * 24));

      current.push({
        name: cred.name,
        usedBy: cred.usedBy,
        lastRotated: lastRotatedDate,
        nextDue: effectiveNextDue,
        daysUntilDue,
        cadenceDays: cred.cadenceDays,
      });
    }
  }

  // Output results
  console.log(`\nCredentials overdue for rotation (${overdue.length}):`);
  if (overdue.length > 0) {
    overdue.forEach((c) => {
      console.log(`\n  🚩 ${c.name}`);
      console.log(`     Used by: ${c.usedBy}`);
      console.log(`     Last rotated: ${format(c.lastRotated, "yyyy-MM-dd")}`);
      console.log(`     Next due:     ${format(c.nextDue, "yyyy-MM-dd")} (${c.daysOverdue} day${c.daysOverdue !== 1 ? "s" : ""} overdue)`);
      console.log(`     Days since last rotation: ${c.daysSinceLast} day${c.daysSinceLast !== 1 ? "s" : ""}`);
    });
  } else {
    console.log("  None - all credentials are within their rotation window.");
  }

  console.log(`\nCredentials currently within rotation window (${current.length}):`);
  if (current.length > 0) {
    current.forEach((c) => {
      console.log(`\n  ✅ ${c.name}`);
      console.log(`     Used by: ${c.usedBy}`);
      console.log(`     Last rotated: ${format(c.lastRotated, "yyyy-MM-dd")}`);
      console.log(`     Next due:     ${format(c.nextDue, "yyyy-MM-dd")} (in ${c.daysUntilDue} day${c.daysUntilDue !== 1 ? "s" : ""})`);
    });
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Total checked: ${CREDENTIALS.length}`);
  console.log(`Overdue: ${overdue.length}`);
  console.log(`On track: ${current.length}`);

  if (overdue.length > 0) {
    console.error("\n⚠️  One or more credentials are overdue for rotation.");
    process.exit(1);
  } else {
    console.log("\n✅ All credentials are within their rotation window.");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Error checking credential rotation:", err);
  process.exit(1);
});
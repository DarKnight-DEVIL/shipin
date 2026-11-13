"use client";

/**
 * One-time display of freshly generated backup codes.
 *
 * Codes are shown exactly once: the server only keeps hashes.
 */

import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";

export default function BackupCodeList({ codes }: { codes: string[] }) {
  const [copiedAll, setCopiedAll] = useState(false);

  if (codes.length === 0) return null;

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      // Clipboard can be blocked; the download button is the fallback.
    }
  }

  function download() {
    const content = [
      "ShipIN admin backup codes",
      "Each code can be used once. Store this file somewhere safe.",
      "",
      ...codes,
    ].join("\n");

    const url = URL.createObjectURL(
      new Blob([content], { type: "text/plain" })
    );
    const link = document.createElement("a");

    link.href = url;
    link.download = "shipin-backup-codes.txt";
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
      <p className="text-sm font-semibold text-amber-200">
        Save these backup codes now
      </p>
      <p className="mt-1 text-xs text-amber-200/80">
        They are shown once. Each code works a single time if you lose access
        to your authenticator.
      </p>

      <ul className="mt-4 grid grid-cols-2 gap-2 font-mono text-sm text-white sm:grid-cols-3">
        {codes.map((code) => (
          <li
            key={code}
            className="rounded-lg bg-slate-950/70 px-3 py-2 text-center tracking-wider"
          >
            {code}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copyAll}
          className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
        >
          {copiedAll ? <Check size={14} /> : <Copy size={14} />}
          {copiedAll ? "Copied" : "Copy all"}
        </button>

        <button
          type="button"
          onClick={download}
          className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
        >
          <Download size={14} />
          Download .txt
        </button>
      </div>
    </div>
  );
}

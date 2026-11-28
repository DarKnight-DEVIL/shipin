"use client";

/**
 * Installs the browser error reporter once, on mount.
 *
 * A component rather than module-level code in a layout: layouts are rendered
 * on the server too, and `window` does not exist there.
 */

import { useEffect } from "react";

import { installClientErrorReporter } from "@/lib/clientErrorReporter";

export default function ClientErrorReporter() {
  useEffect(() => installClientErrorReporter(), []);

  return null;
}

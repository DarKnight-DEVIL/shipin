import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ReactElement } from "react";

export default function Brand(): ReactElement {
  return (
    <Link
      href="/dashboard"
      className="inline-flex items-center gap-2"
    >
      <span
        aria-hidden="true"
        className="dash-brandmark flex h-[22px] w-[22px] items-center justify-center rounded-[7px]"
      >
        <ArrowUpRight size={14} strokeWidth={2.8} />
      </span>
      <span style={{ fontFamily: "var(--display)" }}>
        Ship<span className="text-[var(--accent)]">IN</span>
      </span>
    </Link>
  );
}

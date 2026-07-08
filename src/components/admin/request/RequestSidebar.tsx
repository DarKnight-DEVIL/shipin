"use client";

import {
  LayoutDashboard,
  Package,
  Receipt,
  Truck,
  MessageSquare,
  Clock3,
} from "lucide-react";

interface Props {
  active: string;
  onChange: (tab: string) => void;
  unreadSupport?: boolean;
}

const sections = [
  {
    key: "Overview",
    label: "Overview",
    icon: LayoutDashboard,
  },
  {
    key: "Products",
    label: "Products",
    icon: Package,
  },
  {
    key: "Quote",
    label: "Quote",
    icon: Receipt,
  },
  {
    key: "Shipment",
    label: "Shipment",
    icon: Truck,
  },
  {
    key: "Support",
    label: "Support",
    icon: MessageSquare,
  },
  {
    key: "Timeline",
    label: "Timeline",
    icon: Clock3,
  },
];

export default function RequestSidebar({
  active,
  onChange,
  unreadSupport = false,
}: Props) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3">

      {sections.map((section) => {
        const Icon = section.icon;

        return (
          <button
            key={section.key}
            onClick={() => onChange(section.key)}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl mb-2 transition-all duration-200 ${
              active === section.key
                ? "bg-purple-600 text-white"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <div className="flex items-center gap-3">
              <Icon size={18} />
              <span>{section.label}</span>
            </div>

            {section.key === "Support" &&
              unreadSupport && (
                <div className="w-2 h-2 rounded-full bg-red-500" />
              )}
          </button>
        );
      })}
    </div>
  );
}
"use client";

import {
  LayoutDashboard,
  Package,
  Receipt,
  Warehouse,
  Truck,
  MessageSquare,
  Clock3,
} from "lucide-react";

interface Props {
  request: any;
  activeTab: string;
  onTabChange: (tab: string) => void;
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
    key: "Warehouse",
    label: "Warehouse",
    icon: Warehouse,
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
  request,
  activeTab,
  onTabChange,
}: Props) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">

      <div className="mb-6 border-b border-slate-800 pb-4">
        <p className="text-xs text-slate-500 uppercase">
          Request
        </p>

        <h2 className="text-lg font-bold text-white mt-2">
          #{request.id.slice(0, 6)}
        </h2>

        <p className="text-sm text-slate-400 truncate">
          {request.email}
        </p>
      </div>

      {sections.map((section) => {
        const Icon = section.icon;

        return (
          <button
            key={section.key}
            onClick={() => onTabChange(section.key)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition ${
              activeTab === section.key
                ? "bg-purple-600 text-white"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <Icon size={18} />
            {section.label}
          </button>
        );
      })}
    </div>
  );
}
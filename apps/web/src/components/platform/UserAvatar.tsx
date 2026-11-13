import { LogOut } from "lucide-react";

interface UserAvatarProps {
  userName: string;
  userEmail: string;
  onLogout: () => void;
}

export default function UserAvatar({ userName, userEmail, onLogout }: UserAvatarProps) {
  const initials = getInitials(userName);

  return (
    <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-3)] text-[11px] font-semibold text-[var(--foreground)]">
        {initials}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-[var(--foreground)]">
          {userName || "ShipIN customer"}
        </p>
        <p className="truncate text-[11px] text-[var(--muted)]">
          {userEmail}
        </p>
      </div>

      <button
        type="button"
        onClick={onLogout}
        aria-label="Sign out"
        title="Sign out"
        className="app-iconbtn h-8 w-8 hover:text-rose-600 dark:hover:text-rose-400"
      >
        <LogOut size={15} />
      </button>
    </div>
  );
}

function getInitials(name: string) {
  if (!name) {
    return "S";
  }

  const parts = name.trim().split(/\s+/);

  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase();
  }

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

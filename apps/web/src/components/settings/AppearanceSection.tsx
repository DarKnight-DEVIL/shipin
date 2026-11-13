import SettingsSection from "./SettingsSection";

type ThemeOption = "light" | "dark" | "system";

const THEME_OPTIONS: { id: ThemeOption; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

interface AppearanceSectionProps {
  theme: string | undefined;
  setTheme: (theme: ThemeOption) => void;
}

export default function AppearanceSection({
  theme,
  setTheme,
}: AppearanceSectionProps) {
  return (
    <SettingsSection id="appearance" title="Appearance" description="Color theme">
      <div className="flex flex-wrap gap-2">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setTheme(option.id)}
            data-active={theme === option.id}
            className="app-chip"
          >
            {option.label}
          </button>
        ))}
      </div>
    </SettingsSection>
  );
}

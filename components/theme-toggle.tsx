"use client";

import { Monitor, Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/cn";
import { THEME_PREFERENCES, type ThemePreference } from "@/lib/theme";

const META: Record<ThemePreference, { label: string; icon: typeof Sun }> = {
  light: { label: "Claro", icon: Sun },
  dark: { label: "Escuro", icon: Moon },
  system: { label: "Sistema", icon: Monitor },
};

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="group"
      aria-label="Tema"
      className="bg-surface-sunken flex items-center gap-1 rounded-md p-1"
    >
      {THEME_PREFERENCES.map((option) => {
        const { label, icon: Icon } = META[option];
        const active = preference === option;

        return (
          <button
            key={option}
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={active}
            onClick={() => setPreference(option)}
            className={cn(
              "inline-grid size-11 place-items-center rounded-sm transition-opacity duration-[var(--duration-micro)]",
              active
                ? "bg-surface text-text"
                : "text-text-muted hover:text-text",
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
          </button>
        );
      })}
    </div>
  );
}

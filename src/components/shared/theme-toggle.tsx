/**
 * Manual light/dark override. The stylesheet already follows the OS via
 * `prefers-color-scheme`; this only writes an explicit `data-theme` attribute
 * on <html> (persisted to localStorage) when the user chooses to override.
 *
 * Cycles: System → Light → Dark → System.
 */
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Choice = "system" | "light" | "dark";
const KEY = "tv-theme";

export function readThemeChoice(): Choice {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : "system";
}

export function applyThemeChoice(choice: Choice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
}

const NEXT: Record<Choice, Choice> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Choice, string> = {
  system: "Theme: following your device",
  light: "Theme: light",
  dark: "Theme: dark",
};

export function ThemeToggle() {
  const [choice, setChoice] = useState<Choice>("system");

  useEffect(() => {
    const c = readThemeChoice();
    setChoice(c);
    applyThemeChoice(c);
  }, []);

  const cycle = () => {
    const next = NEXT[choice];
    setChoice(next);
    applyThemeChoice(next);
    if (next === "system") window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, next);
  };

  const Icon = choice === "dark" ? Moon : choice === "light" ? Sun : Monitor;

  return (
    <button
      type="button"
      className="tvp-icon-btn"
      onClick={cycle}
      title={`${LABEL[choice]} — click to switch`}
      aria-label={`${LABEL[choice]}. Click to switch theme.`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

export default ThemeToggle;

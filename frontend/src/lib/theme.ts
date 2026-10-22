import { useEffect, useState } from "react";

export type Theme = "system" | "light" | "dark";
const KEY = "devbrief-theme";

function stored(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(stored);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset.theme;
    else root.dataset.theme = theme;
    try {
      if (theme === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, theme);
    } catch {
      // Storage can be unavailable (private mode); the choice then lasts for the tab.
    }
  }, [theme]);
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  return { theme, dark, toggle: () => setTheme(dark ? "light" : "dark") };
}

"use client";

import { create } from "zustand";

export type Theme = "dark" | "light";

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
  init: () => void;
}

function apply(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("theme", theme);
  } catch {}
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  // Default dark; the no-flash inline script in app/layout sets the real value
  // on <html> before paint, and init() reconciles the store on mount.
  theme: "dark",
  setTheme: (t) => {
    apply(t);
    set({ theme: t });
  },
  toggle: () => {
    const next: Theme = get().theme === "dark" ? "light" : "dark";
    apply(next);
    set({ theme: next });
  },
  init: () => {
    if (typeof document === "undefined") return;
    const current = (document.documentElement.dataset.theme as Theme) || "dark";
    set({ theme: current });
  },
}));

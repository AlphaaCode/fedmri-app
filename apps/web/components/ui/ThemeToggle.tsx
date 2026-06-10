"use client";

import { motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { useThemeStore } from "@/lib/theme-store";

/** Sun/moon theme switch. Reads the store (reconciled on mount from the
 *  no-flash inline script), animates the icon swap on toggle. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`btn-press relative grid place-items-center w-9 h-9 rounded-lg overflow-hidden ${className}`}
      style={{ background: "var(--bg-card2)", border: "1px solid var(--border)", color: "var(--teal)" }}
    >
      <motion.span
        key={theme}
        initial={{ y: 14, opacity: 0, rotate: -40 }}
        animate={{ y: 0, opacity: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 360, damping: 22 }}
        className="grid place-items-center"
      >
        {isDark ? <Moon size={16} /> : <Sun size={16} />}
      </motion.span>
    </button>
  );
}

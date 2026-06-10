import { ButtonHTMLAttributes, CSSProperties } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "ghost" | "teal" | "coral" | "validate";

const VARIANT_STYLE: Record<Variant, CSSProperties> = {
  primary:  { background: "var(--teal-dim)", color: "#0d1117" },
  ghost:    { background: "var(--bg-card2)", color: "var(--text-secondary)", border: "1px solid var(--border)" },
  teal:     { background: "var(--teal-glow)", color: "var(--teal)", border: "1px solid #2dd4bf40" },
  coral:    { background: "#fb718520", color: "#fb7185", border: "1px solid #fb718540" },
  validate: { background: "#2dd4bf20", color: "#2dd4bf", border: "1px solid #2dd4bf40" },
};

export function Button({ variant = "primary", className, style, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn("btn-press rounded-lg text-sm font-semibold px-4 py-2 disabled:opacity-50", className)}
      style={{ ...VARIANT_STYLE[variant], ...style }}
      {...props}
    />
  );
}

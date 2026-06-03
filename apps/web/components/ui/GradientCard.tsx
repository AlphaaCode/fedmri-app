import { CSSProperties, ReactNode } from "react";

const ACCENT_HEX: Record<string, string> = {
  teal:   "#2dd4bf",
  indigo: "#6366f1",
  amber:  "#f59e0b",
  blue:   "#60a5fa",
  coral:  "#fb7185",
};

interface GradientCardProps {
  children: ReactNode;
  accent?: "teal" | "indigo" | "amber" | "blue" | "coral";
  className?: string;
  style?: CSSProperties;
}

export function GradientCard({
  children,
  accent = "teal",
  className = "",
  style,
}: GradientCardProps) {
  const hex = ACCENT_HEX[accent] ?? ACCENT_HEX.teal;
  return (
    <div
      className={`relative rounded-xl border overflow-hidden ${className}`}
      style={{ background: "var(--bg-card)", borderColor: "var(--border)", ...style }}
    >
      {/* top-right radial glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at top right, ${hex}28, transparent 65%)`,
        }}
      />
      {/* top-left diagonal sweep */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(135deg, ${hex}0a 0%, transparent 45%)`,
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

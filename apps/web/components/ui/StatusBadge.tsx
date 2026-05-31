import { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Status = "validated" | "disputed" | "pending" | "active";

const MAP: Record<Status, { bg: string; color: string; border: string; label: string }> = {
  validated: { bg: "#2dd4bf20", color: "#2dd4bf", border: "#2dd4bf50", label: "Validated" },
  disputed:  { bg: "#f59e0b20", color: "#f59e0b", border: "#f59e0b50", label: "Disputed" },
  pending:   { bg: "var(--bg-card2)", color: "var(--text-secondary)", border: "var(--border)", label: "Pending" },
  active:    { bg: "var(--teal-glow)", color: "var(--teal)", border: "var(--teal)40", label: "Active" },
};

export function StatusBadge({ status, label, className }: { status: Status; label?: ReactNode; className?: string }) {
  const s = MAP[status];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full", className)}
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {label ?? s.label}
    </span>
  );
}

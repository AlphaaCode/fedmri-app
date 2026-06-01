"use client";

import { useFlStore } from "@/lib/fl-store";

const LABEL: Record<string, string> = {
  idle: "Idle",
  local_training: "Local training",
  aggregating: "Aggregating",
  complete: "Synced",
};

export function FlPhaseBadge() {
  const phase = useFlStore((s) => s.phase);
  const active = phase === "local_training" || phase === "aggregating";
  const color = active ? "var(--amber)" : "var(--teal)";
  return (
    <span
      className="text-[11px] px-2 py-1 rounded-full inline-flex items-center gap-1.5"
      style={{ background: active ? "#f59e0b15" : "var(--teal-glow)", color, border: `1px solid ${active ? "#f59e0b40" : "#2dd4bf40"}` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {LABEL[phase] ?? phase}
    </span>
  );
}

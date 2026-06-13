"use client";

import { useFlStore } from "@/lib/fl-store";

export function DoctorSiloBanner() {
  const phase = useFlStore((s) => s.phase);
  const active = phase === "local_training" || phase === "aggregating";
  return (
    <div
      className="px-3 py-1.5 rounded-lg text-[11px] flex items-center gap-2"
      style={{
        background: active ? "#f59e0b15" : "var(--teal-glow)",
        color: active ? "var(--amber-on-glow)" : "var(--teal-on-glow)",
        border: "1px solid var(--border)",
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M6 1L10 3v4c0 2.2-1.6 4-4 4.5C3.6 11 2 9.2 2 7V3L6 1z" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      {phase === "idle" && "Your hospital silo is active — data stays here"}
      {phase === "local_training" && "FL round running — only model weights leaving hospital, 0 bytes of patient data"}
      {phase === "aggregating" && "Aggregating updates — still 0 bytes of patient data transmitted"}
      {phase === "complete" && "Round complete — your hospital silo remained intact throughout"}
    </div>
  );
}

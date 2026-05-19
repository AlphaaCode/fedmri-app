"use client";

import { motion } from "framer-motion";
import { SUBTYPE_MEDS, SUBTYPE_COLOR, type Subtype } from "@/lib/types";

const LINE_BADGE: Record<string, string> = {
  "First-line": "bg-teal-900/60 text-teal-300 border border-teal-700/50",
  "Second-line": "bg-blue-900/60 text-blue-300 border border-blue-700/50",
  "Adjuvant": "bg-purple-900/60 text-purple-300 border border-purple-700/50",
};

export function MedicationCard({ subtype }: { subtype: Subtype }) {
  const data = SUBTYPE_MEDS[subtype];
  const color = SUBTYPE_COLOR[subtype];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="rounded-xl border p-5"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--text-secondary)" }}>
            Treatment protocols
          </div>
          <div className="text-base font-semibold" style={{ color }}>
            {subtype}
          </div>
          <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {data.profile}
          </div>
        </div>
        <div
          className="text-[10px] font-medium px-2 py-0.5 rounded-full border"
          style={{ color, borderColor: color + "40", background: color + "15" }}
        >
          AI Recommendation
        </div>
      </div>

      <div className="space-y-3">
        {data.protocols.map((p, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.08 }}
            className="rounded-lg p-3"
            style={{ background: "var(--bg-card2)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${LINE_BADGE[p.line] ?? LINE_BADGE["Adjuvant"]}`}>
                {p.line}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {p.agents.map((agent) => (
                <span
                  key={agent}
                  className="text-xs px-2 py-0.5 rounded"
                  style={{ background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                >
                  {agent}
                </span>
              ))}
            </div>
            <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {p.note}
            </p>
          </motion.div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/>
          <path d="M6 4v4M6 3h.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        AI-assisted — always confirm with oncology team before prescribing
      </div>
    </motion.div>
  );
}

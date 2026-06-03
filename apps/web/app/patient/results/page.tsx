"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { downloadCasePdf } from "@/lib/download-pdf";
import { SUBTYPE_COLOR, SUBTYPE_PLAIN, type Subtype } from "@/lib/types";

function subtypeColor(s: string): string {
  return (SUBTYPE_COLOR as Record<string, string>)[s] ?? "var(--text-secondary)";
}
function subtypePlain(s: string): string {
  return (SUBTYPE_PLAIN as Record<string, string>)[s] ?? s;
}

export default function PatientResultsPage() {
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ data: any[] }>("/cases")
      .then((r) => setCases(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="w-full space-y-4 p-1">
      <div>
        <h1 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Your scan history</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Past analyses — always confirm results with your oncologist</p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-16 rounded-xl skeleton" />)}
        </div>
      ) : cases.length === 0 ? (
        <div className="text-center py-12 text-sm" style={{ color: "var(--text-secondary)" }}>
          No scans yet — upload one to get started
        </div>
      ) : (
        <div className="space-y-2">
          {cases.map((c, i) => {
            const color = subtypeColor(c.predictedSubtype);
            const plain = subtypePlain(c.predictedSubtype);
            const confidence = typeof c.confidence === "number" ? Math.round(c.confidence * 100) : null;
            const date = new Date(c.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl border p-4 flex items-center justify-between"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold" style={{ color }}>{c.predictedSubtype}</div>
                  <div className="text-xs mt-0.5 max-w-xs truncate" style={{ color: "var(--text-secondary)" }}>
                    {plain}
                  </div>
                  {confidence !== null && (
                    <div className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
                      Confidence {confidence}%
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0 ml-4">
                  <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{date}</div>
                  <button
                    onClick={() => downloadCasePdf(c.id).catch(() => {})}
                    className="text-[11px] underline mt-1 block"
                    style={{ color: "var(--teal)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    PDF
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

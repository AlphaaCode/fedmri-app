"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { downloadCasePdf } from "@/lib/download-pdf";
import { AttentionOverlay } from "@/components/AttentionOverlay";
import { SUBTYPE_COLOR, SUBTYPE_PLAIN } from "@/lib/types";

function subtypeColor(s: string): string {
  return (SUBTYPE_COLOR as Record<string, string>)[s] ?? "var(--text-secondary)";
}
function subtypePlain(s: string): string {
  return (SUBTYPE_PLAIN as Record<string, string>)[s] ?? s;
}
function isBinary(s: string): boolean {
  return s === "Luminal" || s === "Non-Luminal";
}

// Full-scan review: probability bars + the attention heatmap (real MRI slice in
// real mode) + advisory. Patients open this from their results list.
function ScanReview({ c }: { c: any }) {
  const subtype = c.predictedSubtype as string;
  const color = subtypeColor(subtype);
  const probs: number[] = Array.isArray(c.probs) ? c.probs : [];
  const bars = isBinary(subtype)
    ? [
        { label: "Luminal", p: probs[0] ?? 0, c: "#2dd4bf" },
        { label: "Non-Luminal", p: probs[1] ?? 0, c: "#f59e0b" },
      ]
    : ["Luminal A", "Luminal B", "HER2", "Triple Negative"].map((l, i) => ({
        label: l,
        p: probs[i] ?? 0,
        c: subtypeColor(l),
      }));
  const advisory = isBinary(subtype)
    ? subtype === "Luminal"
      ? "This result suggests hormone-sensitivity. Hormone therapy is often an option — discuss with your oncologist."
      : "Less hormone-sensitive. Your oncologist will advise on the most appropriate treatment path."
    : subtypePlain(subtype);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden"
    >
      <div className="grid md:grid-cols-2 gap-3 pt-3">
        <div className="space-y-3">
          <div className="space-y-2">
            {bars.map((b) => {
              const isTop = b.label === subtype;
              return (
                <div key={b.label} className="flex items-center gap-3">
                  <div className="w-24 text-xs shrink-0" style={{ color: isTop ? "var(--text-primary)" : "var(--text-secondary)" }}>{b.label}</div>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-base)" }}>
                    <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${Math.round(b.p * 100)}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }} style={{ background: isTop ? b.c : "var(--border)" }} />
                  </div>
                  <div className="w-10 text-right text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>{(b.p * 100).toFixed(1)}%</div>
                </div>
              );
            })}
          </div>
          <div className="rounded-lg p-3 text-xs leading-relaxed" style={{ background: "var(--teal-glow)", color: "#99f6e4", border: "1px solid var(--teal)30" }}>
            {advisory}
          </div>
          <button onClick={() => downloadCasePdf(c.id).catch(() => {})}
            className="text-xs px-3 py-1.5 rounded-lg font-medium"
            style={{ background: "var(--teal-glow)", color: "var(--teal)", border: "1px solid var(--teal)40" }}>
            Download PDF report
          </button>
        </div>
        <AttentionOverlay caseId={c.id} />
      </div>
    </motion.div>
  );
}

export default function PatientResultsPage() {
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

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
        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Tap a scan to review the full result — always confirm with your oncologist</p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl skeleton" />)}
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
            const open = openId === c.id;
            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl border p-4"
                style={{ background: "var(--bg-card)", borderColor: open ? "var(--teal)" : "var(--border)" }}
              >
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : c.id)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold" style={{ color }}>{c.predictedSubtype}</div>
                    <div className="text-xs mt-0.5 max-w-xs truncate" style={{ color: "var(--text-secondary)" }}>{plain}</div>
                    {confidence !== null && (
                      <div className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>Confidence {confidence}%</div>
                    )}
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{date}</div>
                    <div className="text-[11px] mt-1" style={{ color: "var(--teal)" }}>
                      {open ? "Hide ▲" : "Review full scan ▼"}
                    </div>
                  </div>
                </button>
                <AnimatePresence>{open && <ScanReview c={c} />}</AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

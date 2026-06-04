"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePortalTitle } from "@/lib/use-portal-title";
import { downloadCasePdf } from "@/lib/download-pdf";
import { ScanUpload } from "@/components/ScanUpload";
import { AttentionOverlay } from "@/components/AttentionOverlay";
import { SUBTYPE_COLOR, SUBTYPE_PLAIN, SUBTYPE_HORMONE_ADVISORY, type Subtype, type CaseResult } from "@/lib/types";

// ─── Detect binary (FedSCRT real) vs 4-class (mock) result ──────────────────
function isBinary(r: CaseResult): boolean {
  const s = r.predictedSubtype as string;
  return s === "Luminal" || s === "Non-Luminal";
}

// ─── Binary result card (same design as doctor portal) ───────────────────────
function BinaryResultCard({ result, onReset }: { result: CaseResult; onReset: () => void }) {
  const subtype = result.predictedSubtype as string;
  const isLuminal = subtype === "Luminal";
  const color = isLuminal ? "#2dd4bf" : "#f59e0b";
  const bars = [
    { label: "Luminal",     p: result.probs?.[0] ?? 0, c: "#2dd4bf" },
    { label: "Non-Luminal", p: result.probs?.[1] ?? 0, c: "#f59e0b" },
  ];
  const advisory = isLuminal
    ? "This result suggests hormone-sensitivity. Hormone therapy is often an option — discuss with your oncologist."
    : "Less hormone-sensitive. Your oncologist will advise on the most appropriate treatment path.";

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      <div className="rounded-xl border p-5 space-y-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--text-secondary)" }}>AI result</div>
            <div className="text-3xl font-bold" style={{ color }}>{subtype}</div>
            <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>Binary molecular class · AI trained across 3 hospitals</div>
          </div>
          <div className="text-sm font-bold px-3 py-1 rounded-full" style={{ background: color + "20", color, border: `1px solid ${color}50` }}>
            {Math.round(result.confidence * 100)}%
          </div>
        </div>

        {/* Probability bars */}
        <div className="space-y-2">
          {bars.map((b) => {
            const isTop = b.label === subtype;
            return (
              <div key={b.label} className="flex items-center gap-3">
                <div className="w-28 text-xs shrink-0" style={{ color: isTop ? "var(--text-primary)" : "var(--text-secondary)" }}>{b.label}</div>
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-base)" }}>
                  <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${Math.round(b.p * 100)}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }} style={{ background: isTop ? b.c : "var(--border)" }} />
                </div>
                <div className="w-10 text-right text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>{(b.p * 100).toFixed(1)}%</div>
              </div>
            );
          })}
        </div>

        {/* Advisory */}
        <div className="rounded-lg p-3 text-xs leading-relaxed" style={{ background: "var(--teal-glow)", color: "#99f6e4", border: "1px solid var(--teal)30" }}>
          {advisory}
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onReset} className="text-xs px-3 py-1.5 rounded-lg"
            style={{ background: "var(--bg-card2)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
            Analyse another
          </button>
          <button onClick={() => downloadCasePdf(result.id).catch(() => {})}
            className="text-xs px-3 py-1.5 rounded-lg font-medium"
            style={{ background: "var(--teal-glow)", color: "var(--teal)", border: "1px solid var(--teal)40" }}>
            Download PDF report
          </button>
        </div>
      </div>

      <AttentionOverlay caseId={result.id} />

      <div className="rounded-xl p-4" style={{ background: "#fb718510", border: "2px solid #fb718840", color: "#fb7185" }}>
        <div className="font-semibold mb-1 text-sm flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1l6 11H1L7 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
            <path d="M7 5.5V8M7 9.5h.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          Important
        </div>
        <p className="text-xs leading-relaxed">
          This is an educational AI tool. Only a certified oncologist can diagnose cancer.
          Always confirm results with your doctor before making any medical decisions.
        </p>
      </div>
    </motion.div>
  );
}

// ─── Standard 4-class result card ─────────────────────────────────────────────
function StandardResultCard({ result, onReset }: { result: CaseResult; onReset: () => void }) {
  const subtype = result.predictedSubtype as Subtype;
  const color = (SUBTYPE_COLOR as Record<string, string>)[subtype] ?? "var(--teal)";
  const plain  = (SUBTYPE_PLAIN  as Record<string, string>)[subtype] ?? subtype;
  const advisory = (SUBTYPE_HORMONE_ADVISORY as Record<string, string>)[subtype];
  const conf = result.confidence;
  const pct  = Math.round(conf * 100);
  const confColor = conf >= 0.7 ? "#2dd4bf" : conf >= 0.5 ? "#f59e0b" : "#fb7185";
  const confLabel = conf >= 0.7 ? "High" : conf >= 0.5 ? "Moderate" : "Low";

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      <div className="rounded-xl border p-5 space-y-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="text-xs uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>AI result</div>
        <div>
          <div className="text-3xl font-bold" style={{ color }}>{subtype}</div>
          <div className="text-sm mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{plain}</div>
        </div>

        {/* Confidence bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>AI confidence</span>
            <span className="text-sm font-semibold" style={{ color: confColor }}>{confLabel} · {pct}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-base)" }}>
            <motion.div className="h-full rounded-full" style={{ background: confColor }}
              initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: "easeOut" }} />
          </div>
        </div>

        {advisory && (
          <div className="rounded-lg p-3 text-xs leading-relaxed" style={{ background: "var(--teal-glow)", color: "#99f6e4", border: "1px solid var(--teal)30" }}>
            {advisory}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onReset} className="text-xs px-3 py-1.5 rounded-lg"
            style={{ background: "var(--bg-card2)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
            Analyse another
          </button>
          <button onClick={() => downloadCasePdf(result.id).catch(() => {})}
            className="text-xs px-3 py-1.5 rounded-lg font-medium"
            style={{ background: "var(--teal-glow)", color: "var(--teal)", border: "1px solid var(--teal)40" }}>
            Download PDF report
          </button>
        </div>
      </div>

      <AttentionOverlay caseId={result.id} />

      <div className="rounded-xl p-4" style={{ background: "#fb718510", border: "2px solid #fb718840", color: "#fb7185" }}>
        <div className="font-semibold mb-1 text-sm">⚠ Important</div>
        <p className="text-xs leading-relaxed">
          This is an educational AI tool. Only a certified oncologist can diagnose cancer.
          Always confirm results with your doctor before making any medical decisions.
        </p>
      </div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PatientScanPage() {
  usePortalTitle("Scan Analysis");
  const [result, setResult] = useState<CaseResult | null>(null);

  return (
    <div className="w-full space-y-5 p-1">
      <div>
        <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Scan Analysis</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
          Upload your MRI scan — our AI analyses it in seconds
        </p>
      </div>

      <AnimatePresence mode="wait">
        {!result ? (
          <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ScanUpload onUploaded={setResult} showSamples={false} />
          </motion.div>
        ) : isBinary(result) ? (
          <BinaryResultCard key={result.id + "-b"} result={result} onReset={() => setResult(null)} />
        ) : (
          <StandardResultCard key={result.id + "-s"} result={result} onReset={() => setResult(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

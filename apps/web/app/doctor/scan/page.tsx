"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { usePortalTitle } from "@/lib/use-portal-title";
import { useToastStore } from "@/components/ToastProvider";
import { ScanUpload } from "@/components/ScanUpload";
import { PredictionCard } from "@/components/PredictionCard";
import { MedicationCard } from "@/components/MedicationCard";
import { AttentionOverlay } from "@/components/AttentionOverlay";
import { FlTopology } from "@/components/FlTopology";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { DoctorSiloBanner } from "@/components/doctor/DoctorSiloBanner";
import { apiSubmitFeedback } from "@/lib/api";
import type { CaseResult } from "@/lib/types";

// The real FedSCRT model is binary (Luminal vs Non-Luminal); mock mode still
// returns the 4-class molecular subtypes. Detect which so we render the right
// result view (the 4-class MedicationCard/PredictionCard assume 4 classes).
function isBinaryResult(r: CaseResult): boolean {
  const s = r.predictedSubtype as string;
  return s === "Luminal" || s === "Non-Luminal";
}

function BinaryPredictionCard({ result }: { result: CaseResult }) {
  const subtype = result.predictedSubtype as string;
  const isLuminal = subtype === "Luminal";
  const color = isLuminal ? "#2dd4bf" : "#f59e0b";
  const bars = [
    { label: "Luminal", p: result.probs[0] ?? 0, c: "#2dd4bf" },
    { label: "Non-Luminal", p: result.probs[1] ?? 0, c: "#f59e0b" },
  ];
  const advisory = isLuminal
    ? "Hormone-receptor positive — hormone therapy typically indicated (clinical correlation required)."
    : "Not Luminal — hormone therapy not indicated on this basis.";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="rounded-xl border p-5"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--text-secondary)" }}>
            Predicted subtype
          </div>
          <div className="text-2xl font-bold" style={{ color }}>{subtype}</div>
          <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            Binary molecular class · FedSCRT
          </div>
        </div>
        <div className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: color + "20", color, border: `1px solid ${color}50` }}>
          {Math.round(result.confidence * 100)}%
        </div>
      </div>

      <div className="space-y-2.5 mb-5">
        {bars.map((b) => {
          const isTop = b.label === subtype;
          return (
            <div key={b.label} className="flex items-center gap-3">
              <div className="w-28 text-xs shrink-0" style={{ color: isTop ? "var(--text-primary)" : "var(--text-secondary)" }}>
                {b.label}
              </div>
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-base)" }}>
                <motion.div
                  className="h-full rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round(b.p * 100)}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  style={{ background: isTop ? b.c : "var(--border)" }}
                />
              </div>
              <div className="w-10 text-right text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>
                {(b.p * 100).toFixed(1)}%
              </div>
            </div>
          );
        })}
      </div>

      {(result.f1 != null || result.auc != null) && (
        <div className="flex items-center justify-between mb-4 text-xs" style={{ color: "var(--text-secondary)" }}>
          <span>
            {result.f1 != null && <>Model F1 {result.f1.toFixed(3)}</>}
            {result.f1 != null && result.auc != null && " · "}
            {result.auc != null && <>AUC {result.auc.toFixed(3)}</>}
          </span>
          <span>Model v{result.modelVersion}</span>
        </div>
      )}

      <div className="rounded-lg p-3 text-xs leading-relaxed" style={{ background: "var(--bg-card2)", border: `1px solid ${color}30`, color: "var(--text-secondary)" }}>
        <span className="font-semibold" style={{ color }}>Advisory · </span>
        {advisory}
      </div>
    </motion.div>
  );
}

// Doctor validates or corrects the prediction. VALIDATE confirms it; a correction
// (DISPUTE with the right subtype) triggers an active-learning fine-tune so the
// model improves. The new model version arrives over WS ('model:updated').
function FeedbackBar({ result }: { result: CaseResult }) {
  const push = useToastStore((s) => s.push);
  const [state, setState] = useState<"idle" | "picking" | "sent">("idle");
  const [busy, setBusy] = useState(false);

  const ALL: string[] = isBinaryResult(result)
    ? ["Luminal", "Non-Luminal"]
    : ["Luminal A", "Luminal B", "HER2", "Triple Negative"];
  const alternatives = ALL.filter((s) => s !== (result.predictedSubtype as string));

  async function validate() {
    setBusy(true);
    try {
      await apiSubmitFeedback(result.id, "VALIDATE");
      setState("sent");
      push("Confirmed — recorded for the global model", "success");
    } catch (e: any) {
      push(e?.message || "Could not record feedback", "warning");
    } finally {
      setBusy(false);
    }
  }

  async function dispute(correct: string) {
    setBusy(true);
    try {
      await apiSubmitFeedback(result.id, "DISPUTE", correct);
      setState("sent");
      push(`Correction sent — model retraining on ${correct}`, "success");
    } catch (e: any) {
      push(e?.message || "Could not record feedback", "warning");
    } finally {
      setBusy(false);
    }
  }

  if (state === "sent") {
    return (
      <div className="rounded-xl border p-3 text-xs flex items-center gap-2" style={{ background: "var(--bg-card)", borderColor: "var(--teal)", color: "var(--teal)" }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--teal)" }} />
        Feedback recorded — the federated model is incorporating your input.
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      {state === "idle" ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Was this prediction correct?</span>
          <div className="flex gap-2">
            <button onClick={validate} disabled={busy}
              className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
              style={{ background: "var(--teal-glow)", color: "var(--teal)", border: "1px solid #2dd4bf40" }}>
              ✓ Correct
            </button>
            <button onClick={() => setState("picking")} disabled={busy}
              className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
              style={{ background: "#fb718515", color: "#fb7185", border: "1px solid #fb718540" }}>
              ✗ Wrong
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Correct subtype is:</span>
          <div className="flex gap-2 flex-wrap">
            {alternatives.map((s) => (
              <button key={s} onClick={() => dispute(s)} disabled={busy}
                className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
                style={{ background: "var(--bg-card2)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                {s}
              </button>
            ))}
            <button onClick={() => setState("idle")} disabled={busy}
              className="text-xs px-2.5 py-1.5 rounded-lg" style={{ color: "var(--text-secondary)" }}>
              cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ScanPage() {
  usePortalTitle("Scan Analysis");
  const [result, setResult] = useState<CaseResult | null>(null);
  const push = useToastStore((s) => s.push);

  return (
    <div className="space-y-4">
      <DoctorSiloBanner />
      <PageHeader
        title="Initiate New Analysis"
        description="Federated diagnostic pipeline — binary molecular subtype (Luminal vs Non-Luminal) from the full MRI volume."
        action={
          <span className="text-[11px] px-2 py-1 rounded-full inline-flex items-center gap-1.5" style={{ background: "var(--teal-glow)", color: "var(--teal)", border: "1px solid #2dd4bf40" }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--teal)" }} />
            NODE ACTIVE
          </span>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div className="space-y-4 min-w-0">
          <ScanUpload onUploaded={(r) => { setResult(r); push(`Prediction ready — ${r.predictedSubtype}`, "success"); }} />

          <AnimatePresence>
            {result && (
              <motion.div key={result.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }} className="space-y-4">
                {isBinaryResult(result) ? (
                  <div className="grid md:grid-cols-2 gap-4">
                    <BinaryPredictionCard result={result} />
                    <AttentionOverlay caseId={result.id} />
                  </div>
                ) : (
                  <>
                    <MedicationCard subtype={result.predictedSubtype} />
                    <div className="grid md:grid-cols-2 gap-4">
                      <PredictionCard result={result} />
                      <AttentionOverlay caseId={result.id} />
                    </div>
                  </>
                )}
                <FeedbackBar result={result} />
                <div className="flex justify-end gap-2">
                  <Link href={`/doctor/chat?caseId=${result.id}`} className="rounded-lg text-sm font-semibold px-4 py-2" style={{ background: "var(--teal-glow)", color: "var(--teal)", border: "1px solid #2dd4bf40" }}>Discuss with AI assistant →</Link>
                  <Button variant="ghost" onClick={() => setResult(null)}>Analyse another scan</Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border p-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <div className="flex items-start gap-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="1.5" className="shrink-0 mt-0.5">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
              <div>
                <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Privacy Guarantee</div>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  Your raw scans never leave this hospital. Only encrypted model weight updates are shared with the global model —{" "}
                  <span style={{ color: "var(--teal)" }}>0 bytes of patient data transmitted</span>.
                </p>
              </div>
            </div>
          </div>
          <FlTopology />
          <p className="text-xs px-1" style={{ color: "var(--text-secondary)" }}>Round fires automatically on upload</p>
        </div>
      </div>
    </div>
  );
}

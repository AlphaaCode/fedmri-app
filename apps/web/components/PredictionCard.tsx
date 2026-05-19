"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SUBTYPES, SUBTYPE_COLOR, SUBTYPE_PLAIN, type Subtype, type CaseResult } from "@/lib/types";
import { apiSubmitFeedback } from "@/lib/api";

function confidenceLabel(c: number): { text: string; color: string } {
  if (c >= 0.7) return { text: "High confidence", color: "#2dd4bf" };
  if (c >= 0.5) return { text: "Moderate confidence", color: "#f59e0b" };
  return { text: "Low — seek specialist", color: "#fb7185" };
}

interface Props {
  result: CaseResult;
  onFeedbackSubmitted?: (type: "VALIDATE" | "DISPUTE") => void;
}

export function PredictionCard({ result, onFeedbackSubmitted }: Props) {
  const subtype = result.predictedSubtype;
  const color = SUBTYPE_COLOR[subtype];
  const conf = confidenceLabel(result.confidence);
  const [feedbackState, setFeedbackState] = useState<"idle" | "disputing" | "submitted">("idle");
  const [correctSubtype, setCorrectSubtype] = useState<Subtype>(subtype);
  const [submitting, setSubmitting] = useState(false);

  async function handleValidate() {
    setSubmitting(true);
    try {
      await apiSubmitFeedback(result.id, "VALIDATE");
      setFeedbackState("submitted");
      onFeedbackSubmitted?.("VALIDATE");
    } finally { setSubmitting(false); }
  }

  async function handleDispute() {
    if (feedbackState === "disputing") {
      setSubmitting(true);
      try {
        await apiSubmitFeedback(result.id, "DISPUTE", correctSubtype);
        setFeedbackState("submitted");
        onFeedbackSubmitted?.("DISPUTE");
      } finally { setSubmitting(false); }
    } else {
      setFeedbackState("disputing");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="rounded-xl border p-5"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--text-secondary)" }}>
            Predicted subtype
          </div>
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
            className="text-2xl font-bold"
            style={{ color }}
          >
            {subtype}
          </motion.div>
          <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            {SUBTYPE_PLAIN[subtype]}
          </div>
        </div>
        <div
          className="text-xs font-semibold px-3 py-1 rounded-full"
          style={{ background: color + "20", color, border: `1px solid ${color}50` }}
        >
          {(result.confidence * 100).toFixed(0)}%
        </div>
      </div>

      {/* Probability bars */}
      <div className="space-y-2.5 mb-5">
        {SUBTYPES.map((s, i) => {
          const p = result.probs[i] ?? 0;
          const isTop = s === subtype;
          return (
            <div key={s} className="flex items-center gap-3">
              <div className="w-28 text-xs shrink-0" style={{ color: isTop ? "var(--text-primary)" : "var(--text-secondary)" }}>
                {s}
              </div>
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-base)" }}>
                <motion.div
                  className="h-full rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round(p * 100)}%` }}
                  transition={{ delay: 0.2 + i * 0.05, duration: 0.6, ease: "easeOut" }}
                  style={{ background: isTop ? SUBTYPE_COLOR[s as Subtype] : "var(--border)" }}
                />
              </div>
              <div className="w-10 text-right text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>
                {(p * 100).toFixed(1)}%
              </div>
            </div>
          );
        })}
      </div>

      {/* Confidence + model version */}
      <div className="flex items-center justify-between mb-4 text-xs">
        <span style={{ color: conf.color }}>{conf.text}</span>
        <span style={{ color: "var(--text-secondary)" }}>Model v{result.modelVersion}</span>
      </div>

      {/* Feedback */}
      <AnimatePresence mode="wait">
        {feedbackState === "submitted" ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-2 text-sm rounded-lg p-2.5"
            style={{ background: "var(--bg-card2)", color: "var(--text-secondary)" }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="6" fill="#2dd4bf30" stroke="#2dd4bf" strokeWidth="1.2"/>
              <path d="M4.5 7l2 2 3-3" stroke="#2dd4bf" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Feedback recorded — model will be updated
          </motion.div>
        ) : feedbackState === "disputing" ? (
          <motion.div key="dispute-form" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-2">
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>What is the correct subtype?</div>
            <select
              value={correctSubtype}
              onChange={(e) => setCorrectSubtype(e.target.value as Subtype)}
              className="w-full rounded-lg text-sm px-3 py-2 outline-none"
              style={{ background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            >
              {SUBTYPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="flex gap-2">
              <button
                onClick={handleDispute}
                disabled={submitting}
                className="flex-1 text-xs py-2 rounded-lg font-medium transition-opacity disabled:opacity-50"
                style={{ background: "#fb718520", color: "#fb7185", border: "1px solid #fb718540" }}
              >
                {submitting ? "Submitting…" : "Confirm dispute"}
              </button>
              <button
                onClick={() => setFeedbackState("idle")}
                className="text-xs px-3 py-2 rounded-lg"
                style={{ background: "var(--bg-base)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
              >
                Cancel
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="buttons" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2">
            <button
              onClick={handleValidate}
              disabled={submitting}
              className="flex-1 text-xs py-2 rounded-lg font-medium transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: "#2dd4bf20", color: "#2dd4bf", border: "1px solid #2dd4bf40" }}
            >
              ✓ Correct
            </button>
            <button
              onClick={handleDispute}
              className="flex-1 text-xs py-2 rounded-lg font-medium transition-all hover:opacity-90"
              style={{ background: "#fb718520", color: "#fb7185", border: "1px solid #fb718540" }}
            >
              ✗ Dispute
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

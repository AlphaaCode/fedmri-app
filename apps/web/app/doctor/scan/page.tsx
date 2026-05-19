"use client";

import { useState } from "react";
import Link from "next/link";
import { useToastStore } from "@/components/ToastProvider";
import { AnimatePresence, motion } from "framer-motion";
import { ScanUpload } from "@/components/ScanUpload";
import { PredictionCard } from "@/components/PredictionCard";
import { MedicationCard } from "@/components/MedicationCard";
import { AttentionOverlay } from "@/components/AttentionOverlay";
import type { CaseResult } from "@/lib/types";

export default function ScanPage() {
  const [result, setResult] = useState<CaseResult | null>(null);
  const [feedbackDone, setFeedbackDone] = useState(false);
  const push = useToastStore((s) => s.push);

  function handleReset() {
    setResult(null);
    setFeedbackDone(false);
  }

  return (
    <div className="space-y-4">
      {/* Page title */}
      <div>
        <h1 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          Scan analysis
        </h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
          Upload a breast MRI scan — AI predicts molecular subtype in under 4 seconds
        </p>
      </div>

      <ScanUpload onUploaded={(r) => {
        setResult(r);
        setFeedbackDone(false);
        push(`Prediction ready — ${r.predictedSubtype}`, "success");
      }} />

      <AnimatePresence>
        {result && (
          <motion.div
            key={result.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="space-y-4"
          >
            {/* Medication recommendations — shown first, before detail results */}
            <MedicationCard subtype={result.predictedSubtype} />

            {/* Prediction + attention side by side */}
            <div className="grid md:grid-cols-2 gap-4">
              <PredictionCard
                result={result}
                onFeedbackSubmitted={(type) => setFeedbackDone(true)}
              />
              <AttentionOverlay caseId={result.id} />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Link
                href={`/doctor/chat?caseId=${result.id}`}
                className="text-xs px-4 py-2 rounded-lg font-medium transition-opacity hover:opacity-90"
                style={{ background: "var(--teal-glow)", color: "var(--teal)", border: "1px solid var(--teal)40" }}
              >
                Discuss with AI assistant →
              </Link>
              <button
                onClick={handleReset}
                className="text-xs px-4 py-2 rounded-lg transition-colors"
                style={{ background: "var(--bg-card2)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
              >
                Analyse another scan
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

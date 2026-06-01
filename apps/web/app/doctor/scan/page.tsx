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
import type { CaseResult } from "@/lib/types";

export default function ScanPage() {
  usePortalTitle("Scan Analysis");
  const [result, setResult] = useState<CaseResult | null>(null);
  const push = useToastStore((s) => s.push);

  return (
    <div className="space-y-4">
      <DoctorSiloBanner />
      <PageHeader
        title="Initiate New Analysis"
        description="Federated diagnostic pipeline for medical imaging — molecular subtype in under 4 seconds."
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
                <MedicationCard subtype={result.predictedSubtype} />
                <div className="grid md:grid-cols-2 gap-4">
                  <PredictionCard result={result} />
                  <AttentionOverlay caseId={result.id} />
                </div>
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

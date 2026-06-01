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
      <PageHeader title="Scan Analysis" description="Upload a breast MRI scan — AI predicts molecular subtype in under 4 seconds" />

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

        <div className="space-y-2">
          <FlTopology />
          <p className="text-xs px-1" style={{ color: "var(--text-secondary)" }}>Round fires automatically on upload</p>
        </div>
      </div>
    </div>
  );
}

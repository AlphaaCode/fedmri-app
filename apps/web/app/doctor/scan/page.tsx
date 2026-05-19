"use client";

import { useState } from "react";
import { ScanUpload } from "@/components/ScanUpload";
import { PredictionCard } from "@/components/PredictionCard";
import { AttentionOverlay } from "@/components/AttentionOverlay";
import type { CaseResult } from "@/lib/types";

export default function ScanPage() {
  const [result, setResult] = useState<CaseResult | null>(null);

  return (
    <div className="space-y-4">
      <ScanUpload onUploaded={setResult} />

      {result && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PredictionCard result={result} />
          <AttentionOverlay caseId={result.id} />
        </div>
      )}
    </div>
  );
}

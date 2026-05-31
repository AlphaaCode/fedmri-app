"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChatPanel } from "@/components/ChatPanel";
import { apiFetch } from "@/lib/api";

const DOCTOR_STARTERS = [
  "Why was this classified as Luminal A?",
  "How confident should I be in this result?",
  "What does the attention map highlight?",
  "How did the FL round improve this prediction?",
];

function DoctorChatInner() {
  const params = useSearchParams();
  const caseId = params.get("caseId") ?? undefined;
  const [ctx, setCtx] = useState<{ subtype: string; confidence: number; modelVersion: number } | null>(null);

  useEffect(() => {
    if (!caseId) return;
    apiFetch<any>(`/cases/${caseId}`).then((c) => {
      setCtx({ subtype: c.predictedSubtype, confidence: c.confidence, modelVersion: c.modelVersion });
    }).catch(() => {});
  }, [caseId]);

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Clinical AI assistant</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
          Ask about predictions, the FL training process, or how to interpret results
        </p>
      </div>
      <ChatPanel role="doctor" caseId={caseId} starters={DOCTOR_STARTERS} caseContext={ctx} />
    </div>
  );
}

// useSearchParams() must be inside a Suspense boundary for Next 16 static prerendering.
export default function DoctorChatPage() {
  return (
    <Suspense fallback={null}>
      <DoctorChatInner />
    </Suspense>
  );
}

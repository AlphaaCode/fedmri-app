"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePortalTitle } from "@/lib/use-portal-title";
import { PageHeader } from "@/components/ui/PageHeader";
import { ChatPanel } from "@/components/ChatPanel";
import { apiFetch } from "@/lib/api";

const DOCTOR_STARTERS = [
  "Why was this classified as Luminal A?",
  "How confident should I be in this result?",
  "What does the attention map highlight?",
  "How did the FL round improve this prediction?",
];

function DoctorChatInner() {
  usePortalTitle("AI Assistant");
  const params = useSearchParams();
  const caseId = params.get("caseId") ?? undefined;
  const [ctx, setCtx] = useState<{ subtype: string; confidence: number; modelVersion: number } | null>(null);

  useEffect(() => {
    if (!caseId) return;
    apiFetch<any>(`/cases/${caseId}`).then((c) => setCtx({ subtype: c.predictedSubtype, confidence: c.confidence, modelVersion: c.modelVersion })).catch(() => {});
  }, [caseId]);

  return (
    <div>
      <PageHeader title="Clinical AI assistant" description="Ask about predictions, the FL training process, or how to interpret results" />
      <ChatPanel role="doctor" caseId={caseId} starters={DOCTOR_STARTERS} caseContext={ctx} heightClass="h-[calc(100vh-12rem)]" />
    </div>
  );
}

export default function DoctorChatPage() {
  return (
    <Suspense fallback={null}>
      <DoctorChatInner />
    </Suspense>
  );
}

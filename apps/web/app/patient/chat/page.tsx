"use client";

import { ChatPanel } from "@/components/ChatPanel";

const PATIENT_STARTERS = [
  "What does Luminal A mean in simple terms?",
  "What questions should I ask my oncologist?",
  "Is this type of cancer hereditary?",
  "What lifestyle changes are generally recommended?",
];

export default function PatientChatPage() {
  return (
    <div className="space-y-3 max-w-3xl mx-auto p-5 w-full">
      <div>
        <h1 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Your health guide</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
          General information about your scan — for clinical questions, always speak with your oncologist
        </p>
      </div>
      <ChatPanel role="patient" starters={PATIENT_STARTERS} caseContext={null} />
    </div>
  );
}

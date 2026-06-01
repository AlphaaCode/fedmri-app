"use client";

import { useState } from "react";
import Link from "next/link";
import { usePortalTitle } from "@/lib/use-portal-title";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";

const FAQ = [
  { q: "How accurate are the predictions?", a: "The current global model (DINOv2-MIL v10) reaches an F1 macro of 0.41 across the four molecular subtypes, trained federally across 3 hospitals. Treat every prediction as decision support — always confirm with histopathology and your oncology team." },
  { q: "Does any patient data leave my hospital?", a: "No. Federated learning shares only model weight updates between rounds — 0 bytes of raw patient data are ever transmitted. Scans stay inside your hospital silo." },
  { q: "How do I dispute a prediction?", a: "On a result, use the Manual Override / Dispute action in the prediction card to record the correct subtype. Your feedback is logged for model improvement." },
  { q: "What is the model trained on?", a: "Breast DCE-MRI across 3 participating hospitals (737 cases total), classifying the four PAM50 molecular subtypes: Luminal A, Luminal B, HER2, and Triple Negative." },
];

export default function DoctorSupportPage() {
  usePortalTitle("Support");
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="space-y-4 max-w-3xl">
      <PageHeader title="Support" description="Help with predictions, privacy, and the federated network" />

      <Panel title="Contact">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Questions, bugs, or access requests? Email the FedMRI team — we typically respond within one business day.
        </p>
        <a href="mailto:support@fedmri.local" className="inline-block mt-3 text-sm px-4 py-2 rounded-lg" style={{ background: "var(--teal-glow)", color: "var(--teal)", border: "1px solid #2dd4bf40" }}>
          support@fedmri.local
        </a>
      </Panel>

      <Panel title="Frequently asked questions">
        <div>
          {FAQ.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={i} className="py-2 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-4 text-left text-sm py-1"
                  style={{ color: "var(--text-primary)" }}
                >
                  <span>{item.q}</span>
                  <span style={{ color: "var(--text-secondary)" }}>{isOpen ? "−" : "+"}</span>
                </button>
                {isOpen && (
                  <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{item.a}</p>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="Documentation">
        <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
          New to FedMRI? The Documentation screen covers the workflow, the molecular subtypes, and how federated learning keeps data private.
        </p>
        <Link href="/doctor/docs" className="text-sm" style={{ color: "var(--teal)" }}>Open Documentation →</Link>
      </Panel>
    </div>
  );
}

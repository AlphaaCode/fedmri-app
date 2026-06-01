"use client";

import Link from "next/link";
import { usePortalTitle } from "@/lib/use-portal-title";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { SUBTYPES, SUBTYPE_PLAIN, SUBTYPE_COLOR } from "@/lib/types";

export default function DoctorDocsPage() {
  usePortalTitle("Documentation");
  return (
    <div className="space-y-4 max-w-3xl">
      <PageHeader title="Documentation" description="How FedMRI works — for clinicians" />

      <Panel title="Getting started">
        <ol className="text-sm space-y-2 list-decimal list-inside" style={{ color: "var(--text-secondary)" }}>
          <li>Open <span style={{ color: "var(--text-primary)" }}>Scan Analysis</span> and drop a breast MRI (PNG, JPG, NIfTI, or DICOM).</li>
          <li>The AI returns a molecular-subtype prediction with a confidence score in under 4 seconds.</li>
          <li>Review the attention map to see which regions drove the prediction, then validate or dispute it.</li>
          <li>Use <span style={{ color: "var(--text-primary)" }}>AI Assistant</span> to ask follow-up questions about any case.</li>
        </ol>
      </Panel>

      <Panel title="Molecular subtypes" subtitle="The four PAM50 classes this model distinguishes">
        <div className="space-y-3">
          {SUBTYPES.map((s) => (
            <div key={s}>
              <div className="text-sm font-semibold" style={{ color: SUBTYPE_COLOR[s] }}>{s}</div>
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{SUBTYPE_PLAIN[s]}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="How federated learning works here" subtitle="Privacy by construction">
        <div className="text-sm space-y-2" style={{ color: "var(--text-secondary)" }}>
          <p>The model is trained across <span style={{ color: "var(--text-primary)" }}>3 hospitals</span> (737 cases total) without any raw scan ever leaving its hospital silo. Each round, only model weight updates are shared — <span style={{ color: "var(--teal)" }}>0 bytes of patient data are transmitted</span>.</p>
          <p>Training ran for <span style={{ color: "var(--text-primary)" }}>10 rounds</span> — FedAvg for rounds 1–5, then FedProx for rounds 6–10 to handle the hospitals' non-IID data. The current global model is <span style={{ color: "var(--text-primary)" }}>DINOv2-MIL v10</span> (F1 macro 0.41).</p>
        </div>
      </Panel>

      <Panel title="Reading the attention map" subtitle="What the heatmap shows">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          The overlay highlights the regions that most influenced the prediction, using a jet colormap (blue = low influence → red = high). Use it to sanity-check that the model focused on the lesion rather than artifacts. It is an explainability aid, not a diagnosis.
        </p>
      </Panel>

      <Panel title="Model & metrics">
        <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
          Convergence curves, per-class F1, and the 4×4 confusion matrix — plus the federated-vs-centralized privacy gap — are on the Model Performance screen.
        </p>
        <Link href="/doctor/model" className="text-sm" style={{ color: "var(--teal)" }}>Open Model Performance →</Link>
      </Panel>
    </div>
  );
}

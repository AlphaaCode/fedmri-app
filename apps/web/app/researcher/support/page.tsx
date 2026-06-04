"use client";

import { useState } from "react";
import { usePortalTitle } from "@/lib/use-portal-title";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

// ─── FAQ data ─────────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: "What data does this network share?",
    a: "Only model weight updates (gradients) are exchanged between nodes. Raw patient scans never leave their originating hospital — 0 bytes of raw imaging data are transmitted across the network. This is the core privacy guarantee of federated learning.",
  },
  {
    q: "Which model powers the predictions?",
    a: "A DINOv2-based multiple-instance learning (MIL) classifier that predicts breast-cancer molecular subtypes: Luminal A, Luminal B, HER2-enriched, and Triple Negative. The model is trained collaboratively across the three hospital nodes without centralizing any scan data.",
  },
  {
    q: "Which aggregation strategies does FedMRI use?",
    a: "FedMRI uses FedAvg (weighted average of local weight updates) and FedSCRT (Federated Classifier Retraining). FedSCRT freezes the ConvNeXt-Nano backbone and only federates the retrained MIL head — achieving macro-F1 0.629 vs FedAvg 0.429 on non-IID breast MRI data (Dirichlet α=0.5).",
  },
  {
    q: "Can the researcher view patient images?",
    a: "No. The research portal exposes only aggregate and model-level metrics — convergence curves, F1 scores, confusion matrices, and participation logs. Individual scan images are hospital-silo data and are inaccessible to this portal by design.",
  },
];

// ─── FAQ Item ─────────────────────────────────────────────────────────────────

function FaqItem({
  q,
  a,
  open,
  onToggle,
}: {
  q: string;
  a: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="border-b last:border-b-0 py-3"
      style={{ borderColor: "var(--border)" }}
    >
      <button
        className="w-full flex items-center justify-between gap-3 text-left"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span
          className="text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          {q}
        </span>
        <span
          className="flex-shrink-0 text-lg leading-none select-none"
          style={{ color: "var(--teal)", transform: open ? "rotate(45deg)" : "none", transition: "transform 0.15s" }}
          aria-hidden
        >
          +
        </span>
      </button>
      {open && (
        <p
          className="mt-2 text-sm leading-relaxed"
          style={{ color: "var(--text-secondary)" }}
        >
          {a}
        </p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SupportPage() {
  usePortalTitle("Support");

  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [docsOpen, setDocsOpen] = useState(false);

  function toggle(i: number) {
    setOpenIndex((prev) => (prev === i ? null : i));
  }

  return (
    <div className="w-full space-y-5 min-h-full">
      <PageHeader
        title="Support"
        description="Help and documentation for the federated research network."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5 items-start">
        {/* ── FAQ (main) ── */}
        <Panel
          title="Frequently asked questions"
          subtitle="Technical and privacy questions about the federated network."
        >
          <div className="mt-1">
            {FAQ_ITEMS.map((item, i) => (
              <FaqItem
                key={i}
                q={item.q}
                a={item.a}
                open={openIndex === i}
                onToggle={() => toggle(i)}
              />
            ))}
          </div>
        </Panel>

        {/* ── Sidebar: docs + contact + status ── */}
        <div className="space-y-4">
          <Card>
            <div className="flex flex-col gap-3">
              <div>
                <div className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Documentation</div>
                <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  Architecture overview, FL round lifecycle, API reference, and
                  researcher workflow guides for the FedMRI network.
                </p>
              </div>
              <div>
                <Button variant="teal" className="text-xs px-3 py-1.5" onClick={() => setDocsOpen(true)}>
                  Open documentation
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex flex-col gap-3">
              <div>
                <div className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Contact</div>
                <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  Reach the FL network operations team for technical issues,
                  access requests, or coordination queries.
                </p>
              </div>
              <div>
                <a href="mailto:support@fedmri.local" tabIndex={-1}>
                  <Button variant="ghost" className="text-xs px-3 py-1.5">Email operations team</Button>
                </a>
              </div>
            </div>
          </Card>

          <Card>
            <div className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--text-secondary)" }}>Network operations</div>
            <div className="space-y-2 text-xs" style={{ color: "var(--text-secondary)" }}>
              <div className="flex items-center justify-between">
                <span>Response window</span><span style={{ color: "var(--text-primary)" }}>24 hours</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Email</span><span style={{ color: "var(--teal)" }}>support@fedmri.local</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Network status</span>
                <span className="inline-flex items-center gap-1.5" style={{ color: "var(--teal)" }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--teal)" }} />Operational
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {docsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(5,10,14,0.85)", backdropFilter: "blur(4px)" }}
          onClick={() => setDocsOpen(false)}>
          <div className="w-full max-w-2xl rounded-2xl border overflow-hidden"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>FedMRI Documentation</div>
              <button onClick={() => setDocsOpen(false)} className="text-sm px-2 py-1 rounded" style={{ color: "var(--text-secondary)" }}>✕</button>
            </div>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto text-sm" style={{ color: "var(--text-primary)" }}>
              <section>
                <h3 className="font-semibold mb-1">Overview</h3>
                <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>FedMRI trains a ConvNeXt-Nano + GatedAttentionMIL classifier (FedSCRT) across 3 hospital nodes. Raw scans never leave their silo — only model head weights are exchanged.</p>
              </section>
              <section>
                <h3 className="font-semibold mb-1">FL Round Lifecycle</h3>
                <pre className="text-[11px] rounded-lg p-3 font-mono overflow-x-auto" style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}>{`Doctor uploads scan
  → POST /cases → InferenceService.predict() [sync ~2s]
  → case saved → response returned to doctor
  → (async) FLRoundService.triggerRound()
      → POST /round/start (fl-coordinator)
      → coordinator runs mock/Flower round (~30s)
      → POST /internal/fl/round-complete (signed webhook)
  → NestJS saves fl_round + broadcasts WS 'fl:round:complete'`}</pre>
              </section>
              <section>
                <h3 className="font-semibold mb-1">FedSCRT Strategy</h3>
                <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>Freezes the ConvNeXt-Nano backbone. Each hospital retrains only the GatedAttentionMIL head on its local data. The server FedAvg-averages only the head weights. Achieves macro-F1 0.629 vs FedAvg 0.429 on non-IID data (Dirichlet α=0.5).</p>
              </section>
              <section>
                <h3 className="font-semibold mb-1">Privacy Guarantee</h3>
                <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>Every PrivacyAuditLog entry records rawDataTransmitted=0. The HospitalSiloGuard blocks cross-hospital case reads. Scans are stored under uploads/hospitals/&#123;id&#125;/ and are never cross-shared.</p>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

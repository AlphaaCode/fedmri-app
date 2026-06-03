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

  function toggle(i: number) {
    setOpenIndex((prev) => (prev === i ? null : i));
  }

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader
        title="Support"
        description="Help and documentation for the federated research network."
      />

      {/* ── Quick-action cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Documentation card */}
        <Card>
          <div className="flex flex-col gap-3">
            <div>
              <div
                className="text-sm font-semibold mb-1"
                style={{ color: "var(--text-primary)" }}
              >
                Documentation
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Architecture overview, FL round lifecycle, API reference, and
                researcher workflow guides for the FedMRI network.
              </p>
            </div>
            <div>
              <a href="#" tabIndex={-1}>
                <Button variant="teal" className="text-xs px-3 py-1.5">
                  Open documentation
                </Button>
              </a>
            </div>
          </div>
        </Card>

        {/* Contact card */}
        <Card>
          <div className="flex flex-col gap-3">
            <div>
              <div
                className="text-sm font-semibold mb-1"
                style={{ color: "var(--text-primary)" }}
              >
                Contact
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Reach the FL network operations team for technical issues,
                access requests, or coordination queries.
              </p>
            </div>
            <div>
              <a href="mailto:support@fedmri.local" tabIndex={-1}>
                <Button variant="ghost" className="text-xs px-3 py-1.5">
                  Email operations team
                </Button>
              </a>
            </div>
          </div>
        </Card>
      </div>

      {/* ── FAQ ── */}
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

      {/* ── Status note ── */}
      <p
        className="text-[11px]"
        style={{ color: "var(--text-secondary)" }}
      >
        Network operations team · 24h response window · support@fedmri.local
      </p>
    </div>
  );
}

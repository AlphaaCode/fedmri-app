"use client";

import { useState } from "react";
import { usePortalTitle } from "@/lib/use-portal-title";

const TOC: { section: string; items: string[] }[] = [
  { section: "Getting Started", items: ["Introduction", "Quick Start", "Node Provisioning"] },
  { section: "Integration", items: ["Node Synchronization", "API Reference", "Model Lifecycle", "Webhooks"] },
  { section: "Compliance & Security", items: ["HIPAA Guidelines", "Data Sovereignty"] },
];

const BLURB: Record<string, string> = {
  Introduction: "FedMRI trains a breast-MRI molecular-subtype classifier (DINoV2-MIL) across 3 hospitals without moving raw scans. This guide covers how the federated network operates from a clinician's seat.",
  "Quick Start": "Open Scan Analysis, drop a breast MRI (PNG / JPG / NIfTI / DICOM), and the model returns a molecular-subtype prediction with a confidence score in under 4 seconds.",
  "Node Provisioning": "Each hospital runs a federated client (Node Alpha-7 for your site). Provisioning registers the node with the central aggregator and exchanges the initial global weights.",
  "API Reference": "All clinical endpoints sit behind JWT auth and a hospital-silo guard. /cases is scoped to your hospital; /model/* exposes aggregate metrics only.",
  "Model Lifecycle": "The global model advances one integer version per completed round. Current: FedSCRT v10 (macro-F1 0.629), reached after 10 rounds — FedAvg r1–5 to build the base, then FedSCRT r6–10 (backbone frozen, MIL head retrained).",
  Webhooks: "When a round completes, the coordinator posts a signed round-complete event back to the backend, which records the new metrics and broadcasts a WebSocket update to connected clinicians.",
  "HIPAA Guidelines": "No raw patient data ever leaves a hospital silo. Only model weight updates are exchanged — every privacy-audit record logs 0 bytes of raw data transmitted.",
  "Data Sovereignty": "Scans are stored under uploads/hospitals/{id}/ and are never cross-shared. A doctor at one hospital cannot read another hospital's cases (enforced by the silo guard).",
};

function CodeBlock() {
  return (
    <pre
      className="rounded-lg p-4 text-[12px] leading-relaxed overflow-x-auto font-mono"
      style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
    >
      <span style={{ color: "var(--text-secondary)" }}># FL round lifecycle (mock or Flower backend){"\n"}</span>
      <span style={{ color: "var(--teal)" }}>POST</span> /round/start            <span style={{ color: "var(--text-secondary)" }}># aggregator runs one round (~30s){"\n"}</span>
      <span style={{ color: "var(--teal)" }}>POST</span> /internal/fl/round-complete   <span style={{ color: "var(--text-secondary)" }}># signed webhook → backend{"\n"}</span>
      {"  "}{"{"} <span style={{ color: "var(--blue-accent)" }}>&quot;roundNumber&quot;</span>: 10, <span style={{ color: "var(--blue-accent)" }}>&quot;globalF1After&quot;</span>: 0.41, <span style={{ color: "var(--blue-accent)" }}>&quot;modelVersion&quot;</span>: 10 {"}"}
    </pre>
  );
}

function SyncDiagram() {
  const node = (label: string) => (
    <div className="rounded-lg px-3 py-2 text-xs text-center" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>{label}</div>
  );
  return (
    <div className="flex items-center justify-center gap-3 py-3">
      <div className="space-y-2">{node("Hospital A")}{node("Hospital B")}{node("Hospital C")}</div>
      <div style={{ color: "var(--teal)" }}>→</div>
      <div className="rounded-lg px-4 py-3 text-xs text-center font-semibold" style={{ background: "var(--teal-glow)", border: "1px solid #2dd4bf40", color: "var(--teal)" }}>Central<br />Aggregator</div>
      <div style={{ color: "var(--teal)" }}>→</div>
      {node("Global model v10")}
    </div>
  );
}

function NodeSyncArticle() {
  return (
    <>
      <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>Understanding Federated Node Synchronization</h1>
      <div className="text-[11px] mt-1 mb-4" style={{ color: "var(--text-secondary)" }}>Updated recently · 8 min read</div>

      <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>The sync lifecycle</h2>
      <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--text-secondary)" }}>
        Node synchronization is the process by which the 3 participating hospitals align their local model weights
        before and after each federated round. Each site trains on its own scans, then shares only the resulting
        weight updates — <span style={{ color: "var(--teal)" }}>0 bytes of raw patient data are transmitted</span>.
      </p>
      <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--text-secondary)" }}>
        When the central aggregator opens a round, every node downloads the current global weights, verifies integrity
        via SHA-256, trains locally for a few epochs, and reports its delta. The aggregator combines them with
        FedAvg (rounds 1–5) or FedSCRT (rounds 6–10) and publishes the next global model version.
      </p>

      <SyncDiagram />

      <h2 className="text-sm font-semibold mb-2 mt-4" style={{ color: "var(--text-primary)" }}>API implementation</h2>
      <CodeBlock />

      <div className="rounded-lg p-3 mt-4 text-xs flex items-start gap-2" style={{ background: "var(--teal-glow)", border: "1px solid #2dd4bf30", color: "var(--teal-on-glow)" }}>
        <span style={{ color: "var(--teal)" }}>ⓘ</span>
        <span><strong style={{ color: "var(--teal)" }}>Privacy by construction:</strong> the silo guard blocks every cross-hospital read, and each round writes a privacy-audit record with rawDataTransmitted = 0.</span>
      </div>

      <div className="flex items-center justify-between mt-5 pt-4 border-t text-xs" style={{ borderColor: "var(--border)" }}>
        <span style={{ color: "var(--text-secondary)" }}>← Node Provisioning</span>
        <span style={{ color: "var(--teal)" }}>API Reference →</span>
      </div>
    </>
  );
}

export default function DoctorDocsPage() {
  usePortalTitle("Documentation");
  const [active, setActive] = useState("Node Synchronization");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Documentation</h1>
          <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            Integrate, train, and operate federated AI across clinical sites — without raw data ever leaving a hospital.
          </p>
        </div>
        <input
          placeholder="Search documentation…"
          className="text-sm rounded-lg px-3 py-2 outline-none w-full sm:w-64"
          style={{ background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
        <nav className="space-y-4 lg:sticky lg:top-0 self-start">
          {TOC.map((g) => (
            <div key={g.section}>
              <div className="text-[11px] uppercase tracking-widest mb-1.5" style={{ color: "var(--text-secondary)" }}>{g.section}</div>
              <div className="space-y-0.5">
                {g.items.map((it) => {
                  const on = it === active;
                  return (
                    <button
                      key={it}
                      type="button"
                      onClick={() => setActive(it)}
                      className="block w-full text-left text-sm rounded-lg px-2.5 py-1.5 transition-colors"
                      style={{ background: on ? "var(--teal-glow)" : "transparent", color: on ? "var(--teal)" : "var(--text-secondary)", border: "1px solid " + (on ? "#2dd4bf40" : "transparent") }}
                    >
                      {it}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <article className="rounded-xl border p-6 min-w-0" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="text-[11px] mb-3" style={{ color: "var(--text-secondary)" }}>Docs → {active}</div>
          {active === "Node Synchronization" ? (
            <NodeSyncArticle />
          ) : (
            <>
              <h1 className="text-xl font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{active}</h1>
              <div className="text-[11px] mb-4" style={{ color: "var(--text-secondary)" }}>Reference</div>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{BLURB[active]}</p>
            </>
          )}
        </article>
      </div>
    </div>
  );
}

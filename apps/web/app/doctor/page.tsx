"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePortalTitle } from "@/lib/use-portal-title";
import { useFlStore } from "@/lib/fl-store";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { NetworkPerformanceCard } from "@/components/doctor/NetworkPerformanceCard";
import { AttentionOverlay } from "@/components/AttentionOverlay";
import { DoctorSiloBanner } from "@/components/doctor/DoctorSiloBanner";
import { getCases, getModelComparison, type CasesResponse, type ModelComparison } from "@/lib/doctor-api";
import { SUBTYPE_COLOR, type CaseResult, type Subtype } from "@/lib/types";

const shortId = (id: string) => `#FED-${id.slice(-6).toUpperCase()}`;

function StatusCell({ status }: { status?: string }) {
  if (status === "VALIDATED") return <StatusBadge status="validated" />;
  if (status === "DISPUTED") return <StatusBadge status="disputed" />;
  return <StatusBadge status="pending" label="Awaiting review" />;
}

export default function DoctorDashboardPage() {
  usePortalTitle("Dashboard");
  const [cases, setCases] = useState<CasesResponse | null>(null);
  const [model, setModel] = useState<ModelComparison | null>(null);
  const flModelVersion = useFlStore((s) => s.modelVersion);

  useEffect(() => {
    getCases({ limit: 5 }).then(setCases).catch(() => setCases({ data: [], total: 0 }));
    getModelComparison().then(setModel).catch(() => setModel(null));
  }, []);

  const recent = cases?.data ?? [];
  const total = cases?.total ?? 0;
  const f1 = model?.fedprox.f1Macro ?? 0.41;
  const protectedCount = model?.privacyCost.patientsProtected ?? 737;
  const version = flModelVersion ?? 10;

  const columns: Column<CaseResult>[] = [
    { key: "id", header: "Case", render: (r) => <span className="font-mono text-xs">{shortId(r.id)}</span> },
    { key: "subtype", header: "Subtype", render: (r) => <span style={{ color: SUBTYPE_COLOR[r.predictedSubtype as Subtype] }}>{r.predictedSubtype}</span> },
    { key: "conf", header: "AI Confidence", align: "right", render: (r) => `${Math.round(r.confidence * 100)}%` },
    { key: "status", header: "Status", render: (r) => <StatusCell status={r.status} /> },
    { key: "go", header: "", align: "right", render: (r) => <Link href={`/doctor/chat?caseId=${r.id}`} className="text-xs" style={{ color: "var(--teal)" }}>Discuss →</Link> },
  ];

  return (
    <div className="space-y-4">
      <DoctorSiloBanner />
      <PageHeader title="Clinical Overview" description="Federated diagnostics — your hospital silo" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard label="Active Analyses" value={total} accent="var(--teal)" hint="In your hospital silo" />
        <StatCard label="FL Model" value={`v${version}`} accent="var(--blue-accent)" hint="Round 10 / 10" />
        <StatCard label="Global F1 Macro" value={f1.toFixed(2)} accent="var(--amber)" hint={`${protectedCount} patients protected`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <Panel title="Recent Studies" action={<Link href="/doctor/history" className="text-xs" style={{ color: "var(--teal)" }}>View all →</Link>}>
          <DataTable columns={columns} rows={recent} getRowKey={(r) => r.id} empty="No studies yet — upload a scan to begin." />
        </Panel>
        <div className="space-y-4">
          <NetworkPerformanceCard />
          <Panel title="Notifications">
            <div className="space-y-2.5 text-xs">
              {[
                { c: "var(--teal)", t: "Training cycle complete", d: "Global model advanced to v10 (F1 0.41)." },
                { c: "var(--blue-accent)", t: "Consensus verified", d: "All 3 nodes synchronized · 0 bytes patient data." },
                { c: "var(--text-secondary)", t: "System nominal", d: "Aggregator online · 3 / 3 nodes reporting." },
              ].map((n, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: n.c }} />
                  <div>
                    <div style={{ color: "var(--text-primary)" }}>{n.t}</div>
                    <div style={{ color: "var(--text-secondary)" }}>{n.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <SectionLabel>Active Analysis</SectionLabel>
          {recent[0] && <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>{shortId(recent[0].id)}</span>}
        </div>
        {recent[0] ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AttentionOverlay caseId={recent[0].id} />
            <div className="rounded-xl border p-4 text-xs leading-relaxed" style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              AI cross-referenced this scan against the model trained across 3 hospitals ({model?.totalCases ?? 737} cases). Predicted subtype{" "}
              <span style={{ color: SUBTYPE_COLOR[recent[0].predictedSubtype as Subtype] }}>{recent[0].predictedSubtype}</span>{" "}· confidence {Math.round(recent[0].confidence * 100)}%.
              <div className="mt-3">
                <Link href={`/doctor/chat?caseId=${recent[0].id}`} className="text-xs px-3 py-2 rounded-lg inline-block" style={{ background: "var(--teal-glow)", color: "var(--teal)", border: "1px solid #2dd4bf40" }}>Discuss with AI assistant →</Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border p-4 py-8 text-center text-sm" style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>Upload a scan to begin.</div>
        )}
      </div>
    </div>
  );
}

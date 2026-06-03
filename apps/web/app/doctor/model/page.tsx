"use client";

import { useEffect, useState } from "react";
import { usePortalTitle } from "@/lib/use-portal-title";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StatCard } from "@/components/ui/StatCard";
import { ConvergenceChart } from "@/components/ConvergenceChart";
import { PerClassChart } from "@/components/PerClassChart";
import { ConfusionMatrix } from "@/components/ConfusionMatrix";

interface History { curves: any; baseline: any; }
interface PerClass { subtypes: string[]; strategies: string[]; values: any; }
interface Confusion { subtypes: string[]; matrix: any; }
interface Compare { centralized: { f1Macro: number }; fedscrt: { f1Macro: number }; gap: number; privacyCost: { patientsProtected: number }; totalCases: number; }

export default function ModelMetricsPage() {
  usePortalTitle("Model Performance");
  const [history, setHistory] = useState<History | null>(null);
  const [perClass, setPerClass] = useState<PerClass | null>(null);
  const [confusion, setConfusion] = useState<Confusion | null>(null);
  const [compare, setCompare] = useState<Compare | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<History>("/model/history"),
      apiFetch<PerClass>("/model/per-class"),
      apiFetch<Confusion>("/model/confusion-matrix"),
      apiFetch<Compare>("/model/comparison"),
    ])
      .then(([h, p, c, cmp]) => { setHistory(h); setPerClass(p); setConfusion(c); setCompare(cmp); })
      .catch((e) => setErr(e?.message || "Failed to load metrics"));
  }, []);

  if (err) {
    return <div className="text-sm rounded-lg p-3" style={{ background: "#fb718515", color: "#fb7185" }}>{err}</div>;
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Model performance" description="Federated vs centralized convergence, per-class F1, and confusion matrix" />

      {compare && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <StatCard label="Centralized F1" value={compare.centralized.f1Macro.toFixed(2)} accent="#f59e0b" />
          <StatCard label="FedSCRT F1" value={(compare.fedscrt ?? (compare as any).fedprox ?? { f1Macro: 0 }).f1Macro.toFixed(2)} accent="#2dd4bf" />
          <StatCard
            label="Privacy gap"
            value={`${compare.gap >= 0 ? "+" : ""}${compare.gap.toFixed(2)}`}
            accent={compare.gap < 0 ? "#fb7185" : "#2dd4bf"}
            hint={`Centralized − FedSCRT: ${Math.abs(compare.gap).toFixed(2)} F1 lower`}
          />
          <StatCard
            label="Patients protected"
            value={compare.privacyCost.patientsProtected.toString()}
            accent="#60a5fa"
            hint="Raw MRI volumes never shared"
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Convergence curve" subtitle="F1 macro over FL rounds (Centralized dashed = upper bound with full data access)">
          {history ? <ConvergenceChart data={history} /> : <div className="h-[260px] rounded skeleton" />}
        </Panel>

        <Panel title="Per-class F1" subtitle="How each strategy performs across subtypes">
          {perClass ? <PerClassChart data={perClass} /> : <div className="h-[260px] rounded skeleton" />}
        </Panel>

        <Panel title="Confusion matrix" subtitle="True (corrected) vs predicted subtype — diagonal = correct" className="lg:col-span-2">
          {confusion ? <ConfusionMatrix data={confusion} /> : <div className="h-[260px] rounded skeleton" />}
        </Panel>
      </div>

      {compare && (
        <div className="rounded-xl p-3 text-xs" style={{ background: "var(--teal-glow)", border: "1px solid #2dd4bf30", color: "#99f6e4" }}>
          <strong style={{ color: "var(--teal)" }}>Privacy cost of centralization:</strong>{" "}
          {compare.privacyCost.patientsProtected} patients' raw MRI scans would have been shared to achieve the
          centralized baseline. With federated learning, the {Math.abs(compare.gap).toFixed(2)} F1 gap is the price paid
          for keeping {compare.privacyCost.patientsProtected} patients' data inside their hospital.
        </div>
      )}
    </div>
  );
}

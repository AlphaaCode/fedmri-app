"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { ConvergenceChart } from "@/components/ConvergenceChart";
import { PerClassChart } from "@/components/PerClassChart";
import { ConfusionMatrix } from "@/components/ConfusionMatrix";

interface History { curves: any; baseline: any; }
interface PerClass { subtypes: string[]; strategies: string[]; values: any; }
interface Confusion { subtypes: string[]; matrix: any; }
interface Compare { centralized: { f1Macro: number }; fedprox: { f1Macro: number }; gap: number; privacyCost: { patientsProtected: number }; totalCases: number; }

export default function ModelMetricsPage() {
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
      <div>
        <h1 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Model performance</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
          Federated vs centralized convergence, per-class F1, and confusion matrix
        </p>
      </div>

      {/* Comparison card */}
      {compare && (
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 md:grid-cols-4 gap-3"
        >
          <Stat label="Centralized F1" value={compare.centralized.f1Macro.toFixed(2)} color="#f59e0b" />
          <Stat label="FedProx F1" value={compare.fedprox.f1Macro.toFixed(2)} color="#2dd4bf" />
          <Stat
            label="Privacy gap"
            value={`${compare.gap >= 0 ? "+" : ""}${compare.gap.toFixed(2)}`}
            color={compare.gap < 0 ? "#fb7185" : "#2dd4bf"}
            hint={`Centralized − FedProx: ${Math.abs(compare.gap).toFixed(2)} F1 lower`}
          />
          <Stat
            label="Patients protected"
            value={compare.privacyCost.patientsProtected.toString()}
            color="#60a5fa"
            hint="Raw MRI volumes never shared"
          />
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Convergence */}
        <Panel title="Convergence curve" subtitle="F1 macro over FL rounds (Centralized dashed = upper bound with full data access)">
          {history ? <ConvergenceChart data={history} /> : <Skeleton />}
        </Panel>

        {/* Per-class */}
        <Panel title="Per-class F1" subtitle="How each strategy performs across subtypes">
          {perClass ? <PerClassChart data={perClass} /> : <Skeleton />}
        </Panel>

        {/* Confusion */}
        <Panel title="Confusion matrix" subtitle="True (corrected) vs predicted subtype — diagonal = correct" className="lg:col-span-2">
          {confusion ? <ConfusionMatrix data={confusion} /> : <Skeleton />}
        </Panel>
      </div>

      {/* Privacy framing */}
      {compare && (
        <div className="rounded-xl p-3 text-xs" style={{ background: "var(--teal-glow)", border: "1px solid var(--teal)30", color: "#99f6e4" }}>
          <strong style={{ color: "var(--teal)" }}>Privacy cost of centralization:</strong>{" "}
          {compare.privacyCost.patientsProtected} patients' raw MRI scans would have been shared to achieve the
          centralized baseline. With federated learning, the {Math.abs(compare.gap).toFixed(2)} F1 gap is the price paid
          for keeping {compare.privacyCost.patientsProtected} patients' data inside their hospital.
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color, hint }: { label: string; value: string; color: string; hint?: string }) {
  return (
    <div className="rounded-xl p-4 border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="text-[11px] uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>{label}</div>
      <div className="text-2xl font-bold mt-1 tabular-nums" style={{ color }}>{value}</div>
      {hint && <div className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>{hint}</div>}
    </div>
  );
}

function Panel({ title, subtitle, className, children }: { title: string; subtitle?: string; className?: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border p-4 ${className ?? ""}`}
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div className="mb-3">
        <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{title}</div>
        {subtitle && <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{subtitle}</div>}
      </div>
      {children}
    </motion.div>
  );
}

function Skeleton() {
  return <div className="h-[260px] rounded skeleton" />;
}

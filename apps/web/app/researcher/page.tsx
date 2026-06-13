"use client";

import { useEffect, useState } from "react";
import { usePortalTitle } from "@/lib/use-portal-title";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Panel } from "@/components/ui/Panel";
import { DataTable, Column } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConvergenceChart } from "@/components/ConvergenceChart";
import { ConfusionMatrix } from "@/components/ConfusionMatrix";
import { PerClassChart } from "@/components/PerClassChart";
import { useToastStore } from "@/components/ToastProvider";
import {
  getOverview,
  getTrainingLog,
  getModelVersions,
  getModelHistory,
  getConfusionMatrix,
  getPerClass,
  getModelComparison,
  ResearcherOverview,
  TrainingRound,
  ModelVersion,
  PerClassResponse,
  ModelComparison,
} from "@/lib/researcher-api";

// ─── Small inline "section unavailable" note ──────────────────────────────────

function Unavailable({ msg }: { msg?: string }) {
  return (
    <div
      className="text-xs py-4 text-center"
      style={{ color: "var(--text-secondary)", opacity: 0.6 }}
    >
      {msg ?? "Unavailable"}
    </div>
  );
}

// ─── Model card — the deployed model's identity (architecture + provenance) ────

function ModelCard({ overview }: { overview: ResearcherOverview | null }) {
  const rows: { k: string; v: string }[] = [
    { k: "Architecture", v: "ConvNeXt-Nano + Gated-Attention MIL" },
    { k: "Task", v: "Binary · Luminal vs Non-Luminal" },
    { k: "Aggregation", v: "FedSCRT — frozen backbone, federated cRT head" },
    { k: "Input", v: "3D DCE-MRI volume (per-slice MIL)" },
    { k: "Training", v: `${overview?.hospitals ?? 3} hospitals · 737 patients` },
    { k: "Privacy", v: "0 bytes of raw data shared" },
  ];
  return (
    <Panel title="Model card" subtitle="Deployed global model">
      <div className="rounded-lg border divide-y" style={{ borderColor: "var(--border)" }}>
        {rows.map(({ k, v }) => (
          <div key={k} className="flex items-center justify-between gap-3 px-3 py-2 text-xs" style={{ borderColor: "var(--border)" }}>
            <span style={{ color: "var(--text-secondary)" }}>{k}</span>
            <span className="font-medium text-right" style={{ color: v.startsWith("0 bytes") ? "var(--teal)" : "var(--text-primary)" }}>{v}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ─── "Why federated?" — federated vs centralized upper bound + privacy payoff ───

function WhyFederated({ cmp }: { cmp: ModelComparison | null }) {
  if (!cmp) {
    return (
      <Panel title="Why federated?" subtitle="Federated vs centralized">
        <Unavailable msg="Comparison unavailable" />
      </Panel>
    );
  }
  const fed = cmp.fedscrt?.f1Macro ?? 0;
  const central = cmp.centralized.f1Macro;
  const gapPts = Math.abs(central - fed) * 100;
  const bars = [
    { label: "Federated (FedSCRT)", v: fed, color: "var(--teal)", note: "privacy-preserving" },
    { label: "Centralized upper bound", v: central, color: "#f59e0b", note: "needs all raw data" },
  ];
  return (
    <Panel title="Why federated?" subtitle="Privacy-preserving vs centralized upper bound">
      <div className="space-y-3">
        {bars.map((b) => (
          <div key={b.label}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span style={{ color: "var(--text-primary)" }}>{b.label}</span>
              <span className="tabular-nums font-semibold" style={{ color: b.color }}>{b.v.toFixed(3)}</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-base)" }}>
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${b.v * 100}%`, background: b.color }} />
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: "var(--text-secondary)" }}>{b.note}</div>
          </div>
        ))}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="rounded-lg p-2.5 text-center" style={{ background: "var(--bg-card2)", border: "1px solid var(--border)" }}>
            <div className="text-lg font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{gapPts.toFixed(1)} pts</div>
            <div className="text-[10px]" style={{ color: "var(--text-secondary)" }}>gap to centralized</div>
          </div>
          <div className="rounded-lg p-2.5 text-center" style={{ background: "var(--teal-glow)", border: "1px solid #2dd4bf40" }}>
            <div className="text-lg font-bold tabular-nums" style={{ color: "var(--teal)" }}>{cmp.privacyCost.patientsProtected}</div>
            <div className="text-[10px]" style={{ color: "var(--teal)" }}>patients protected</div>
          </div>
        </div>
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          FedSCRT reaches within <strong>{gapPts.toFixed(1)} points</strong> of the centralized
          model that would require pooling every hospital&apos;s raw scans — while sharing{" "}
          <span style={{ color: "var(--teal)" }}>0 bytes</span> of patient data.
        </p>
      </div>
    </Panel>
  );
}

export default function ResearcherHome() {
  usePortalTitle("MRI Federated Core");

  const [overview, setOverview] = useState<ResearcherOverview | null>(null);
  const [trainingRounds, setTrainingRounds] = useState<TrainingRound[] | null>(null);
  const [modelVersions, setModelVersions] = useState<ModelVersion[] | null>(null);
  const [history, setHistory] = useState<any>(null);
  const [confusion, setConfusion] = useState<any>(null);
  const [perClass, setPerClass] = useState<PerClassResponse | null>(null);
  const [comparison, setComparison] = useState<ModelComparison | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const push = useToastStore((s) => s.push);

  // Per-section error flags (null = ok or loading, string = error message)
  const [overviewErr, setOverviewErr] = useState<string | null>(null);
  const [logErr, setLogErr] = useState<string | null>(null);
  const [versionsErr, setVersionsErr] = useState<string | null>(null);
  const [historyErr, setHistoryErr] = useState<string | null>(null);
  const [confusionErr, setConfusionErr] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      getOverview(),
      getTrainingLog(1, 20),
      getModelVersions(),
      getModelHistory(),
      getConfusionMatrix(),
      getPerClass(),
      getModelComparison(),
    ]).then(([ovRes, logRes, mvRes, histRes, confRes, pcRes, cmpRes]) => {
      if (pcRes.status === "fulfilled") setPerClass(pcRes.value);
      if (cmpRes.status === "fulfilled") setComparison(cmpRes.value);
      if (ovRes.status === "fulfilled") {
        setOverview(ovRes.value);
      } else {
        setOverviewErr(ovRes.reason?.message ?? "Overview unavailable");
      }

      if (logRes.status === "fulfilled") {
        setTrainingRounds(logRes.value.rounds);
      } else {
        setLogErr(logRes.reason?.message ?? "Training log unavailable");
      }

      if (mvRes.status === "fulfilled") {
        setModelVersions(mvRes.value.versions);
      } else {
        setVersionsErr(mvRes.reason?.message ?? "Model versions unavailable");
      }

      if (histRes.status === "fulfilled") {
        setHistory(histRes.value);
      } else {
        setHistoryErr(histRes.reason?.message ?? "Convergence chart unavailable");
      }

      if (confRes.status === "fulfilled") {
        setConfusion(confRes.value);
      } else {
        setConfusionErr(confRes.reason?.message ?? "Confusion matrix unavailable");
      }

      setLoading(false);
    });
  }, []);

  const trainingCols: Column<TrainingRound>[] = [
    {
      key: "round",
      header: "Round",
      render: (r) => (
        <span className="font-mono text-xs" style={{ color: "var(--teal)" }}>
          #{r.roundNumber}
        </span>
      ),
    },
    {
      key: "nodes",
      header: "Nodes",
      render: (r) => (
        <span className="text-xs">
          {r.nodesParticipating}/{r.totalNodes}
        </span>
      ),
    },
    {
      key: "gradNorm",
      header: "Gradient Norm",
      align: "right",
      render: (r) => (
        <span className="font-mono text-xs tabular-nums">
          {typeof r.gradientNorm === "number" ? r.gradientNorm.toFixed(4) : "—"}
        </span>
      ),
    },
    {
      key: "strategy",
      header: "Agg Weight",
      render: (r) => <span className="text-xs">{r.strategy}</span>,
    },
    {
      key: "f1",
      header: "F1",
      align: "right",
      render: (r) => (
        <span className="font-mono text-xs tabular-nums" style={{ color: "var(--teal)" }}>
          {typeof r.globalF1After === "number" ? r.globalF1After.toFixed(3) : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <StatusBadge
          status={r.status === "active" ? "active" : "validated"}
          label={r.status}
        />
      ),
    },
  ];

  if (loading) {
    return (
      <div>
        <PageHeader title="Global Model Performance" />
        <div
          className="text-sm mt-8 text-center"
          style={{ color: "var(--text-secondary)" }}
        >
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Global Model Performance"
        description={
          overview
            ? `Federated ConvNeXt-MIL · Round ${overview.totalRounds}/${overview.totalRounds} · ${overview.strategy}`
            : "Federated ConvNeXt-MIL"
        }
        action={
          overview ? (
            overview.phase === "complete" ? (
              <StatusBadge status="active" label="Synchronized" />
            ) : (
              <StatusBadge status="pending" label="Idle" />
            )
          ) : undefined
        }
      />

      {/* Stat cards — degrade gracefully if overview failed */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard delay={0}
          label="Model Version"
          value={overview ? `v${overview.modelVersion}` : overviewErr ? "—" : "—"}
          accent="var(--teal)"
          hint={overview?.strategy ?? (overviewErr ? "Unavailable" : undefined)}
        />
        <StatCard delay={0.07}
          label="F1 Macro"
          value={
            overview
              ? typeof overview.f1Macro === "number"
                ? overview.f1Macro.toFixed(2)
                : String(overview.f1Macro)
              : "—"
          }
          accent="var(--teal)"
        />
        <StatCard delay={0.14}
          label="Accuracy"
          value={overview ? `${(overview.accuracy * 100).toFixed(0)}%` : "—"}
          accent="var(--blue-accent)"
        />
        <StatCard delay={0.21}
          label="Raw Data Sent"
          value="0 B"
          accent="var(--teal)"
          hint="Privacy preserved"
        />
      </div>

      {/* Model identity + the federated value proposition */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ModelCard overview={overview} />
        <WhyFederated cmp={comparison} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Convergence Metrics">
          {history ? (
            <ConvergenceChart data={history} />
          ) : historyErr ? (
            <Unavailable msg={historyErr} />
          ) : (
            <div
              className="h-64 flex items-center justify-center text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              Loading chart…
            </div>
          )}
        </Panel>
        <Panel
          title="Classification Matrix"
          subtitle="Subtype prediction (global eval)"
        >
          {confusion ? (
            <ConfusionMatrix data={confusion} />
          ) : confusionErr ? (
            <Unavailable msg={confusionErr} />
          ) : (
            <div
              className="h-64 flex items-center justify-center text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              Loading chart…
            </div>
          )}
        </Panel>
      </div>

      {/* Per-class F1 across strategies */}
      <Panel title="Per-class F1" subtitle="Luminal vs Non-Luminal · Centralized / FedAvg / FedSCRT">
        {perClass ? (
          <PerClassChart data={perClass} />
        ) : (
          <Unavailable msg="Per-class data unavailable" />
        )}
      </Panel>

      {/* Training log */}
      <Panel title="Training Log">
        {logErr ? (
          <Unavailable msg={logErr} />
        ) : (
          <DataTable<TrainingRound>
            columns={trainingCols}
            rows={trainingRounds ?? []}
            getRowKey={(r, i) => `${r.roundNumber}-${i}`}
            empty="No training rounds found"
          />
        )}
      </Panel>

      {/* Model versions */}
      <Panel title="Model Versions">
        {versionsErr ? (
          <Unavailable msg={versionsErr} />
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {(modelVersions ?? []).length === 0 ? (
              <span
                className="text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                No versions found
              </span>
            ) : (
              (modelVersions ?? []).map((mv, i) => {
                const prev = (modelVersions ?? [])[i + 1];
                const delta =
                  prev && typeof mv.f1Macro === "number" && typeof prev.f1Macro === "number"
                    ? mv.f1Macro - prev.f1Macro
                    : null;
                const selected = selectedVersion === mv.modelVersion;
                return (
                  <button
                    key={`${mv.hash}-${i}`}
                    type="button"
                    onClick={() => {
                      setSelectedVersion(mv.modelVersion);
                      push(`Model v${mv.modelVersion} selected — promote to production (demo)`, "info");
                    }}
                    className="min-w-[172px] flex-shrink-0 text-left rounded-xl border p-3 btn-press transition-colors"
                    style={{
                      background: selected ? "var(--teal-glow)" : "var(--bg-card)",
                      borderColor: selected ? "#2dd4bf66" : "var(--border)",
                    }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
                        v{mv.modelVersion}
                      </span>
                      <StatusBadge
                        status={mv.status === "active" ? "active" : "pending"}
                        label={mv.status === "active" ? "Active" : "Archived"}
                      />
                    </div>
                    <div
                      className="font-mono text-[10px] truncate mb-1.5"
                      style={{ color: "var(--text-secondary)" }}
                      title={mv.hash}
                    >
                      {mv.hash}
                    </div>
                    <div className="text-xs flex items-center gap-2">
                      <span style={{ color: "var(--text-secondary)" }}>F1 </span>
                      <span className="font-semibold tabular-nums" style={{ color: "var(--teal)" }}>
                        {typeof mv.f1Macro === "number" ? mv.f1Macro.toFixed(2) : String(mv.f1Macro)}
                      </span>
                      {delta !== null && delta !== 0 && (
                        <span
                          className="tabular-nums text-[10px]"
                          style={{ color: delta > 0 ? "var(--teal)" : "#fb7185" }}
                        >
                          {delta > 0 ? "▲ +" : "▼ "}{delta.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

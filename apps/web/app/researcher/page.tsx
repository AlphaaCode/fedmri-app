"use client";

import { useEffect, useState } from "react";
import { usePortalTitle } from "@/lib/use-portal-title";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Panel } from "@/components/ui/Panel";
import { Card } from "@/components/ui/Card";
import { DataTable, Column } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConvergenceChart } from "@/components/ConvergenceChart";
import { ConfusionMatrix } from "@/components/ConfusionMatrix";
import {
  getOverview,
  getTrainingLog,
  getModelVersions,
  getModelHistory,
  getConfusionMatrix,
  ResearcherOverview,
  TrainingRound,
  ModelVersion,
} from "@/lib/researcher-api";

export default function ResearcherHome() {
  usePortalTitle("MRI Federated Core");

  const [overview, setOverview] = useState<ResearcherOverview | null>(null);
  const [trainingRounds, setTrainingRounds] = useState<TrainingRound[]>([]);
  const [modelVersions, setModelVersions] = useState<ModelVersion[]>([]);
  const [history, setHistory] = useState<any>(null);
  const [confusion, setConfusion] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getOverview(),
      getTrainingLog(1, 20),
      getModelVersions(),
      getModelHistory(),
      getConfusionMatrix(),
    ])
      .then(([ov, log, mv, hist, conf]) => {
        setOverview(ov);
        setTrainingRounds(log.rounds);
        setModelVersions(mv.versions);
        setHistory(hist);
        setConfusion(conf);
      })
      .catch((err) => {
        setError(err?.message ?? "Failed to load model performance data");
      })
      .finally(() => setLoading(false));
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
      <div className="max-w-6xl">
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
    <div className="max-w-6xl space-y-5">
      <PageHeader
        title="Global Model Performance"
        description={
          overview
            ? `Federated DINOv2-MIL · Round ${overview.totalRounds}/${overview.totalRounds} · ${overview.strategy}`
            : "Federated DINOv2-MIL"
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

      {error && (
        <div
          className="text-xs px-3 py-2 rounded-lg border"
          style={{
            color: "#f59e0b",
            background: "#f59e0b10",
            borderColor: "#f59e0b40",
          }}
        >
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Model Version"
          value={overview ? `v${overview.modelVersion}` : "—"}
          accent="var(--teal)"
          hint={overview?.strategy}
        />
        <StatCard
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
        <StatCard
          label="Accuracy"
          value={
            overview
              ? `${(overview.accuracy * 100).toFixed(0)}%`
              : "—"
          }
          accent="var(--blue-accent)"
        />
        <StatCard
          label="Raw Data Sent"
          value="0 B"
          accent="var(--teal)"
          hint="Privacy preserved"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Convergence Metrics">
          {history ? (
            <ConvergenceChart data={history} />
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

      {/* Training log */}
      <Panel title="Training Log">
        <DataTable<TrainingRound>
          columns={trainingCols}
          rows={trainingRounds}
          getRowKey={(r, i) => `${r.roundNumber}-${i}`}
          empty="No training rounds found"
        />
      </Panel>

      {/* Model versions */}
      <Panel title="Model Versions">
        <div className="flex gap-3 overflow-x-auto pb-1">
          {modelVersions.length === 0 ? (
            <span
              className="text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              No versions found
            </span>
          ) : (
            modelVersions.map((mv, i) => (
              <Card
                key={`${mv.hash}-${i}`}
                className="min-w-[160px] flex-shrink-0"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className="text-base font-bold"
                    style={{ color: "var(--text-primary)" }}
                  >
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
                <div className="text-xs">
                  <span style={{ color: "var(--text-secondary)" }}>F1 </span>
                  <span
                    className="font-semibold tabular-nums"
                    style={{ color: "var(--teal)" }}
                  >
                    {typeof mv.f1Macro === "number"
                      ? mv.f1Macro.toFixed(2)
                      : String(mv.f1Macro)}
                  </span>
                </div>
              </Card>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}

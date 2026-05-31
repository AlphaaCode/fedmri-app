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

export default function ResearcherHome() {
  usePortalTitle("MRI Federated Core");

  const [overview, setOverview] = useState<ResearcherOverview | null>(null);
  const [trainingRounds, setTrainingRounds] = useState<TrainingRound[] | null>(null);
  const [modelVersions, setModelVersions] = useState<ModelVersion[] | null>(null);
  const [history, setHistory] = useState<any>(null);
  const [confusion, setConfusion] = useState<any>(null);

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
    ]).then(([ovRes, logRes, mvRes, histRes, confRes]) => {
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

      {/* Stat cards — degrade gracefully if overview failed */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Model Version"
          value={overview ? `v${overview.modelVersion}` : overviewErr ? "—" : "—"}
          accent="var(--teal)"
          hint={overview?.strategy ?? (overviewErr ? "Unavailable" : undefined)}
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
          value={overview ? `${(overview.accuracy * 100).toFixed(0)}%` : "—"}
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
              (modelVersions ?? []).map((mv, i) => (
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
        )}
      </Panel>
    </div>
  );
}

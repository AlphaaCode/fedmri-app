"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { usePortalTitle } from "@/lib/use-portal-title";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Panel } from "@/components/ui/Panel";
import { DataTable, Column } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import {
  getDatasets,
  getInsights,
  DatasetsResponse,
  DatasetNode,
  DatasetCohort,
  InsightEvent,
} from "@/lib/researcher-api";
import { GradientCard } from "@/components/ui/GradientCard";
import { useToastStore } from "@/components/ToastProvider";

// ─── Node colour palette (teal / blue-accent / amber per hospital) ─────────────

const NODE_COLORS = [
  "var(--teal)",
  "var(--blue-accent)",
  "#f59e0b",
] as const;

const ACCENT_MAP = ["teal", "indigo", "amber"] as const;

// ─── Figma-matched node card ──────────────────────────────────────────────────

function NodeCard({ node, colorIdx }: { node: DatasetNode; colorIdx: number }) {
  const dotColor = NODE_COLORS[colorIdx % NODE_COLORS.length];
  const accent = ACCENT_MAP[colorIdx % ACCENT_MAP.length];

  return (
    <GradientCard accent={accent} className="p-4 flex flex-col gap-1">
      {/* Top row: dot + node name */}
      <div className="flex items-center gap-2 relative">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: dotColor }}
        />
        <span
          className="text-xs font-semibold truncate"
          style={{ color: "var(--text-primary)" }}
        >
          {node.displayName}
        </span>
      </div>

      {/* Large case count */}
      <div
        className="text-2xl font-bold tabular-nums relative"
        style={{ color: "var(--text-primary)" }}
      >
        {node.totalCases.toLocaleString()}
      </div>

      {/* Specialty label */}
      <div
        className="text-[11px] uppercase tracking-wide relative"
        style={{ color: "var(--text-secondary)" }}
      >
        {node.specialty}
      </div>
    </GradientCard>
  );
}

// ─── Relative-time formatter for the insights feed ────────────────────────────

function relTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

// ─── Unavailable inline note ──────────────────────────────────────────────────

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

// ─── Quality Bar ─────────────────────────────────────────────────────────────

function QualityBar({ label, pct }: { label: string; pct: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {label}
        </span>
        <span
          className="text-xs font-semibold tabular-nums"
          style={{ color: "var(--teal)" }}
        >
          {pct}%
        </span>
      </div>
      <div
        className="w-full rounded-full"
        style={{
          background: "var(--bg-base)",
          height: "6px",
        }}
      >
        <motion.div
          className="rounded-full h-full"
          style={{ background: "var(--teal-dim)" }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
        />
      </div>
    </div>
  );
}

// ─── Cohort Filter Chips ──────────────────────────────────────────────────────

function FilterChip({
  label,
  active,
  disabled,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border select-none"
      style={{
        background: active ? "var(--teal-glow)" : "var(--bg-card2)",
        color: active ? "var(--teal)" : "var(--text-secondary)",
        borderColor: active ? "#2dd4bf40" : "var(--border)",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "default",
      }}
      title={disabled ? "demo" : undefined}
    >
      {label}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DatasetsPage() {
  usePortalTitle("Datasets");

  const [data, setData] = useState<DatasetsResponse | null>(null);
  const [cohorts, setCohorts] = useState<DatasetCohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataErr, setDataErr] = useState<string | null>(null);
  const [addDatasetOpen, setAddDatasetOpen] = useState(false);
  const [newDataset, setNewDataset] = useState({ name: "", hospital: "Hospital A", records: "" });
  const [insights, setInsights] = useState<InsightEvent[]>([]);
  const { push } = useToastStore();

  useEffect(() => {
    getDatasets()
      .then((res) => {
        setData(res);
        setCohorts(res.cohorts);
      })
      .catch((err) => {
        setDataErr(err?.message ?? "Failed to load dataset registry");
      })
      .finally(() => setLoading(false));
  }, []);

  // Live network insights feed + auto-popup the most recent notable event
  // (e.g. a patient's first signup) so the registry feels alive.
  useEffect(() => {
    getInsights(12)
      .then((res) => {
        setInsights(res.events);
        const newest = res.events[0];
        if (newest) {
          const kind: "success" | "info" =
            newest.severity === "success" ? "success" : "info";
          push(`${newest.title} — ${newest.detail}`, kind);
        }
      })
      .catch(() => setInsights([]));
  }, [push]);

  // ── Action: Request Access ──
  function handleRequestAccess(designation: string) {
    setCohorts((prev) =>
      prev.map((c) =>
        c.designation === designation ? { ...c, access: "GRANTED" } : c
      )
    );
    push(`Access granted to ${designation}`, "success");
  }

  // ── Action: Add Dataset ──
  function handleAddDataset() {
    setNewDataset({ name: "", hospital: "Hospital A", records: "" });
    setAddDatasetOpen(true);
  }

  function confirmAddDataset() {
    if (!newDataset.name.trim()) return;
    const newCohort: DatasetCohort = {
      designation: newDataset.name.toUpperCase().replace(/\s+/g, "_"),
      description: `Locally added cohort from ${newDataset.hospital}`,
      sourceNode: newDataset.hospital,
      modality: "DCE-MRI",
      records: parseInt(newDataset.records) || 0,
      access: "GRANTED",
    };
    setCohorts((prev) => [newCohort, ...prev]);
    setAddDatasetOpen(false);
  }

  // ── Table columns ──
  const cohortCols: Column<DatasetCohort>[] = [
    {
      key: "designation",
      header: "Designation",
      render: (row) => (
        <div>
          <div
            className="font-mono text-xs font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            {row.designation}
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {row.description}
          </div>
        </div>
      ),
    },
    {
      key: "sourceNode",
      header: "Source Node",
      render: (row) => (
        <StatusBadge status="active" label={row.sourceNode} />
      ),
    },
    {
      key: "modality",
      header: "Modality",
      render: (row) => (
        <span className="text-xs" style={{ color: "var(--text-primary)" }}>
          {row.modality}
        </span>
      ),
    },
    {
      key: "records",
      header: "Records",
      align: "right",
      render: (row) => (
        <span className="font-mono text-xs tabular-nums">
          {row.records.toLocaleString()}
        </span>
      ),
    },
    {
      key: "action",
      header: "Action",
      render: (row) => {
        if (row.access === "GRANTED") {
          return <StatusBadge status="validated" label="Granted" />;
        }
        if (row.access === "RESTRICTED") {
          return <StatusBadge status="pending" label="Restricted" />;
        }
        // PENDING
        return (
          <Button
            variant="teal"
            className="text-[11px] px-3 py-1"
            onClick={() => handleRequestAccess(row.designation)}
          >
            Request Access
          </Button>
        );
      },
    },
  ];

  if (loading) {
    return (
      <div className="w-full">
        <PageHeader title="Federated Dataset Registry" />
        <div className="text-sm mt-8 text-center" style={{ color: "var(--text-secondary)" }}>
          Loading…
        </div>
      </div>
    );
  }

  const nodes: DatasetNode[] = data?.nodes ?? [];

  return (
    <div className="w-full space-y-5">
      <PageHeader
        title="Federated Dataset Registry"
        description="Harmonized breast DCE-MRI cohorts across the federated network."
        action={
          <Button variant="primary" onClick={handleAddDataset}>
            Add Dataset
          </Button>
        }
      />

      {dataErr && (
        <div
          className="text-xs px-3 py-2 rounded-lg border"
          style={{
            color: "#f59e0b",
            background: "#f59e0b10",
            borderColor: "#f59e0b40",
          }}
        >
          {dataErr}
        </div>
      )}

      {/* ── Stat + Node cards row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Total records StatCard with subtle teal accent */}
        <StatCard
          label="Total Accessible Records"
          value={data ? data.totalRecords.toLocaleString() : "—"}
          accent="var(--teal)"
          hint="across all nodes"
        />

        {/* Figma-matched node cards */}
        {nodes.length === 0 && dataErr ? (
          // If fetch failed, show 3 placeholder slots
          <>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-xl border p-4 flex items-center justify-center"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
              >
                <span
                  className="text-xs"
                  style={{ color: "var(--text-secondary)", opacity: 0.5 }}
                >
                  Unavailable
                </span>
              </div>
            ))}
          </>
        ) : (
          nodes.map((node, i) => (
            <NodeCard key={node.flClientId} node={node} colorIdx={i} />
          ))
        )}
      </div>

      {/* ── Data Quality Index ── */}
      <Panel title="Data Quality Index" subtitle="Computed across harmonized cohorts">
        {dataErr ? (
          <Unavailable msg={dataErr} />
        ) : (
          <div className="space-y-4 pt-1">
            <QualityBar
              label="Annotation Completeness"
              pct={data ? (data.dataQuality.annotationCompleteness * 100).toFixed(0) : "0"}
            />
            <QualityBar
              label="DICOM Header Integrity"
              pct={data ? (data.dataQuality.dicomIntegrity * 100).toFixed(1) : "0"}
            />
          </div>
        )}
      </Panel>

      {/* ── Network insights feed ── */}
      <Panel title="Network insights" subtitle="Recent activity across the federated network">
        {insights.length === 0 ? (
          <Unavailable msg="No recent activity" />
        ) : (
          <div className="space-y-2">
            {insights.map((ev) => {
              const tone =
                ev.severity === "accent"
                  ? "var(--blue-accent)"
                  : ev.severity === "success"
                  ? "var(--teal)"
                  : "var(--text-primary)";
              return (
                <div
                  key={ev.id}
                  className="flex items-start gap-3 rounded-lg border p-2.5"
                  style={{ background: "var(--bg-card2)", borderColor: "var(--border)" }}
                >
                  <span
                    className="mt-1 w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: tone }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold" style={{ color: tone }}>
                      {ev.title}
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                      {ev.detail}
                    </div>
                  </div>
                  <span
                    className="text-[10px] shrink-0"
                    style={{ color: "var(--text-secondary)", opacity: 0.7 }}
                  >
                    {relTime(ev.ts)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* ── Cohort filter chips ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="text-[11px] uppercase tracking-widest mr-1"
          style={{ color: "var(--text-secondary)" }}
        >
          Filter
        </span>
        <FilterChip label="BREAST" active />
        <FilterChip label="BRAIN" disabled />
        <FilterChip label="SPINE" disabled />
      </div>

      {/* ── Available Cohorts table ── */}
      <Panel title="Available Cohorts">
        {dataErr ? (
          <Unavailable msg={dataErr} />
        ) : (
          <>
            <DataTable<DatasetCohort>
              columns={cohortCols}
              rows={cohorts}
              getRowKey={(row, i) => `${row.designation}-${i}`}
              empty="No cohorts found"
            />
            <p
              className="mt-3 text-[11px]"
              style={{ color: "var(--text-secondary)" }}
            >
              Simulated actions — demo, not saved
            </p>
          </>
        )}
      </Panel>

      {addDatasetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(5,10,14,0.85)", backdropFilter: "blur(4px)" }}
          onClick={() => setAddDatasetOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl border p-6 space-y-4"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Add Dataset</div>
            {([
              { label: "Dataset designation", key: "name", placeholder: "BREAST_DCE_2026" },
              { label: "Records count", key: "records", placeholder: "0" },
            ] as { label: string; key: string; placeholder: string }[]).map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="text-xs uppercase tracking-widest block mb-1" style={{ color: "var(--text-secondary)" }}>{label}</label>
                <input className="w-full rounded-lg text-sm px-3 py-2 outline-none"
                  style={{ background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                  placeholder={placeholder}
                  value={newDataset[key as keyof typeof newDataset]}
                  onChange={(e) => setNewDataset((d) => ({ ...d, [key]: e.target.value }))} />
              </div>
            ))}
            <div>
              <label className="text-xs uppercase tracking-widest block mb-1" style={{ color: "var(--text-secondary)" }}>Source hospital</label>
              <select className="w-full rounded-lg text-sm px-3 py-2"
                style={{ background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                value={newDataset.hospital}
                onChange={(e) => setNewDataset((d) => ({ ...d, hospital: e.target.value }))}>
                {["Hospital A", "Hospital B", "Hospital C"].map((h) => <option key={h}>{h}</option>)}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setAddDatasetOpen(false)} className="flex-1 rounded-lg py-2 text-sm"
                style={{ background: "var(--bg-card2)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>Cancel</button>
              <button onClick={confirmAddDataset} className="flex-1 rounded-lg py-2 text-sm font-semibold"
                style={{ background: "var(--teal-dim)", color: "#0d1117" }}>Add Dataset</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { usePortalTitle } from "@/lib/use-portal-title";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Panel } from "@/components/ui/Panel";
import { DataTable, Column } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import {
  getDatasets,
  DatasetsResponse,
  DatasetNode,
  DatasetCohort,
} from "@/lib/researcher-api";

// ─── Node colour palette (teal / blue-accent / amber per hospital) ─────────────

const NODE_COLORS = [
  "var(--teal)",
  "var(--blue-accent)",
  "#f59e0b",
] as const;

// Raw hex/hsl values used for the gradient blob (CSS vars can't be used inside
// radial-gradient alpha strings, so we fall back to approximate hex).
const NODE_GRADIENT_COLORS = [
  "#2dd4bf", // teal
  "#6366f1", // blue-accent (indigo-ish)
  "#f59e0b", // amber
] as const;

// ─── Figma-matched node card ──────────────────────────────────────────────────

function NodeCard({ node, colorIdx }: { node: DatasetNode; colorIdx: number }) {
  const dotColor = NODE_COLORS[colorIdx % NODE_COLORS.length];
  const blobColor = NODE_GRADIENT_COLORS[colorIdx % NODE_GRADIENT_COLORS.length];

  return (
    <div
      className="relative rounded-xl border p-4 flex flex-col gap-1 overflow-hidden"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      {/* Decorative corner gradient blob */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-xl"
        style={{
          background: `radial-gradient(circle at top right, ${blobColor}22, transparent 70%)`,
        }}
      />

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
    </div>
  );
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
        <div
          className="rounded-full h-full"
          style={{
            width: `${pct}%`,
            background: "var(--teal-dim)",
          }}
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

  // ── Action: Request Access ──
  function handleRequestAccess(designation: string) {
    setCohorts((prev) =>
      prev.map((c) =>
        c.designation === designation ? { ...c, access: "GRANTED" } : c
      )
    );
  }

  // ── Action: Add Dataset ──
  function handleAddDataset() {
    const newCohort: DatasetCohort = {
      designation: `BREAST_DCE_NEW_${Date.now().toString().slice(-4)}`,
      description: "Locally added cohort (demo)",
      sourceNode: "Local",
      modality: "DCE-MRI",
      records: 0,
      access: "GRANTED",
    };
    setCohorts((prev) => [newCohort, ...prev]);
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
      <div className="max-w-6xl">
        <PageHeader title="Federated Dataset Registry" />
        <div className="text-sm mt-8 text-center" style={{ color: "var(--text-secondary)" }}>
          Loading…
        </div>
      </div>
    );
  }

  const nodes: DatasetNode[] = data?.nodes ?? [];

  return (
    <div className="max-w-6xl space-y-5">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
    </div>
  );
}

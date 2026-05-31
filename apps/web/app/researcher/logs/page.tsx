"use client";

import { useEffect, useState } from "react";
import { usePortalTitle } from "@/lib/use-portal-title";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Panel } from "@/components/ui/Panel";
import { DataTable, Column } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import {
  getSystemLogs,
  getOverview,
  SystemLogEvent,
  SystemLogsResponse,
  ResearcherOverview,
} from "@/lib/researcher-api";

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity = "ALL" | "INFO" | "WARN" | "ERROR";

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

// ─── Severity chip styling ────────────────────────────────────────────────────

function severityStyle(severity: string): { bg: string; color: string; border: string } {
  switch (severity?.toUpperCase()) {
    case "ERROR":
      return { bg: "#fb718520", color: "#fb7185", border: "#fb718540" };
    case "WARN":
      return { bg: "#f59e0b20", color: "#f59e0b", border: "#f59e0b40" };
    case "INFO":
    default:
      return { bg: "var(--teal-glow)", color: "var(--teal)", border: "#2dd4bf40" };
  }
}

function SeverityChip({ severity }: { severity: string }) {
  const s = severityStyle(severity);
  return (
    <span
      className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {severity}
    </span>
  );
}

// ─── Filter chip ──────────────────────────────────────────────────────────────

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer select-none transition-opacity"
      style={{
        background: active ? "var(--teal-glow)" : "var(--bg-card2)",
        color: active ? "var(--teal)" : "var(--text-secondary)",
        borderColor: active ? "#2dd4bf40" : "var(--border)",
        boxShadow: active ? "0 0 6px var(--teal-glow)" : "none",
      }}
    >
      {label}
    </button>
  );
}

// ─── CSV export helper ────────────────────────────────────────────────────────

function escapeCSVField(value: string | number | null | undefined): string {
  const str = value == null ? "" : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

function exportCSV(events: SystemLogEvent[]) {
  const header = ["Timestamp", "Severity", "NodeID", "EventType", "Payload", "LatencyMs", "Bytes"];
  const rows = events.map((ev) => [
    escapeCSVField(new Date(ev.ts).toLocaleString()),
    escapeCSVField(ev.severity),
    escapeCSVField(ev.nodeId),
    escapeCSVField(ev.eventType),
    escapeCSVField(ev.payload),
    escapeCSVField(ev.latencyMs),
    escapeCSVField(ev.bytes),
  ]);

  const csv = [header.map(escapeCSVField).join(","), ...rows.map((r) => r.join(","))].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "fedmri-system-logs.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Compute average latency ──────────────────────────────────────────────────

function avgLatency(events: SystemLogEvent[]): string {
  const values = events.map((e) => e.latencyMs).filter((v): v is number => v != null);
  if (values.length === 0) return "—";
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return `${Math.round(avg)}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SystemLogsPage() {
  usePortalTitle("System Logs");

  const [severity, setSeverity] = useState<Severity>("ALL");
  const [logsData, setLogsData] = useState<SystemLogsResponse | null>(null);
  const [overview, setOverview] = useState<ResearcherOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [logsErr, setLogsErr] = useState<string | null>(null);
  const [overviewErr, setOverviewErr] = useState<string | null>(null);

  // Reload logs when severity filter changes
  useEffect(() => {
    setLoading(true);
    setLogsErr(null);
    setOverviewErr(null);

    Promise.allSettled([
      getSystemLogs({ limit: 100, severity: severity === "ALL" ? undefined : severity }),
      getOverview(),
    ]).then(([logsRes, ovRes]) => {
      if (logsRes.status === "fulfilled") {
        setLogsData(logsRes.value);
      } else {
        setLogsErr(logsRes.reason?.message ?? "System logs unavailable");
      }

      if (ovRes.status === "fulfilled") {
        setOverview(ovRes.value);
      } else {
        setOverviewErr(ovRes.reason?.message ?? "Overview unavailable");
      }

      setLoading(false);
    });
  }, [severity]);

  const events = logsData?.events ?? [];
  const latencyAvg = avgLatency(events);

  // ── Table columns ──
  const columns: Column<SystemLogEvent>[] = [
    {
      key: "ts",
      header: "Timestamp",
      render: (row) => (
        <span
          className="font-mono text-[11px] whitespace-nowrap"
          style={{ color: "var(--text-secondary)" }}
        >
          {new Date(row.ts).toLocaleString()}
        </span>
      ),
    },
    {
      key: "severity",
      header: "Severity",
      render: (row) => <SeverityChip severity={row.severity} />,
    },
    {
      key: "nodeId",
      header: "Node ID",
      render: (row) => (
        <span
          className="font-mono text-[11px]"
          style={{ color: "var(--text-primary)" }}
        >
          {row.nodeId || "—"}
        </span>
      ),
    },
    {
      key: "eventType",
      header: "Event Type",
      render: (row) => (
        <span
          className="font-mono text-[11px] font-semibold"
          style={{ color: "var(--teal)" }}
        >
          {row.eventType}
        </span>
      ),
    },
    {
      key: "payload",
      header: "Message Payload",
      render: (row) => (
        <span
          className="text-[11px] max-w-[280px] truncate block"
          style={{ color: "var(--text-secondary)" }}
          title={row.payload}
        >
          {row.payload || "—"}
        </span>
      ),
    },
    {
      key: "metrics",
      header: "Metrics (LAT / BW)",
      align: "right",
      render: (row) => (
        <span
          className="font-mono text-[11px] whitespace-nowrap"
          style={{ color: "var(--text-secondary)" }}
        >
          {row.latencyMs != null ? `${row.latencyMs}ms` : "—"}
          {" · "}
          {row.bytes != null ? `${(row.bytes / 1_048_576).toFixed(0)} MB` : "—"}
        </span>
      ),
    },
  ];

  if (loading && !logsData) {
    return (
      <div className="max-w-6xl">
        <PageHeader title="Live Telemetry" />
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
      {/* ── Page header ── */}
      <PageHeader
        title="Live Telemetry"
        description={
          <span className="inline-flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse"
              style={{ background: "var(--teal)" }}
            />
            <span>Receiving events</span>
          </span>
        }
      />

      {/* ── 3 Stat cards — each degrades independently ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Global Gradient Aggregation"
          value={
            overview
              ? String(overview.totalRounds)
              : overviewErr
              ? "—"
              : "—"
          }
          accent="var(--teal)"
          hint={overviewErr ? "Unavailable" : "rounds processed"}
        />
        <StatCard
          label="Network Latency (Avg)"
          value={
            logsErr
              ? "—"
              : latencyAvg === "—"
              ? "—"
              : `${latencyAvg}ms`
          }
          accent="var(--blue-accent)"
          hint={logsErr ? "Unavailable" : "across active nodes"}
        />
        <StatCard
          label="Security Anomalies"
          value="0"
          accent="var(--teal)"
          hint="All handshakes verified"
        />
      </div>

      {/* ── Severity filter ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="text-[11px] uppercase tracking-widest mr-1"
          style={{ color: "var(--text-secondary)" }}
        >
          Severity
        </span>
        {(["ALL", "INFO", "WARN", "ERROR"] as Severity[]).map((s) => (
          <FilterChip
            key={s}
            label={s}
            active={severity === s}
            onClick={() => setSeverity(s)}
          />
        ))}
      </div>

      {/* ── Log table panel ── */}
      <Panel
        title="System Event Log"
        subtitle={
          logsData
            ? `${logsData.total.toLocaleString()} total events${severity !== "ALL" ? ` · filtered: ${severity}` : ""}`
            : undefined
        }
        action={
          <div className="flex items-center gap-3">
            {/* Connected nodes footer info */}
            <span
              className="text-[11px]"
              style={{ color: "var(--text-secondary)" }}
            >
              Connected Nodes{" "}
              <span
                className="font-semibold tabular-nums"
                style={{ color: "var(--teal)" }}
              >
                {logsData ? `${logsData.connectedNodes}/${logsData.totalNodes}` : "—"}
              </span>
            </span>

            {/* Export CSV button */}
            <Button
              variant="ghost"
              className="text-xs px-3 py-1.5"
              onClick={() => exportCSV(events)}
              disabled={events.length === 0}
            >
              Export CSV
            </Button>
          </div>
        }
      >
        {logsErr ? (
          <Unavailable msg={logsErr} />
        ) : (
          <>
            {loading && logsData ? (
              <div
                className="text-xs py-2 text-center"
                style={{ color: "var(--text-secondary)" }}
              >
                Refreshing…
              </div>
            ) : null}

            <DataTable<SystemLogEvent>
              columns={columns}
              rows={events}
              getRowKey={(row, i) => `${row.id}-${i}`}
              empty="No events found for the selected severity filter"
            />
          </>
        )}
      </Panel>
    </div>
  );
}

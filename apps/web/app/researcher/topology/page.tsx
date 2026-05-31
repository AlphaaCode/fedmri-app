"use client";

import { useEffect, useState } from "react";
import { usePortalTitle } from "@/lib/use-portal-title";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { NetworkDiagram } from "@/components/researcher/NetworkDiagram";
import {
  getTopology,
  getSystemLogs,
  TopologyResponse,
  TopologyNode,
  SystemLogEvent,
} from "@/lib/researcher-api";

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

// ─── Consensus Stream Event Chip ──────────────────────────────────────────────

function severityColor(severity: string): { bg: string; color: string; border: string } {
  switch (severity?.toLowerCase()) {
    case "error":
      return { bg: "#fb718520", color: "#fb7185", border: "#fb718540" };
    case "warn":
    case "warning":
      return { bg: "#f59e0b20", color: "#f59e0b", border: "#f59e0b40" };
    case "info":
    default:
      return { bg: "var(--teal-glow)", color: "var(--teal)", border: "#2dd4bf40" };
  }
}

function formatTs(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return ts;
  }
}

function ConsensusEventRow({ event }: { event: SystemLogEvent }) {
  const col = severityColor(event.severity);
  return (
    <div
      className="flex items-start gap-3 px-3 py-2 rounded-lg border text-xs"
      style={{
        background: "var(--bg-card2)",
        borderColor: "var(--border)",
      }}
    >
      {/* Severity dot */}
      <span
        className="mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: col.color, marginTop: "0.3rem" }}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="font-mono font-semibold uppercase tracking-wide text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: col.bg, color: col.color, border: `1px solid ${col.border}` }}
          >
            {event.eventType}
          </span>
          {event.nodeId && (
            <span
              className="font-mono text-[10px]"
              style={{ color: "var(--text-secondary)" }}
            >
              {event.nodeId}
            </span>
          )}
          {event.latencyMs != null && (
            <span
              className="text-[10px]"
              style={{ color: "var(--text-secondary)" }}
            >
              {event.latencyMs}ms
            </span>
          )}
        </div>
        {event.payload && (
          <p
            className="mt-0.5 text-[11px] truncate"
            style={{ color: "var(--text-secondary)" }}
            title={event.payload}
          >
            {event.payload}
          </p>
        )}
      </div>

      {/* Timestamp */}
      <span
        className="font-mono text-[10px] flex-shrink-0 mt-0.5"
        style={{ color: "var(--text-secondary)", opacity: 0.7 }}
      >
        {formatTs(event.ts)}
      </span>
    </div>
  );
}

// ─── Node Inspector ────────────────────────────────────────────────────────────

function NodeInspector({
  node,
  onAuditRequest,
  auditNote,
}: {
  node: TopologyNode | null;
  onAuditRequest: () => void;
  auditNote: boolean;
}) {
  if (!node) {
    return (
      <div
        className="flex items-center justify-center h-40 text-sm"
        style={{ color: "var(--text-secondary)" }}
      >
        Select a node to inspect
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Name + badge */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {node.displayName}
          </div>
          <div
            className="font-mono text-[11px] mt-0.5"
            style={{ color: "var(--text-secondary)" }}
          >
            {node.flClientId}
          </div>
        </div>
        <StatusBadge
          status={node.status === "active" ? "active" : "pending"}
          label={node.status}
        />
      </div>

      {/* Stat rows */}
      <div
        className="rounded-lg border divide-y"
        style={{ borderColor: "var(--border)" }}
      >
        {[
          { label: "Total Scans", value: node.totalCases.toLocaleString() },
          {
            label: "Recent Δw (gradient)",
            value:
              typeof node.lastContributionNorm === "number"
                ? node.lastContributionNorm.toFixed(4)
                : "—",
            mono: true,
          },
          { label: "Client ID", value: node.flClientId, mono: true },
        ].map(({ label, value, mono }) => (
          <div
            key={label}
            className="flex items-center justify-between px-3 py-2 text-xs"
            style={{ borderColor: "var(--border)" }}
          >
            <span style={{ color: "var(--text-secondary)" }}>{label}</span>
            <span
              className={mono ? "font-mono" : "font-medium"}
              style={{ color: "var(--text-primary)" }}
            >
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* Audit button + note */}
      <div>
        <Button variant="teal" className="w-full" onClick={onAuditRequest}>
          Request Audit
        </Button>
        {auditNote && (
          <p
            className="text-[11px] text-center mt-2"
            style={{ color: "var(--text-secondary)" }}
          >
            demo · read-only network
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TopologyPage() {
  usePortalTitle("Network Topology");

  const [topology, setTopology] = useState<TopologyResponse | null>(null);
  const [logEvents, setLogEvents] = useState<SystemLogEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [topoErr, setTopoErr] = useState<string | null>(null);
  const [logsErr, setLogsErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [auditNote, setAuditNote] = useState(false);

  useEffect(() => {
    Promise.allSettled([
      getTopology(),
      getSystemLogs({ limit: 6 }),
    ]).then(([topoRes, logsRes]) => {
      if (topoRes.status === "fulfilled") {
        setTopology(topoRes.value);
      } else {
        setTopoErr(topoRes.reason?.message ?? "Topology data unavailable");
      }

      if (logsRes.status === "fulfilled") {
        setLogEvents(logsRes.value.events);
      } else {
        setLogsErr(logsRes.reason?.message ?? "Consensus stream unavailable");
      }

      setLoading(false);
    });
  }, []);

  const selectedNode =
    topology?.nodes.find((n) => n.id === selectedId) ?? null;

  if (loading) {
    return (
      <div className="max-w-6xl">
        <PageHeader title="Network Topology" />
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
        title="Network Topology"
        description={
          topology
            ? `Federated network · Round ${topology.currentRound}/${topology.totalRounds} · ${topology.nodes.length} hospital nodes`
            : "Federated network"
        }
        action={
          topology ? (
            <StatusBadge status="active" label="Live" />
          ) : undefined
        }
      />

      {/* ── Stat bar ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Connected Nodes"
          value={topology ? String(topology.nodes.length) : "—"}
          accent="var(--teal)"
          hint="+ 1 aggregator"
        />
        <StatCard
          label="Network Uptime"
          value={topology?.uptime ?? "—"}
          accent="var(--text-primary)"
        />
        <StatCard
          label="Global Data Volume"
          value={
            topology
              ? `${topology.globalDataVolume.toLocaleString()} scans`
              : "—"
          }
          accent="var(--blue-accent)"
        />
        <StatCard
          label="Aggregation Cycle"
          value={
            topology
              ? `${topology.currentRound}/${topology.totalRounds}`
              : "—"
          }
          accent="var(--teal)"
          hint="rounds complete"
        />
      </div>

      {/* ── Main content: diagram + inspector ── */}
      <div className="grid lg:grid-cols-[1fr_320px] gap-5">
        {/* Topology diagram */}
        <Panel title="Federated Network">
          {topoErr ? (
            <Unavailable msg={topoErr} />
          ) : topology ? (
            <div>
              <NetworkDiagram
                topology={topology}
                selectedId={selectedId}
                onSelectNode={(id) => {
                  setSelectedId(id);
                  setAuditNote(false);
                }}
              />
              <p
                className="text-[11px] text-center mt-2"
                style={{ color: "var(--text-secondary)", opacity: 0.6 }}
              >
                Click a hospital node to inspect it
              </p>
            </div>
          ) : (
            <div
              className="h-64 flex items-center justify-center text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              No topology data
            </div>
          )}
        </Panel>

        {/* Node Inspector */}
        <Panel title="Node Inspector">
          <NodeInspector
            node={selectedNode}
            onAuditRequest={() => setAuditNote(true)}
            auditNote={auditNote}
          />
        </Panel>
      </div>

      {/* ── Consensus Stream ── */}
      <Panel
        title="Consensus Stream"
        subtitle="Recent system events across the federated network"
      >
        {logsErr ? (
          <Unavailable msg={logsErr} />
        ) : logEvents.length === 0 ? (
          <div
            className="text-xs py-4 text-center"
            style={{ color: "var(--text-secondary)" }}
          >
            No events recorded yet
          </div>
        ) : (
          <div className="space-y-2">
            {logEvents.map((ev) => (
              <ConsensusEventRow key={ev.id} event={ev} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

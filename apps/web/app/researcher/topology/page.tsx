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
  getNodeAudit,
  downloadNodeAuditReport,
  TopologyResponse,
  TopologyNode,
  SystemLogEvent,
  NodeAudit,
} from "@/lib/researcher-api";
import { AnimatePresence, motion } from "framer-motion";

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
  auditing,
}: {
  node: TopologyNode | null;
  onAuditRequest: () => void;
  auditing: boolean;
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

      {/* Audit button */}
      <div>
        <Button variant="teal" className="w-full" onClick={onAuditRequest} disabled={auditing}>
          {auditing ? "Running audit…" : "Request Audit"}
        </Button>
        <p
          className="text-[11px] text-center mt-2"
          style={{ color: "var(--text-secondary)" }}
        >
          Privacy &amp; integrity check from the live audit log
        </p>
      </div>
    </div>
  );
}

// ─── Audit result modal ─────────────────────────────────────────────────────

function AuditModal({ audit, onClose }: { audit: NodeAudit | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {audit && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(5,10,14,0.78)", backdropFilter: "blur(4px)" }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-lg rounded-2xl border max-h-[85vh] overflow-y-auto"
            style={{ background: "var(--bg-card-solid)", borderColor: "var(--border-solid)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {!audit.found ? (
              <div className="p-6 text-sm" style={{ color: "var(--text-secondary)" }}>
                No audit data for <span className="font-mono">{audit.flClientId}</span>.
                <div className="mt-4">
                  <Button variant="ghost" onClick={onClose}>Close</Button>
                </div>
              </div>
            ) : (
              <>
                {/* Header */}
                <div
                  className="flex items-start justify-between gap-3 p-5 border-b"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div>
                    <div className="text-xs uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
                      Privacy &amp; integrity audit
                    </div>
                    <div className="text-base font-semibold mt-0.5" style={{ color: "var(--text-primary)" }}>
                      {audit.node?.displayName}
                    </div>
                    <div className="font-mono text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                      {audit.node?.flClientId} · audit #{audit.auditId}
                    </div>
                  </div>
                  <span
                    className="text-xs font-bold px-3 py-1 rounded-full shrink-0"
                    style={{
                      background: audit.verdict === "COMPLIANT" ? "var(--teal-glow)" : "#f59e0b20",
                      color: audit.verdict === "COMPLIANT" ? "var(--teal)" : "#f59e0b",
                      border: `1px solid ${audit.verdict === "COMPLIANT" ? "#2dd4bf40" : "#f59e0b40"}`,
                    }}
                  >
                    {audit.verdict}
                  </span>
                </div>

                {/* Summary stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5">
                  {[
                    { k: "Raw data sent", v: `${audit.summary?.rawDataTransmitted ?? 0} B`, hot: true },
                    { k: "Weight events", v: String(audit.summary?.privacyEvents ?? 0) },
                    { k: "Contributions", v: String(audit.summary?.contributions ?? 0) },
                    { k: "Avg local F1", v: (audit.summary?.avgLocalF1 ?? 0).toFixed(3) },
                  ].map(({ k, v, hot }) => (
                    <div
                      key={k}
                      className="rounded-lg border p-2.5"
                      style={{ background: "var(--bg-card2)", borderColor: "var(--border)" }}
                    >
                      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>{k}</div>
                      <div className="text-lg font-bold tabular-nums" style={{ color: hot ? "var(--teal)" : "var(--text-primary)" }}>{v}</div>
                    </div>
                  ))}
                </div>

                {/* Checks */}
                <div className="px-5 pb-2 space-y-2">
                  {(audit.checks ?? []).map((c) => (
                    <div
                      key={c.label}
                      className="flex items-start gap-3 rounded-lg border p-3"
                      style={{ background: "var(--bg-card2)", borderColor: "var(--border)" }}
                    >
                      <span
                        className="mt-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                        style={{
                          background: c.status === "pass" ? "var(--teal-glow)" : "#f59e0b20",
                          color: c.status === "pass" ? "var(--teal)" : "#f59e0b",
                        }}
                      >
                        {c.status === "pass" ? "✓" : "!"}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{c.label}</div>
                        <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>{c.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Recent contributions */}
                {(audit.recentContributions?.length ?? 0) > 0 && (
                  <div className="px-5 pb-3">
                    <div className="text-[11px] uppercase tracking-widest mb-2 mt-1" style={{ color: "var(--text-secondary)" }}>
                      Recent contributions
                    </div>
                    <div className="space-y-1">
                      {audit.recentContributions!.slice(0, 5).map((r, i) => (
                        <div key={i} className="flex items-center justify-between text-[11px] font-mono px-2 py-1 rounded" style={{ background: "var(--bg-card2)", color: "var(--text-secondary)" }}>
                          <span>round #{r.round}</span>
                          <span>{r.samplesUsed} samples</span>
                          <span>F1 {r.localF1After.toFixed(3)}</span>
                          <span style={{ color: "var(--teal)" }}>Δw {r.weightDeltaNorm.toFixed(4)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 p-5 border-t" style={{ borderColor: "var(--border)" }}>
                  <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Generated {audit.generatedAt ? new Date(audit.generatedAt).toLocaleString() : "—"}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => audit.node && downloadNodeAuditReport(audit.node.flClientId).catch(() => {})}
                    >
                      ↓ Download report (PDF)
                    </Button>
                    <Button variant="teal" onClick={onClose}>Close audit</Button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
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
  const [auditing, setAuditing] = useState(false);
  const [audit, setAudit] = useState<NodeAudit | null>(null);

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

  async function runAudit() {
    if (!selectedNode) return;
    setAuditing(true);
    try {
      setAudit(await getNodeAudit(selectedNode.flClientId));
    } catch {
      setAudit({ found: false, flClientId: selectedNode.flClientId });
    } finally {
      setAuditing(false);
    }
  }

  if (loading) {
    return (
      <div className="w-full">
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
    <div className="w-full space-y-5">
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
            onAuditRequest={runAudit}
            auditing={auditing}
          />
        </Panel>
      </div>

      <AuditModal audit={audit} onClose={() => setAudit(null)} />

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

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { io, Socket } from "socket.io-client";
import { usePortalTitle } from "@/lib/use-portal-title";
import { getFlExperiments, runFlTest, type FlExperiment } from "@/lib/researcher-api";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { API_URL } from "@/lib/api";

const STRAT_COLOR: Record<string, string> = {
  fedavg: "#60a5fa",
  momentum: "#f59e0b",
  scaffold: "#a78bfa",
  fedscrt: "#2dd4bf",
};

const HOSPITALS = ["Hospital A", "Hospital B", "Hospital C"];
const TEST_ROUNDS = 10;

export default function FederatedPage() {
  usePortalTitle("Federated Learning");
  const [exps, setExps] = useState<FlExperiment[]>([]);
  const [alpha, setAlpha] = useState<number>(0.5);
  const [live, setLive] = useState<{ round: number; f1: number }[]>([]);
  const [running, setRunning] = useState(false);
  const [liveStrategy, setLiveStrategy] = useState<"fedscrt" | "fedavg">("fedscrt");

  useEffect(() => {
    getFlExperiments()
      .then(setExps)
      .catch(() => setExps([]));
  }, []);

  // Live WS subscription for the test run
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    const socket: Socket = io(API_URL, { auth: { token }, transports: ["websocket"] });
    socket.on("fl:test:progress", (p: { round: number; f1: number }) => {
      setLive((prev) => [...prev, { round: p.round, f1: Number(p.f1.toFixed(4)) }]);
    });
    socket.on("fl:test:complete", () => setRunning(false));
    return () => {
      socket.disconnect();
    };
  }, []);

  const curves = useMemo(() => {
    const byAlpha = exps.filter((e) => e.alpha === alpha);
    const maxR = Math.max(1, ...byAlpha.map((e) => e.rounds));
    const rows: Record<string, number>[] = [];
    for (let r = 1; r <= maxR; r++) {
      const row: Record<string, number> = { round: r };
      byAlpha.forEach((e) => {
        const pt = e.history.find((h) => h.round === r);
        if (pt) {
          row[e.strategy] = Number(pt.f1.toFixed(4));
        } else if (e.history.length === 1) {
          // One-shot strategy (FedSCRT): extend the single value as a horizontal baseline
          row[e.strategy] = Number(e.history[0].f1.toFixed(4));
        }
      });
      rows.push(row);
    }
    return { rows, strategies: byAlpha.map((e) => e.strategy) };
  }, [exps, alpha]);

  async function startTest() {
    setLive([]);
    setRunning(true);
    try {
      await runFlTest(liveStrategy, TEST_ROUNDS);
    } catch {
      setRunning(false);
    }
  }

  const lastF1 = live.length ? live[live.length - 1].f1 : 0;
  const bestF1 = live.length ? Math.max(...live.map((l) => l.f1)) : 0;
  const deltaF1 = live.length > 1 ? lastF1 - live[0].f1 : 0;
  const finished = !running && live.length > 0;

  return (
    <div className="space-y-4">
      {/* Objective card */}
      <div className="glass rounded-xl border p-5" style={{ borderColor: "var(--border)" }}>
        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--text-secondary)" }}>
          Optimization objective
        </div>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
          Minimize the federated objective <code>F(w) = Σₖ (nₖ/n)·Fₖ(w)</code> across 3 hospital
          clients, where each local objective <code>Fₖ(w)</code> is the class-balanced cross-entropy
          on that hospital&apos;s data. Aggregation: FedAvg (weighted by nₖ); SCAFFOLD corrects client
          drift via control variates; <strong>FedSCRT</strong> freezes the backbone and federates a
          retrained classifier head. Metric: macro-F1 (binary Luminal vs Non-Luminal).
        </p>
        <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
          Goal: under non-IID data (Dirichlet α=0.5), approach centralized performance without sharing
          raw data. Raw bytes transmitted: <span style={{ color: "var(--teal)" }}>0</span>.
        </p>
      </div>

      {/* Real convergence */}
      <div className="glass rounded-xl border p-5" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Real convergence (per-round macro-F1)
          </div>
          <div className="flex gap-1 text-xs">
            {[0.5, 100].map((a) => (
              <button
                key={a}
                onClick={() => setAlpha(a)}
                className="btn-press px-2.5 py-1 rounded-lg"
                style={{
                  background: alpha === a ? "var(--teal-glow)" : "var(--bg-card2)",
                  color: alpha === a ? "var(--teal)" : "var(--text-secondary)",
                  border: "1px solid var(--border)",
                }}
              >
                {a === 0.5 ? "Non-IID (α=0.5)" : "Near-IID (α=100)"}
              </button>
            ))}
          </div>
        </div>
        {(() => {
          const allF1 = curves.rows.flatMap((r) =>
            curves.strategies.map((s) => r[s]).filter((v): v is number => v !== undefined)
          );
          const yMin = allF1.length ? Math.max(0, Math.floor(Math.min(...allF1) * 10) / 10 - 0.05) : 0;
          return (
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={curves.rows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="round" stroke="var(--chart-axis)" fontSize={11} />
                  <YAxis domain={[yMin, 1]} stroke="var(--chart-axis)" fontSize={11} tickFormatter={(v: number) => v.toFixed(2)} />
                  <Tooltip
                    contentStyle={{ background: "var(--chart-tooltip-bg)", border: "1px solid var(--border)" }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any, name: any) => [typeof v === "number" ? v.toFixed(4) : String(v ?? ""), name ?? ""]}
                  />
                  <Legend />
                  {curves.strategies.map((s, i) => {
                    const pts = curves.rows.filter((r) => r[s] !== undefined).length;
                    return (
                      <Line
                        key={s}
                        type="monotone"
                        dataKey={s}
                        stroke={STRAT_COLOR[s] ?? "#888"}
                        strokeWidth={s === "fedscrt" ? 2.5 : 2}
                        strokeDasharray={s === "fedscrt" ? "6 3" : undefined}
                        dot={pts <= 1 ? { r: 5, fill: STRAT_COLOR[s] ?? "#888" } : false}
                        isAnimationActive
                        animationDuration={800}
                        animationBegin={i * 200}
                        animationEasing="ease-out"
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          );
        })()}
        <table className="w-full text-xs mt-3">
          <thead>
            <tr style={{ color: "var(--text-secondary)" }}>
              <th className="text-left">Strategy</th>
              <th className="text-right">Final F1</th>
              <th className="text-right">AUC</th>
            </tr>
          </thead>
          <tbody>
            {exps
              .filter((e) => e.alpha === alpha)
              .map((e) => (
                <tr key={e.strategy} style={{ color: "var(--text-primary)" }}>
                  <td className="py-1">{e.strategy}</td>
                  <td className="text-right tabular-nums">{e.final.f1.toFixed(3)}</td>
                  <td className="text-right tabular-nums">{e.final.auc.toFixed(3)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* ── Live FL test — demo theater ─────────────────────────────────── */}
      <div
        className={`glass rounded-xl border p-6 ${running ? "hero-glow glow-border" : ""}`}
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
          <div>
            <div className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              Live federated training
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
              3 hospitals train locally on frozen-backbone features — only head weights travel.{" "}
              <span style={{ color: "var(--teal)" }}>0 bytes of raw data</span>.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={liveStrategy}
              onChange={(e) => setLiveStrategy(e.target.value as "fedscrt" | "fedavg")}
              disabled={running}
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: "var(--bg-card2)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            >
              <option value="fedscrt">FedSCRT</option>
              <option value="fedavg">FedAvg</option>
            </select>
            <button
              onClick={startTest}
              disabled={running}
              className={`btn-press px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-60 ${running ? "pulse-glow" : ""}`}
              style={{ background: "var(--teal-dim)", color: "#0d1117" }}
            >
              {running ? "Training…" : "▶ Run FL test"}
            </button>
          </div>
        </div>

        {/* Hospital activity row */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          {HOSPITALS.map((h, i) => (
            <div
              key={h}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs transition-all duration-500 ${running ? "pulse-glow" : ""}`}
              style={{
                background: running ? "var(--teal-glow)" : "var(--bg-card2)",
                color: running ? "var(--teal)" : "var(--text-secondary)",
                border: `1px solid ${running ? "#2dd4bf50" : "var(--border)"}`,
                animationDelay: `${i * 0.4}s`,
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: running ? "var(--teal)" : "var(--text-secondary)",
                  // single shorthand (delay folded in) — mixing `animation` with a
                  // separate `animationDelay` triggers a React inline-style warning
                  animation: running ? `node-pulse 1.4s ease ${i * 0.4}s infinite` : "none",
                }}
              />
              {h}
              <span style={{ opacity: 0.7 }}>{running ? "training head…" : "idle"}</span>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-5 text-xs" style={{ color: "var(--text-secondary)" }}>
            <span>
              Round{" "}
              <span className="text-base font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                <AnimatedNumber value={live.length} duration={0.35} />
              </span>
              <span style={{ opacity: 0.6 }}>/{TEST_ROUNDS}</span>
            </span>
            <span>
              macro-F1{" "}
              <span className="text-base font-bold tabular-nums" style={{ color: "var(--teal)" }}>
                <AnimatedNumber value={lastF1} decimals={3} duration={0.35} />
              </span>
            </span>
            <span>
              best{" "}
              <span className="text-base font-bold tabular-nums" style={{ color: "var(--blue-accent)" }}>
                <AnimatedNumber value={bestF1} decimals={3} duration={0.35} />
              </span>
            </span>
          </div>
        </div>

        {/* Big live chart */}
        <div className="mt-4" style={{ width: "100%", height: 380 }}>
          {live.length === 0 && !running ? (
            <div
              className="h-full rounded-lg border border-dashed flex flex-col items-center justify-center gap-2 text-sm"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
            >
              <span className="float-y text-2xl" aria-hidden>⚡</span>
              Run a test to stream live training rounds from the coordinator
            </div>
          ) : (
            <ResponsiveContainer>
              <AreaChart data={live} margin={{ top: 10, right: 16, bottom: 0, left: -8 }}>
                <defs>
                  <linearGradient id="liveF1Grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--teal)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--teal)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="round" stroke="var(--chart-axis)" fontSize={11} domain={[1, TEST_ROUNDS]} type="number" allowDecimals={false} />
                <YAxis domain={[0, 1]} stroke="var(--chart-axis)" fontSize={11} tickFormatter={(v: number) => v.toFixed(2)} />
                <Tooltip
                  contentStyle={{ background: "var(--chart-tooltip-bg)", border: "1px solid var(--border)" }}
                  labelFormatter={(r) => `Round ${r}`}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any) => [typeof v === "number" ? v.toFixed(4) : v, "macro-F1"]}
                />
                {/* No per-point redraw animation — rounds stream in fast over WS */}
                <Area
                  type="monotone"
                  dataKey="f1"
                  stroke="var(--teal)"
                  strokeWidth={2.5}
                  fill="url(#liveF1Grad)"
                  dot={{ r: 4, fill: "var(--teal)", strokeWidth: 0 }}
                  isAnimationActive={false}
                  name="macro-F1"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Completion banner */}
        <AnimatePresence>
          {finished && (
            <motion.div
              initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="mt-4 rounded-lg px-4 py-3 flex items-center justify-between text-sm"
              style={{ background: "var(--teal-glow)", border: "1px solid #2dd4bf50", color: "var(--teal)" }}
            >
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: "var(--teal)" }} />
                Federated test complete — {liveStrategy === "fedscrt" ? "FedSCRT" : "FedAvg"} converged in {live.length} rounds
              </span>
              <span className="tabular-nums font-semibold">
                final F1 {lastF1.toFixed(3)}
                {deltaF1 !== 0 && (
                  <span style={{ color: deltaF1 >= 0 ? "var(--teal)" : "#fb7185" }}>
                    {" "}({deltaF1 >= 0 ? "▲ +" : "▼ "}{deltaF1.toFixed(3)} vs round 1)
                  </span>
                )}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";
import { io, Socket } from "socket.io-client";
import { usePortalTitle } from "@/lib/use-portal-title";
import { getFlExperiments, runFlTest, type FlExperiment } from "@/lib/researcher-api";
import { API_URL } from "@/lib/api";

const STRAT_COLOR: Record<string, string> = {
  fedavg: "#60a5fa",
  momentum: "#f59e0b",
  scaffold: "#a78bfa",
  fedscrt: "#2dd4bf",
};

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
      await runFlTest(liveStrategy, 10);
    } catch {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Objective card */}
      <div className="rounded-xl border p-5" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
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
      <div className="rounded-xl border p-5" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Real convergence (per-round macro-F1)
          </div>
          <div className="flex gap-1 text-xs">
            {[0.5, 100].map((a) => (
              <button
                key={a}
                onClick={() => setAlpha(a)}
                className="px-2.5 py-1 rounded-lg"
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
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="round" stroke="var(--text-secondary)" fontSize={11} />
                  <YAxis domain={[yMin, 1]} stroke="var(--text-secondary)" fontSize={11} tickFormatter={(v: number) => v.toFixed(2)} />
                  <Tooltip
                    contentStyle={{ background: "var(--bg-card2)", border: "1px solid var(--border)" }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any, name: any) => [typeof v === "number" ? v.toFixed(4) : String(v ?? ""), name ?? ""]}
                  />
                  <Legend />
                  {curves.strategies.map((s) => {
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

      {/* Live FL test */}
      <div className="rounded-xl border p-5" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Run a live federated test
          </div>
          <div className="flex items-center gap-2 text-xs">
            <select
              value={liveStrategy}
              onChange={(e) => setLiveStrategy(e.target.value as "fedscrt" | "fedavg")}
              className="rounded-lg px-2 py-1"
              style={{ background: "var(--bg-card2)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            >
              <option value="fedscrt">FedSCRT</option>
              <option value="fedavg">FedAvg</option>
            </select>
            <button
              onClick={startTest}
              disabled={running}
              className="px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50"
              style={{ background: "var(--teal-glow)", color: "var(--teal)", border: "1px solid #2dd4bf40" }}
            >
              {running ? "Training…" : "Run FL test"}
            </button>
          </div>
        </div>
        <div className="text-xs mb-3 space-y-1" style={{ color: "var(--text-secondary)" }}>
          <p>
            Each hospital trains a classifier head on its own <strong style={{ color: "var(--teal)" }}>frozen</strong> backbone
            features; the server aggregates using the selected strategy. Only head weights move —{" "}
            <span style={{ color: "var(--teal)" }}>0 bytes of raw data</span>.
          </p>
          <p style={{ opacity: 0.75 }}>
            Results use pre-extracted synthetic features and are reproducible per strategy.{" "}
            <strong>FedSCRT</strong> freezes the backbone entirely; <strong>FedAvg</strong> averages the full head.
            FedSCRT typically achieves higher F1 on non-IID data.
          </p>
        </div>
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <LineChart data={live}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="round" stroke="var(--text-secondary)" fontSize={11} />
              <YAxis domain={[0, 1]} stroke="var(--text-secondary)" fontSize={11} />
              <Tooltip contentStyle={{ background: "var(--bg-card2)", border: "1px solid var(--border)" }} />
              <Line
                type="monotone"
                dataKey="f1"
                stroke="var(--teal)"
                dot={{ r: 3, fill: "var(--teal)" }}
                strokeWidth={2.5}
                isAnimationActive
                animationDuration={400}
                name="macro-F1"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

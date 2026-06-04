"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from "recharts";
import { apiFetch } from "@/lib/api";
import { Panel } from "@/components/ui/Panel";

interface History {
  curves?: { FedAvg?: { round: number; f1: number }[]; FedProx?: { round: number; f1: number }[] };
}

interface Bar1 {
  round: number;
  f1: number;
  strategy: "FedAvg" | "FedProx";
}

/** Figma "Network Performance" card — per-round global F1 as vertical bars
 *  (FedAvg rounds teal-dim, FedProx rounds teal) + a synchronized badge. */
export function NetworkPerformanceCard() {
  const [bars, setBars] = useState<Bar1[]>([]);

  useEffect(() => {
    apiFetch<History>("/model/history")
      .then((h) => {
        const fa = (h.curves?.FedAvg ?? []).map((d) => ({ ...d, strategy: "FedAvg" as const }));
        const fp = (h.curves?.FedProx ?? []).map((d) => ({ ...d, strategy: "FedProx" as const }));
        setBars([...fa, ...fp].sort((a, b) => a.round - b.round));
      })
      .catch(() => setBars([]));
  }, []);

  const badge = (
    <span
      className="text-[11px] px-2 py-1 rounded-full inline-flex items-center gap-1.5"
      style={{ background: "var(--teal-glow)", color: "var(--teal)", border: "1px solid #2dd4bf40" }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--teal)" }} />
      SYNCHRONIZED
    </span>
  );

  return (
    <Panel title="Network Performance" subtitle="Global F1 across federated rounds" action={badge}>
      <div className="h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bars} margin={{ top: 8, right: 4, bottom: 0, left: -22 }}>
            <XAxis dataKey="round" tick={{ fontSize: 10, fill: "var(--text-secondary)" }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 0.5]} tick={{ fontSize: 10, fill: "var(--text-secondary)" }} axisLine={false} tickLine={false} width={30} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              contentStyle={{ background: "var(--bg-card2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "var(--text-secondary)" }}
              formatter={((v: number) => [v.toFixed(2), "F1 macro"]) as any}
              labelFormatter={(r) => `Round ${r}`}
            />
            <Bar dataKey="f1" radius={[3, 3, 0, 0]} isAnimationActive animationDuration={800} animationEasing="ease-out">
              {bars.map((b, i) => (
                <Cell key={i} fill={b.strategy === "FedProx" ? "var(--teal)" : "var(--teal-dim)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px]" style={{ color: "var(--text-secondary)" }}>
        <span>Model v10 · 3 hospitals</span>
        <span>FedAvg r1–5 · FedProx r6–10</span>
      </div>
    </Panel>
  );
}

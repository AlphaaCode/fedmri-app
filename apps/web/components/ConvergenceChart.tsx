"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface Point { round: number; f1: number; }
interface Props {
  data: {
    curves: { FedAvg: Point[]; FedProx: Point[]; Centralized: Point[] };
  };
}

const COLOR = { FedAvg: "#60a5fa", FedProx: "#2dd4bf", Centralized: "#f59e0b" };

export function ConvergenceChart({ data }: Props) {
  const maxRound = Math.max(
    1,
    ...data.curves.FedAvg.map((p) => p.round),
    ...data.curves.FedProx.map((p) => p.round),
    ...data.curves.Centralized.map((p) => p.round),
  );

  const merged: Array<Record<string, number>> = [];
  for (let r = 1; r <= maxRound; r++) {
    const row: Record<string, number> = { round: r };
    const a = data.curves.FedAvg.find((p) => p.round === r); if (a) row.FedAvg = a.f1;
    const x = data.curves.FedProx.find((p) => p.round === r); if (x) row.FedProx = x.f1;
    const c = data.curves.Centralized.find((p) => p.round === r); if (c) row.Centralized = c.f1;
    merged.push(row);
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={merged} margin={{ top: 10, right: 16, bottom: 0, left: -8 }}>
        <CartesianGrid stroke="#30363d" strokeDasharray="3 3" />
        <XAxis dataKey="round" stroke="#8b949e" fontSize={11} label={{ value: "FL round", position: "insideBottom", offset: -2, fill: "#8b949e", fontSize: 11 }} />
        <YAxis stroke="#8b949e" fontSize={11} domain={[0.2, 0.6]} label={{ value: "F1 macro", angle: -90, position: "insideLeft", offset: 14, fill: "#8b949e", fontSize: 11 }} />
        <Tooltip
          contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 6, fontSize: 12, color: "#e6edf3" }}
          labelStyle={{ color: "#8b949e" }}
        />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
        <Line type="monotone" dataKey="Centralized" stroke={COLOR.Centralized} strokeWidth={2} strokeDasharray="6 4" dot={false} />
        <Line type="monotone" dataKey="FedAvg" stroke={COLOR.FedAvg} strokeWidth={2} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="FedProx" stroke={COLOR.FedProx} strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

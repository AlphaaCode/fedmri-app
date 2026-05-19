"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface Props {
  data: {
    subtypes: string[];
    strategies: string[];
    values: Record<string, Record<string, number>>;
  };
}

const STRAT_COLOR = { Centralized: "#f59e0b", FedAvg: "#60a5fa", FedProx: "#2dd4bf" };

export function PerClassChart({ data }: Props) {
  const rows = data.subtypes.map((s) => {
    const row: Record<string, number | string> = { subtype: s };
    data.strategies.forEach((strat) => {
      row[strat] = data.values[strat][s] ?? 0;
    });
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ top: 10, right: 16, bottom: 0, left: -8 }}>
        <CartesianGrid stroke="#30363d" strokeDasharray="3 3" />
        <XAxis dataKey="subtype" stroke="#8b949e" fontSize={11} />
        <YAxis stroke="#8b949e" fontSize={11} domain={[0, 1]} />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.03)" }}
          contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 6, fontSize: 12, color: "#e6edf3" }}
          labelStyle={{ color: "#8b949e" }}
        />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
        {data.strategies.map((strat) => (
          <Bar key={strat} dataKey={strat} fill={STRAT_COLOR[strat as keyof typeof STRAT_COLOR] ?? "#888"} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

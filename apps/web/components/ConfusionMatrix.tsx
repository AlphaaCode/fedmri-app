"use client";

import { motion } from "framer-motion";
import { EASE_OUT } from "@/lib/anim";

interface Props {
  data: {
    subtypes: string[];
    matrix: Record<string, Record<string, number>>;
  };
}

function colorFor(value: number, max: number): string {
  if (max === 0) return "#161b22";
  const t = Math.min(1, value / max);
  // dark slate → teal
  const r = Math.round(22 + t * (45 - 22));
  const g = Math.round(27 + t * (212 - 27));
  const b = Math.round(34 + t * (191 - 34));
  return `rgb(${r},${g},${b})`;
}

export function ConfusionMatrix({ data }: Props) {
  const { subtypes, matrix } = data;
  let max = 0;
  for (const r of subtypes) for (const c of subtypes) if (matrix[r][c] > max) max = matrix[r][c];

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs" style={{ color: "var(--text-primary)" }}>
        <thead>
          <tr>
            <th className="p-1.5 text-left font-normal" style={{ color: "var(--text-secondary)" }}>True \ Pred</th>
            {subtypes.map((s) => (
              <th key={s} className="p-1.5 font-normal text-center" style={{ color: "var(--text-secondary)", maxWidth: 90 }}>
                {s.replace(" ", "\n")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {subtypes.map((row, ri) => (
            <tr key={row}>
              <td className="p-1.5 font-medium" style={{ color: "var(--text-secondary)" }}>{row}</td>
              {subtypes.map((col, ci) => {
                const v = matrix[row][col];
                const onDiag = row === col;
                return (
                  <motion.td
                    key={col}
                    initial={{ opacity: 0, scale: 0.6 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.35, ease: EASE_OUT, delay: (ri + ci) * 0.05 }}
                    className="p-2 text-center tabular-nums font-medium"
                    style={{
                      background: colorFor(v, max),
                      color: onDiag && v > max * 0.4 ? "#0d1117" : "#e6edf3",
                      border: "1px solid var(--bg-base)",
                      minWidth: 60,
                    }}
                  >
                    {v}
                  </motion.td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-2 mt-3 text-[11px]" style={{ color: "var(--text-secondary)" }}>
        <span>0</span>
        <div className="flex-1 h-1.5 rounded" style={{ background: "linear-gradient(to right, #161b22, #2dd4bf)" }} />
        <span>{max}</span>
      </div>
    </div>
  );
}

"use client";

import { SUBTYPES, SUBTYPE_COLOR, SUBTYPE_PLAIN, type Subtype, type CaseResult } from "@/lib/types";

function confidenceLabel(c: number): { text: string; color: string } {
  if (c >= 0.7) return { text: "High", color: "text-green-700" };
  if (c >= 0.5) return { text: "Moderate", color: "text-amber-700" };
  return { text: "Low — seek specialist", color: "text-red-700" };
}

export function PredictionCard({ result }: { result: CaseResult }) {
  const subtype = result.predictedSubtype;
  const color = SUBTYPE_COLOR[subtype];
  const conf = confidenceLabel(result.confidence);

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">
            Predicted subtype
          </div>
          <div className="text-2xl font-semibold mt-1" style={{ color }}>
            {subtype}
          </div>
          <div className="text-sm text-gray-600 mt-1 max-w-md">
            {SUBTYPE_PLAIN[subtype]}
          </div>
        </div>
        <span
          className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-full text-white"
          style={{ backgroundColor: color }}
        >
          {subtype}
        </span>
      </div>

      <div className="space-y-2">
        {SUBTYPES.map((s, i) => {
          const p = result.probs[i] ?? 0;
          return (
            <div key={s} className="flex items-center gap-3">
              <div className="w-28 text-xs text-gray-700">{s}</div>
              <div className="flex-1 h-2 bg-gray-100 rounded overflow-hidden">
                <div
                  className="h-2"
                  style={{
                    width: `${Math.round(p * 100)}%`,
                    backgroundColor: SUBTYPE_COLOR[s as Subtype],
                  }}
                />
              </div>
              <div className="w-12 text-right text-xs tabular-nums">
                {(p * 100).toFixed(1)}%
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <div>
          Confidence:{" "}
          <span className={`font-medium ${conf.color}`}>{conf.text}</span>
        </div>
        <div className="text-gray-500">Model v{result.modelVersion}</div>
      </div>
    </div>
  );
}

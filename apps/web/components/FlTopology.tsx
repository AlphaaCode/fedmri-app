"use client";

import { useFlStore } from "@/lib/fl-store";

const HOSPITALS = [
  { id: "h1", label: "Hospital A", x: 40, y: 40 },
  { id: "h2", label: "Hospital B", x: 200, y: 40 },
  { id: "h3", label: "Hospital C", x: 120, y: 180 },
];
const AGGREGATOR = { x: 120, y: 110, w: 40, h: 30 };

export function FlTopology() {
  const { phase, activeHospitalId, modelVersion, lastF1Delta } = useFlStore();

  const isActive = (idx: number) => {
    if (phase === "idle" || phase === "complete") return false;
    if (phase === "aggregating") return true;
    return !!activeHospitalId;
  };

  return (
    <div className="rounded-xl bg-white border p-4 shadow-sm w-full">
      <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">
        Federated training
      </div>

      <svg
        viewBox="0 0 280 240"
        className="w-full h-auto"
        role="img"
        aria-label="Federated learning topology"
      >
        {HOSPITALS.map((h) => (
          <line
            key={h.id}
            x1={h.x}
            y1={h.y}
            x2={AGGREGATOR.x + AGGREGATOR.w / 2}
            y2={AGGREGATOR.y + AGGREGATOR.h / 2}
            stroke={phase === "aggregating" ? "#14b8a6" : "#cbd5e1"}
            strokeWidth={1.5}
            strokeDasharray={phase === "local_training" ? "4 3" : undefined}
          />
        ))}

        {HOSPITALS.map((h, i) => {
          const active = isActive(i);
          return (
            <g key={h.id}>
              <circle
                cx={h.x}
                cy={h.y}
                r={active ? 18 : 14}
                fill={active ? "#14b8a6" : "#e2e8f0"}
                stroke={active ? "#0f766e" : "#94a3b8"}
                strokeWidth={1.5}
              >
                {active && (
                  <animate
                    attributeName="r"
                    values="14;20;14"
                    dur="1.2s"
                    repeatCount="indefinite"
                  />
                )}
              </circle>
              <text
                x={h.x}
                y={h.y + 32}
                textAnchor="middle"
                fontSize={10}
                fill="#475569"
              >
                {h.label}
              </text>
            </g>
          );
        })}

        <rect
          x={AGGREGATOR.x}
          y={AGGREGATOR.y}
          width={AGGREGATOR.w}
          height={AGGREGATOR.h}
          rx={4}
          fill={phase === "aggregating" ? "#14b8a6" : "#475569"}
        />
        <text
          x={AGGREGATOR.x + AGGREGATOR.w / 2}
          y={AGGREGATOR.y + AGGREGATOR.h / 2 + 3}
          textAnchor="middle"
          fontSize={9}
          fill="white"
        >
          aggregate
        </text>

        {phase === "complete" && (
          <g transform="translate(220, 200)">
            <circle r={14} fill="#16a34a" />
            <path
              d="M -6 0 L -2 4 L 6 -4"
              stroke="white"
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        )}
      </svg>

      <div className="mt-3 text-xs text-gray-700 min-h-[40px]">
        {phase === "idle" && <span>Idle. Upload a scan to start a round.</span>}
        {phase === "local_training" && (
          <span>Local training on {activeHospitalId ?? "hospital"}…</span>
        )}
        {phase === "aggregating" && <span>Aggregating updates…</span>}
        {phase === "complete" && modelVersion && (
          <span>
            Model v{modelVersion}
            {lastF1Delta != null && (
              <> — F1 improved by {(lastF1Delta * 100).toFixed(2)}pp</>
            )}
          </span>
        )}
      </div>

      <div className="mt-2 text-[11px] rounded bg-teal-50 text-teal-900 p-2">
        Your data stayed in your hospital. 0 bytes of patient data transmitted.
      </div>
    </div>
  );
}

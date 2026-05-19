"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useFlStore } from "@/lib/fl-store";

const HOSPITALS = [
  { id: "h1", label: "Hospital A", x: 60,  y: 52  },
  { id: "h2", label: "Hospital B", x: 200, y: 52  },
  { id: "h3", label: "Hospital C", x: 130, y: 178 },
];
const AGG = { x: 130, y: 110 };

const PHASE_LABEL: Record<string, string> = {
  idle:           "Waiting for scan upload",
  local_training: "Local training on hospital data…",
  aggregating:    "Aggregating model updates…",
  complete:       "Round complete",
};

function DataPacket({ from, to, delay }: { from: { x: number; y: number }; to: { x: number; y: number }; delay: number }) {
  return (
    <motion.circle
      r={3}
      fill="var(--teal)"
      initial={{ cx: from.x, cy: from.y, opacity: 0 }}
      animate={{ cx: to.x, cy: to.y, opacity: [0, 1, 1, 0] }}
      transition={{ duration: 1.8, delay, repeat: Infinity, repeatDelay: 1.2, ease: "easeInOut" }}
    />
  );
}

export function FlTopology() {
  const { phase, activeHospitalId, modelVersion, lastF1Delta } = useFlStore();

  const isAggregating = phase === "aggregating";
  const isTraining = phase === "local_training";
  const isDone = phase === "complete";

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="rounded-xl border w-full"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-2 border-b" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
              Federated training
            </div>
            <div className="text-sm font-medium mt-0.5" style={{ color: "var(--text-primary)" }}>
              FL Network
            </div>
          </div>
          <div
            className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full"
            style={{
              background: phase === "idle" ? "var(--bg-card2)" : "var(--teal-glow)",
              color: phase === "idle" ? "var(--text-secondary)" : "var(--teal)",
              border: "1px solid " + (phase === "idle" ? "var(--border)" : "var(--teal)40"),
            }}
          >
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: phase === "idle" ? "var(--text-secondary)" : "var(--teal)",
                animation: phase !== "idle" && !isDone ? "node-pulse 1.4s ease infinite" : "none",
              }}
            />
            {phase === "idle" ? "Idle" : phase === "complete" ? "Complete" : "Active"}
          </div>
        </div>
      </div>

      {/* SVG topology */}
      <div className="px-2 py-2">
        <svg viewBox="0 0 280 240" className="w-full h-auto">
          {/* Connection lines */}
          {HOSPITALS.map((h) => (
            <g key={h.id}>
              <line
                x1={h.x} y1={h.y} x2={AGG.x} y2={AGG.y}
                stroke="var(--border)"
                strokeWidth={1}
              />
              {(isTraining || isAggregating) && (
                <motion.line
                  x1={h.x} y1={h.y} x2={AGG.x} y2={AGG.y}
                  stroke="var(--teal)"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: isAggregating ? 0.8 : 0.4 }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              )}
            </g>
          ))}

          {/* Animated data packets */}
          {isTraining && HOSPITALS.map((h, i) => (
            <DataPacket key={h.id} from={h} to={AGG} delay={i * 0.6} />
          ))}
          {isAggregating && HOSPITALS.map((h, i) => (
            <DataPacket key={h.id} from={AGG} to={h} delay={i * 0.4} />
          ))}

          {/* Hospital nodes */}
          {HOSPITALS.map((h) => {
            const active = isTraining || isAggregating;
            return (
              <g key={h.id}>
                {active && (
                  <motion.circle
                    cx={h.x} cy={h.y} r={20}
                    fill="var(--teal)"
                    opacity={0}
                    animate={{ r: [16, 26, 16], opacity: [0, 0.15, 0] }}
                    transition={{ duration: 2, repeat: Infinity, delay: Math.random() * 0.8 }}
                  />
                )}
                <circle
                  cx={h.x} cy={h.y} r={14}
                  fill={active ? "var(--teal-glow)" : "var(--bg-card2)"}
                  stroke={active ? "var(--teal)" : "var(--border)"}
                  strokeWidth={active ? 1.5 : 1}
                />
                <text
                  x={h.x} y={h.y + 4}
                  textAnchor="middle"
                  fontSize={8}
                  fill={active ? "var(--teal)" : "var(--text-secondary)"}
                  fontFamily="var(--font-geist-mono)"
                >
                  H{HOSPITALS.indexOf(h) + 1}
                </text>
                <text
                  x={h.x} y={h.y + 30}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--text-secondary)"
                >
                  {h.label}
                </text>
              </g>
            );
          })}

          {/* Aggregator node */}
          <rect
            x={AGG.x - 24} y={AGG.y - 16}
            width={48} height={32} rx={6}
            fill={isAggregating ? "var(--teal)" : "var(--bg-card2)"}
            stroke={isAggregating ? "var(--teal)" : "var(--border)"}
            strokeWidth={1}
          />
          <text
            x={AGG.x} y={AGG.y + 4}
            textAnchor="middle"
            fontSize={8}
            fill={isAggregating ? "#0d1117" : "var(--text-secondary)"}
            fontFamily="var(--font-geist-mono)"
          >
            AGG
          </text>

          {/* Complete checkmark */}
          {isDone && (
            <motion.g
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
              style={{ transformOrigin: "220px 195px" }}
            >
              <circle cx={220} cy={195} r={14} fill="#16a34a30" stroke="#16a34a" strokeWidth={1.5} />
              <path d="M213 195 L218 200 L227 189" stroke="#4ade80" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </motion.g>
          )}
        </svg>
      </div>

      {/* Status text */}
      <div className="px-4 pb-3 space-y-2">
        <AnimatePresence mode="wait">
          <motion.div
            key={phase}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            className="text-xs"
            style={{ color: "var(--text-secondary)" }}
          >
            {PHASE_LABEL[phase] ?? phase}
            {isDone && modelVersion && (
              <span className="ml-1" style={{ color: "var(--teal)" }}>
                — Model v{modelVersion}
                {lastF1Delta != null && lastF1Delta > 0 && ` (+${(lastF1Delta * 100).toFixed(2)}pp F1)`}
              </span>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Privacy pill */}
        <div
          className="text-[11px] rounded-lg px-3 py-2 flex items-center gap-1.5"
          style={{ background: "var(--teal-glow)", color: "#99f6e4", border: "1px solid var(--teal)30" }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M5 1L8.5 2.5V5.5C8.5 7.2 6.9 8.6 5 9C3.1 8.6 1.5 7.2 1.5 5.5V2.5L5 1Z"
              fill="none" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          Your data stayed in your hospital — 0 bytes of patient data transmitted
        </div>
      </div>
    </motion.div>
  );
}

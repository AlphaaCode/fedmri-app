"use client";

import { motion } from "framer-motion";
import { TopologyNode, TopologyResponse } from "@/lib/researcher-api";

// Positions for 3 hospital nodes + 1 central aggregator in a 600x360 viewBox
const NODE_POSITIONS = [
  { x: 120, y: 90  },  // Hospital 0 — top-left
  { x: 480, y: 90  },  // Hospital 1 — top-right
  { x: 300, y: 290 },  // Hospital 2 — bottom-center
];
const AGG_POS = { x: 300, y: 175 };

function getInitial(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

interface Props {
  topology: TopologyResponse;
  selectedId: string | null;
  onSelectNode: (id: string | null) => void;
}

export function NetworkDiagram({ topology, selectedId, onSelectNode }: Props) {
  const { nodes, aggregator } = topology;

  // Use at most 3 nodes, matching the positions
  const displayNodes = nodes.slice(0, 3);

  return (
    <svg
      viewBox="0 0 600 360"
      className="w-full h-auto"
      aria-label="Federated network topology diagram"
    >
      {/* Connection lines from each hospital to the aggregator */}
      {displayNodes.map((node, i) => {
        const pos = NODE_POSITIONS[i];
        const isSelected = selectedId === node.id;

        return (
          <g key={`line-${node.id}`}>
            {/* Base connection line */}
            <line
              x1={pos.x}
              y1={pos.y}
              x2={AGG_POS.x}
              y2={AGG_POS.y}
              stroke="var(--border)"
              strokeWidth={1}
            />
            {/* Continuous data-flow stream (weight updates in transit) */}
            <line
              className="line-flow"
              x1={pos.x}
              y1={pos.y}
              x2={AGG_POS.x}
              y2={AGG_POS.y}
              stroke="var(--teal)"
              strokeWidth={1.2}
              style={{ animationDelay: `${i * 0.3}s` }}
            />
            {/* Teal overlay when this node is selected */}
            {isSelected && (
              <motion.line
                x1={pos.x}
                y1={pos.y}
                x2={AGG_POS.x}
                y2={AGG_POS.y}
                stroke="var(--teal)"
                strokeWidth={1.5}
                strokeDasharray="6 3"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.8 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            )}
          </g>
        );
      })}

      {/* Hospital nodes */}
      {displayNodes.map((node, i) => {
        const pos = NODE_POSITIONS[i];
        const isSelected = selectedId === node.id;
        const initial = getInitial(node.displayName);

        return (
          <g
            key={node.id}
            className="cursor-pointer"
            role="button"
            aria-label={`Select ${node.displayName}`}
            tabIndex={0}
            onClick={() => onSelectNode(isSelected ? null : node.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectNode(isSelected ? null : node.id);
              }
            }}
          >
            {/* Pulse ring when selected */}
            {isSelected && (
              <motion.circle
                cx={pos.x}
                cy={pos.y}
                r={22}
                fill="none"
                stroke="var(--teal)"
                strokeWidth={1}
                initial={{ r: 22, opacity: 0.6 }}
                animate={{ r: [22, 34, 22], opacity: [0.6, 0, 0.6] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              />
            )}

            {/* Node circle */}
            <circle
              cx={pos.x}
              cy={pos.y}
              r={22}
              fill={isSelected ? "var(--teal-glow)" : "var(--bg-card2)"}
              stroke={isSelected ? "var(--teal)" : "var(--border)"}
              strokeWidth={isSelected ? 2 : 1}
            />

            {/* Node initial text */}
            <text
              x={pos.x}
              y={pos.y + 5}
              textAnchor="middle"
              fontSize={11}
              fontWeight="bold"
              fill={isSelected ? "var(--teal)" : "var(--text-secondary)"}
              style={{ fontFamily: "var(--font-geist-mono, monospace)", pointerEvents: "none" }}
            >
              {initial}
            </text>

            {/* Label below node */}
            <text
              x={pos.x}
              y={pos.y + 38}
              textAnchor="middle"
              fontSize={9}
              fill={isSelected ? "var(--teal)" : "var(--text-secondary)"}
              style={{ pointerEvents: "none" }}
            >
              {node.displayName}
            </text>
            <text
              x={pos.x}
              y={pos.y + 50}
              textAnchor="middle"
              fontSize={8}
              fill="var(--text-secondary)"
              style={{ pointerEvents: "none", opacity: 0.7 }}
            >
              {node.totalCases} scans
            </text>
          </g>
        );
      })}

      {/* Aggregator node (rounded rectangle in center) */}
      <g>
        {/* Subtle glow under aggregator */}
        <rect
          x={AGG_POS.x - 38}
          y={AGG_POS.y - 22}
          width={76}
          height={44}
          rx={10}
          fill="var(--teal)"
          opacity={0.06}
        />

        {/* Main aggregator box */}
        <rect
          x={AGG_POS.x - 34}
          y={AGG_POS.y - 18}
          width={68}
          height={36}
          rx={8}
          fill="var(--bg-card2)"
          stroke="var(--teal)"
          strokeWidth={1.5}
        />

        {/* "AGG" label */}
        <text
          x={AGG_POS.x}
          y={AGG_POS.y - 4}
          textAnchor="middle"
          fontSize={9}
          fontWeight="bold"
          fill="var(--teal)"
          style={{ fontFamily: "var(--font-geist-mono, monospace)" }}
        >
          AGG
        </text>

        {/* Aggregator display label */}
        <text
          x={AGG_POS.x}
          y={AGG_POS.y + 8}
          textAnchor="middle"
          fontSize={7.5}
          fill="var(--text-secondary)"
          style={{ fontFamily: "var(--font-geist-mono, monospace)" }}
        >
          {aggregator.label}
        </text>

        {/* Phase indicator below aggregator */}
        <text
          x={AGG_POS.x}
          y={AGG_POS.y + 28}
          textAnchor="middle"
          fontSize={8}
          fill="var(--text-secondary)"
          opacity={0.6}
        >
          {aggregator.phase}
        </text>
      </g>
    </svg>
  );
}

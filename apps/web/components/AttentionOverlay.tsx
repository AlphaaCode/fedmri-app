"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { apiGetAttention } from "@/lib/api";

const SIZE = 224;

function attentionToHeatmap(attn: number[], size: number, alpha: number): ImageData {
  const img = new ImageData(size, size);
  for (let i = 0; i < attn.length; i++) {
    const v = Math.max(0, Math.min(1, attn[i]));
    // jet colormap: blue → cyan → green → yellow → red
    let r = 0, g = 0, b = 0;
    if (v < 0.25) {
      b = 1; g = v / 0.25;
    } else if (v < 0.5) {
      b = 1 - (v - 0.25) / 0.25; g = 1;
    } else if (v < 0.75) {
      g = 1; r = (v - 0.5) / 0.25;
    } else {
      r = 1; g = 1 - (v - 0.75) / 0.25;
    }
    const o = i * 4;
    img.data[o]     = Math.round(r * 255);
    img.data[o + 1] = Math.round(g * 255);
    img.data[o + 2] = Math.round(b * 255);
    img.data[o + 3] = Math.round(v * alpha * 255);
  }
  return img;
}

export function AttentionOverlay({ caseId }: { caseId: string }) {
  const [show, setShow] = useState(true);
  const [opacity, setOpacity] = useState(65);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attnData, setAttnData] = useState<number[] | null>(null);
  const [slicePng, setSlicePng] = useState<string | null>(null);
  const [topSlice, setTopSlice] = useState<number | null>(null);
  const heatRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGetAttention(caseId)
      .then(({ attention, slicePng, topSlice }) => {
        if (cancelled) return;
        setAttnData(attention);
        setSlicePng(slicePng ?? null);
        setTopSlice(typeof topSlice === "number" ? topSlice : null);
      })
      .catch((e) => { if (!cancelled) setError(e?.message || "Failed to load"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [caseId]);

  useEffect(() => {
    if (!attnData || !heatRef.current) return;
    const canvas = heatRef.current;
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d")!;
    const img = attentionToHeatmap(attnData, SIZE, show ? opacity / 100 : 0);
    ctx.putImageData(img, 0, 0);
  }, [attnData, opacity, show]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="rounded-xl border p-4"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
            AI focus areas
          </div>
          <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {topSlice != null
              ? `Real model attention · slice ${topSlice}`
              : "Regions that influenced the prediction"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="text-xs px-2.5 py-1 rounded-lg transition-colors"
          style={{
            background: show ? "var(--teal-glow)" : "var(--bg-card2)",
            color: show ? "var(--teal)" : "var(--text-secondary)",
            border: "1px solid var(--border)",
          }}
        >
          {show ? "Hide" : "Show"} heatmap
        </button>
      </div>

      <div
        className="relative mx-auto overflow-hidden rounded-lg"
        style={{ width: SIZE, height: SIZE, background: "#050a0e" }}
      >
        {slicePng ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={slicePng}
            alt="Top-attended MRI slice"
            className="absolute inset-0"
            style={{ width: SIZE, height: SIZE, objectFit: "cover" }}
          />
        ) : (
          <div className="absolute inset-0" style={{ width: SIZE, height: SIZE, background: "#050a0e" }} />
        )}
        <canvas
          ref={heatRef}
          className="absolute inset-0"
          style={{ width: SIZE, height: SIZE, mixBlendMode: "screen", transition: "opacity 0.2s" }}
        />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-xs px-3 py-1.5 rounded-full" style={{ background: "rgba(0,0,0,0.7)", color: "var(--teal)" }}>
              Loading heatmap…
            </div>
          </div>
        )}
        {!loading && error && (
          <div className="absolute bottom-2 left-2 text-[10px] px-2 py-1 rounded" style={{ background: "rgba(0,0,0,0.6)", color: "var(--text-secondary)" }}>
            Heatmap unavailable for this scan
          </div>
        )}
        {/* Scale bar */}
        <div className="absolute bottom-2 right-2 flex items-center gap-1">
          <div className="w-12 h-1 rounded" style={{
            background: "linear-gradient(to right, #00f, #0ff, #0f0, #ff0, #f00)"
          }} />
          <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.5)" }}>activation</span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <span className="text-xs w-14 shrink-0" style={{ color: "var(--text-secondary)" }}>Opacity</span>
        <input
          type="range"
          min={0}
          max={100}
          value={opacity}
          onChange={(e) => setOpacity(parseInt(e.target.value, 10))}
          disabled={!show || !!error}
          className="flex-1 accent-teal-400"
        />
        <span className="text-xs tabular-nums w-8 text-right" style={{ color: "var(--text-secondary)" }}>
          {opacity}%
        </span>
      </div>
    </motion.div>
  );
}

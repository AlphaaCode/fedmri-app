"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { apiGetAttention } from "@/lib/api";

const SIZE = 224;
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

// Synthetic breast-MRI cross-section, drawn when the backend has no real slice
// (mock mode). In real mode the actual slice PNG is shown instead. This keeps
// the focus-area heatmap overlaid on a recognisable breast image either way.
function drawBreastMRI(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = SIZE;
  canvas.height = SIZE;

  ctx.fillStyle = "#050a0e";
  ctx.fillRect(0, 0, SIZE, SIZE);

  const cx = SIZE / 2, cy = SIZE * 0.52;
  const rx = SIZE * 0.38, ry = SIZE * 0.42;

  // Outer breast tissue (radial gradient ellipse)
  const outerGrad = ctx.createRadialGradient(cx, cy - 10, SIZE * 0.04, cx, cy, SIZE * 0.47);
  outerGrad.addColorStop(0, "#5a6a72");
  outerGrad.addColorStop(0.45, "#3a4a52");
  outerGrad.addColorStop(0.75, "#1e2d35");
  outerGrad.addColorStop(1, "#0a1418");
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = outerGrad;
  ctx.fill();
  ctx.restore();

  // Fatty tissue streaks (deterministic-ish, seeded by index)
  ctx.save();
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < 18; i++) {
    const angle = (i / 18) * Math.PI * 2;
    const r = SIZE * 0.14 + Math.sin(i * 2.3) * SIZE * 0.08;
    const sx = cx + Math.cos(angle) * r;
    const sy = cy + Math.sin(angle) * r;
    const ex = cx + Math.cos(angle) * rx * 0.85;
    const ey = cy + Math.sin(angle) * ry * 0.85;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.strokeStyle = `rgba(180,200,210,${0.08 + ((i * 37) % 12) / 100})`;
    ctx.lineWidth = 0.8 + ((i * 53) % 12) / 10;
    ctx.stroke();
  }
  ctx.restore();

  // Fibroglandular core (dense tissue)
  const fgcx = cx + SIZE * 0.03, fgcy = cy - SIZE * 0.02;
  const fgRad = ctx.createRadialGradient(fgcx, fgcy, SIZE * 0.01, fgcx, fgcy, SIZE * 0.2);
  fgRad.addColorStop(0, "rgba(180, 200, 220, 0.55)");
  fgRad.addColorStop(0.4, "rgba(140, 165, 180, 0.35)");
  fgRad.addColorStop(0.7, "rgba(100, 130, 150, 0.15)");
  fgRad.addColorStop(1, "rgba(80, 110, 130, 0)");
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(fgcx, fgcy, SIZE * 0.19, SIZE * 0.17, -0.2, 0, Math.PI * 2);
  ctx.fillStyle = fgRad;
  ctx.fill();
  ctx.restore();

  // Nipple region
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx + SIZE * 0.28, cy - SIZE * 0.04, SIZE * 0.025, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(220, 240, 255, 0.4)";
  ctx.fill();
  ctx.restore();

  // Skin boundary arc
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(200, 220, 240, 0.3)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Faint scan grid
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 0.5;
  for (let y = 0; y < SIZE; y += 14) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SIZE, y); ctx.stroke();
  }
  ctx.restore();

  // Scanner field-of-view corner markers
  ctx.save();
  ctx.strokeStyle = "rgba(45,212,191,0.35)";
  ctx.lineWidth = 1;
  const m = 6;
  ([[0, 0], [SIZE, 0], [0, SIZE], [SIZE, SIZE]] as const).forEach(([x, y]) => {
    ctx.beginPath();
    ctx.moveTo(x === 0 ? x + m : x - m, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y === 0 ? y + m : y - m);
    ctx.stroke();
  });
  ctx.restore();
}

function turboColor(t: number): [number, number, number] {
  const r = Math.max(0, Math.min(1,
    0.1357 + t * (4.5974 + t * (-42.3277 + t * (130.5887 + t * (-185.4973 + t * 98.7325))))
  ));
  const g = Math.max(0, Math.min(1,
    0.0914 + t * (2.1856 + t * (4.8052 + t * (-14.0741 + t * (4.2070 + t * 2.9656))))
  ));
  const b = Math.max(0, Math.min(1,
    0.1067 + t * (11.4617 + t * (-67.5383 + t * (175.6867 + t * (-216.9909 + t * 99.3232))))
  ));
  return [r, g, b];
}

function attentionToHeatmap(attn: number[], size: number, alpha: number): ImageData {
  const img = new ImageData(size, size);
  const max = Math.max(...attn) || 1;
  for (let i = 0; i < attn.length; i++) {
    const v = Math.max(0, Math.min(1, attn[i] / max));
    const [r, g, b] = turboColor(v);
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
  const bgRef = useRef<HTMLCanvasElement>(null);
  const heatRef = useRef<HTMLCanvasElement>(null);

  // ── Zoom / pan state ──────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);

  const clampPan = useCallback((z: number, x: number, y: number) => {
    const el = viewportRef.current;
    const w = el?.clientWidth ?? SIZE;
    const h = el?.clientHeight ?? SIZE;
    const maxX = (w * (z - 1)) / 2;
    const maxY = (h * (z - 1)) / 2;
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  }, []);

  // Zoom keeping the point under (clientX,clientY) fixed on screen.
  const zoomAtClient = useCallback(
    (clientX: number, clientY: number, nextZoom: number) => {
      const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
      const el = viewportRef.current;
      if (!el) { setZoom(z); return; }
      const r = el.getBoundingClientRect();
      const c = { x: clientX - (r.left + r.width / 2), y: clientY - (r.top + r.height / 2) };
      setPan((p) => {
        // content point currently under the cursor
        const u = { x: (c.x - p.x) / zoom, y: (c.y - p.y) / zoom };
        const np = { x: c.x - u.x * z, y: c.y - u.y * z };
        return z <= 1 ? { x: 0, y: 0 } : clampPan(z, np.x, np.y);
      });
      setZoom(z);
    },
    [zoom, clampPan],
  );

  const zoomByCenter = useCallback(
    (factor: number) => {
      const el = viewportRef.current;
      const r = el?.getBoundingClientRect();
      const cx = r ? r.left + r.width / 2 : 0;
      const cy = r ? r.top + r.height / 2 : 0;
      zoomAtClient(cx, cy, zoom * factor);
    },
    [zoom, zoomAtClient],
  );

  const resetView = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);

  // Native wheel listener (passive:false so we can preventDefault the page scroll).
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAtClient(e.clientX, e.clientY, zoom * Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoom, zoomAtClient]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    resetView();
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
  }, [caseId, resetView]);

  // Draw the synthetic breast-MRI background whenever there is no real slice.
  useEffect(() => {
    if (slicePng || !bgRef.current) return;
    drawBreastMRI(bgRef.current);
  }, [slicePng, attnData]);

  // Render the attention heatmap on top.
  useEffect(() => {
    if (!attnData || !heatRef.current) return;
    const canvas = heatRef.current;
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = attentionToHeatmap(attnData, SIZE, show ? opacity / 100 : 0);
    ctx.putImageData(img, 0, 0);
  }, [attnData, opacity, show]);

  // ── Drag-to-pan handlers (only meaningful when zoomed in) ─────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    dragRef.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
    setDragging(true);
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setPan(clampPan(zoom, d.px + (e.clientX - d.sx), d.py + (e.clientY - d.sy)));
  };
  const endDrag = () => { dragRef.current = null; setDragging(false); };
  const onDoubleClick = (e: React.MouseEvent) => {
    if (zoom > 1) resetView();
    else zoomAtClient(e.clientX, e.clientY, 2.6);
  };

  const zoomed = zoom > 1.01;

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
        ref={viewportRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onDoubleClick={onDoubleClick}
        className="relative mx-auto overflow-hidden rounded-lg select-none"
        style={{
          width: "100%",
          maxWidth: 340,
          aspectRatio: "1 / 1",
          background: "#050a0e",
          cursor: zoomed ? (dragging ? "grabbing" : "grab") : "zoom-in",
          touchAction: "none",
        }}
      >
        {/* Zoom/pan transform wrapper — bg + heatmap scale together so they stay aligned */}
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            transition: dragging ? "none" : "transform 0.15s ease-out",
          }}
        >
          {slicePng ? (
            // Real MRI slice (real inference mode)
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={slicePng}
              alt="Top-attended MRI slice"
              className="absolute inset-0 w-full h-full"
              style={{ objectFit: "cover" }}
              draggable={false}
            />
          ) : (
            // Synthetic breast-MRI background (mock mode)
            <canvas ref={bgRef} className="absolute inset-0 w-full h-full" />
          )}
          <canvas
            ref={heatRef}
            className="absolute inset-0 w-full h-full"
            style={{ mixBlendMode: "screen", transition: "opacity 0.2s" }}
          />
        </div>

        {/* Zoom toolbar (overlay, fixed to the viewport) */}
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          {[
            { k: "in", label: "+", on: () => zoomByCenter(1.4), disabled: zoom >= MAX_ZOOM },
            { k: "out", label: "−", on: () => zoomByCenter(1 / 1.4), disabled: zoom <= MIN_ZOOM },
            { k: "reset", label: "⤢", on: resetView, disabled: !zoomed },
          ].map(({ k, label, on, disabled }) => (
            <button
              key={k}
              type="button"
              onClick={on}
              disabled={disabled}
              aria-label={k === "in" ? "Zoom in" : k === "out" ? "Zoom out" : "Reset zoom"}
              className="w-7 h-7 rounded-md flex items-center justify-center text-sm font-bold transition-all disabled:opacity-30"
              style={{
                background: "rgba(13,17,23,0.72)",
                color: "var(--teal)",
                border: "1px solid rgba(45,212,191,0.35)",
                backdropFilter: "blur(4px)",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Zoom level badge */}
        {zoomed && (
          <div
            className="absolute top-2 left-2 text-[10px] font-mono px-1.5 py-0.5 rounded"
            style={{ background: "rgba(13,17,23,0.72)", color: "var(--teal)", backdropFilter: "blur(4px)" }}
          >
            {zoom.toFixed(1)}×
          </div>
        )}

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
        <div className="absolute bottom-2 right-2 flex items-center gap-1 pointer-events-none">
          <div className="w-12 h-1 rounded" style={{
            background: "linear-gradient(to right, #30123b, #4040a0, #28bbec, #14d480, #f9dc3e, #fe7520, #7a0403)"
          }} />
          <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.5)" }}>activation</span>
        </div>
      </div>

      {/* Hint */}
      <div className="mt-2 text-[10px] text-center" style={{ color: "var(--text-secondary)", opacity: 0.7 }}>
        {zoomed ? "Drag to pan · double-click to reset" : "Scroll or double-click the focus area to zoom in"}
      </div>

      <div className="mt-2 flex items-center gap-3">
        <span className="text-xs w-14 shrink-0" style={{ color: "var(--text-secondary)" }}>Opacity</span>
        <input
          type="range"
          min={0}
          max={100}
          value={opacity}
          onChange={(e) => setOpacity(parseInt(e.target.value, 10))}
          disabled={!show || !!error}
          className="flex-1 heat-slider"
          aria-label="Heatmap opacity"
          style={{
            background:
              !show || error
                ? "var(--bg-card2)"
                : `linear-gradient(to right, var(--teal-dim) 0%, var(--teal) ${opacity}%, var(--bg-card2) ${opacity}%)`,
          }}
        />
        <span
          className="text-xs tabular-nums w-9 text-right font-medium"
          style={{ color: show && !error ? "var(--teal)" : "var(--text-secondary)" }}
        >
          {opacity}%
        </span>
      </div>
    </motion.div>
  );
}

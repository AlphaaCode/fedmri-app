"use client";

import { useEffect, useRef, useState } from "react";
import { apiGetAttention } from "@/lib/api";

interface Props {
  caseId: string;
}

function attentionToImageData(attn: number[], size: number): ImageData {
  const img = new ImageData(size, size);
  for (let i = 0; i < attn.length; i++) {
    const v = Math.max(0, Math.min(1, attn[i]));
    // blue → yellow → red colormap (jet-ish)
    let r: number, g: number, b: number;
    if (v < 0.5) {
      const t = v / 0.5;
      r = 0;
      g = Math.round(255 * t);
      b = Math.round(255 * (1 - t));
    } else {
      const t = (v - 0.5) / 0.5;
      r = Math.round(255 * t);
      g = Math.round(255 * (1 - t));
      b = 0;
    }
    const o = i * 4;
    img.data[o] = r;
    img.data[o + 1] = g;
    img.data[o + 2] = b;
    img.data[o + 3] = Math.round(255 * v); // alpha tied to magnitude
  }
  return img;
}

export function AttentionOverlay({ caseId }: Props) {
  const [show, setShow] = useState(true);
  const [opacity, setOpacity] = useState(70);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const heatRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    apiGetAttention(caseId)
      .then(({ attention, size }) => {
        if (cancelled) return;
        // MRI placeholder background
        const bg = bgRef.current;
        if (bg) {
          bg.width = size;
          bg.height = size;
          const ctx = bg.getContext("2d");
          if (ctx) {
            const grad = ctx.createRadialGradient(
              size / 2,
              size / 2,
              10,
              size / 2,
              size / 2,
              size / 1.4,
            );
            grad.addColorStop(0, "#444");
            grad.addColorStop(1, "#0a0a0a");
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, size, size);
          }
        }
        // Heatmap layer
        const heat = heatRef.current;
        if (heat) {
          heat.width = size;
          heat.height = size;
          const ctx = heat.getContext("2d");
          if (ctx) {
            const img = attentionToImageData(attention, size);
            ctx.putImageData(img, 0, 0);
          }
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "Failed to load attention");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [caseId]);

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium text-gray-800">AI focus areas</div>
        <button
          type="button"
          className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
          onClick={() => setShow((s) => !s)}
        >
          {show ? "Hide overlay" : "Show overlay"}
        </button>
      </div>

      {error ? (
        <div className="text-sm text-red-700 bg-red-50 p-2 rounded">
          {error}
        </div>
      ) : (
        <>
          <div className="relative mx-auto" style={{ width: 224, height: 224 }}>
            <canvas
              ref={bgRef}
              className="absolute inset-0"
              style={{ width: 224, height: 224 }}
            />
            <canvas
              ref={heatRef}
              className="absolute inset-0 mix-blend-screen"
              style={{
                width: 224,
                height: 224,
                opacity: show ? opacity / 100 : 0,
                transition: "opacity 0.15s",
              }}
            />
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-white/80 bg-black/30">
                Loading heatmap…
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <span className="text-xs text-gray-600 w-16">Opacity</span>
            <input
              type="range"
              min={0}
              max={100}
              value={opacity}
              onChange={(e) => setOpacity(parseInt(e.target.value, 10))}
              className="flex-1"
              disabled={!show}
            />
            <span className="text-xs tabular-nums w-10 text-right">
              {opacity}%
            </span>
          </div>
        </>
      )}
    </div>
  );
}

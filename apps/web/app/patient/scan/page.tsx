"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDropzone } from "react-dropzone";
import { apiUploadCase } from "@/lib/api";
import { downloadCasePdf } from "@/lib/download-pdf";
import { SUBTYPE_PLAIN, SUBTYPE_COLOR, SUBTYPE_HORMONE_ADVISORY, type Subtype, type CaseResult } from "@/lib/types";
import { AttentionOverlay } from "@/components/AttentionOverlay";

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.7 ? "#2dd4bf" : value >= 0.5 ? "#f59e0b" : "#fb7185";
  const label = value >= 0.7 ? "High" : value >= 0.5 ? "Moderate" : "Low";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>AI confidence</span>
        <span className="text-sm font-semibold tabular-nums" style={{ color }}>{label} · {pct}%</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-base)" }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

function PdfButton({ caseId }: { caseId: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function handleClick() {
    setBusy(true);
    setErr(null);
    try { await downloadCasePdf(caseId); }
    catch (e: any) { setErr(e?.message || "Download failed"); }
    finally { setBusy(false); }
  }
  return (
    <div>
      <button
        onClick={handleClick}
        disabled={busy}
        className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-60"
        style={{ background: "var(--teal-glow)", color: "var(--teal)", border: "1px solid var(--teal)40" }}
      >
        {busy ? "Generating…" : "Download PDF report"}
      </button>
      {err && <div className="text-[11px] mt-1" style={{ color: "#fb7185" }}>{err}</div>}
    </div>
  );
}

export default function PatientScanPage() {
  const [result, setResult] = useState<CaseResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrop = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const r = await apiUploadCase(file) as CaseResult;
      setResult(r);
    } catch (e: any) {
      setError(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: { "application/octet-stream": [".mha", ".dcm"], "image/*": [".jpg", ".jpeg", ".png"] },
  });

  const subtype = result?.predictedSubtype as Subtype | undefined;
  const subtypeColor = subtype ? (SUBTYPE_COLOR[subtype] ?? "var(--text-primary)") : "var(--text-primary)";
  const subtypePlain = subtype ? (SUBTYPE_PLAIN[subtype] ?? subtype) : "";
  const hormoneAdvisory = result?.hormoneTherapy
    ?? (subtype ? SUBTYPE_HORMONE_ADVISORY[subtype] : undefined);

  return (
    <div className="max-w-xl mx-auto p-5 space-y-5">
      <div>
        <h1 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Scan analysis</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
          Upload your MRI scan — our AI analyses it in seconds
        </p>
      </div>

      {!result && (
        <div
          {...getRootProps()}
          className="rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all"
          style={{
            borderColor: isDragActive ? "var(--teal)" : "var(--border)",
            background: isDragActive ? "var(--teal-glow)" : "var(--bg-card)",
          }}
        >
          <input {...getInputProps()} />
          {uploading ? (
            <div className="space-y-2">
              <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Analysing your scan…</div>
              <div className="h-1 rounded-full overflow-hidden mx-auto max-w-[160px]" style={{ background: "var(--bg-base)" }}>
                <div className="h-full rounded-full bg-teal-400 animate-pulse w-full" />
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                AI trained across 3 hospitals is reviewing your scan
              </div>
            </div>
          ) : (
            <>
              <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {isDragActive ? "Drop to analyse" : "Drop your scan or click to browse"}
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                DICOM (.dcm), MHA (.mha), or JPEG/PNG
              </div>
            </>
          )}
          {error && <div className="mt-3 text-xs" style={{ color: "#fb7185" }}>{error}</div>}
        </div>
      )}

      <AnimatePresence>
        {result && (
          <motion.div
            key={result.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            {/* AI result card */}
            <div className="rounded-xl border p-5 space-y-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
              <div className="text-xs uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>AI result</div>

              <div>
                <div className="text-2xl font-bold" style={{ color: subtypeColor }}>{subtype}</div>
                <div className="text-sm mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {subtypePlain}
                </div>
              </div>

              <ConfidenceBar value={result.confidence} />

              {hormoneAdvisory && (
                <div className="rounded-lg p-3 text-xs leading-relaxed" style={{ background: "var(--teal-glow)", color: "#99f6e4", border: "1px solid var(--teal)30" }}>
                  {hormoneAdvisory}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setResult(null)}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: "var(--bg-card2)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                >
                  Analyse another
                </button>
                <PdfButton caseId={result.id} />
              </div>
            </div>

            {/* Attention heatmap */}
            <AttentionOverlay caseId={result.id} />

            {/* Non-dismissable disclaimer */}
            <div className="rounded-xl p-4 text-sm" style={{ background: "#fb718510", border: "2px solid #fb718840", color: "#fb7185" }}>
              <div className="font-semibold mb-1 flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1l6 11H1L7 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                  <path d="M7 5.5V8M7 9.5h.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                Important
              </div>
              <p className="text-xs leading-relaxed">
                This is an educational AI tool. Only a certified oncologist can diagnose cancer.
                If you have concerns about your scan, please contact your doctor or nearest cancer centre.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

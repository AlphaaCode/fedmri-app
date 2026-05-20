"use client";

import { useCallback, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { apiUploadCase, apiVerifyImage } from "@/lib/api";
import type { CaseResult } from "@/lib/types";

interface Props { onUploaded: (result: CaseResult) => void; }
type Stage = "idle" | "verifying" | "warn" | "uploading";
interface VerifyResult { valid: boolean; confidence: number; reason: string; }

const MIN_VERIFY_MS = 700;

export function ScanUpload({ onUploaded }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onUploadedRef = useRef(onUploaded);
  onUploadedRef.current = onUploaded;

  async function doUpload(file: File) {
    setStage("uploading");
    setProgress(0);
    const ticker = setInterval(() => setProgress((p) => Math.min(p + Math.random() * 10, 88)), 280);
    try {
      const result = await apiUploadCase(file) as CaseResult;
      setProgress(100);
      clearInterval(ticker);
      setTimeout(() => {
        setStage("idle");
        setPendingFile(null);
        setVerifyResult(null);
        onUploadedRef.current(result);
      }, 500);
    } catch (e: any) {
      clearInterval(ticker);
      setError(e?.message || "Upload failed");
      setStage("idle");
    }
  }

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;

    flushSync(() => {
      setError(null);
      setPendingFile(file);
      setStage("verifying");
    });

    const t0 = Date.now();
    let v: VerifyResult;
    try {
      v = await apiVerifyImage(file);
    } catch (e: any) {
      flushSync(() => {
        setError(`Verification failed: ${e?.message || "Could not reach server"}`);
        setStage("idle");
        setPendingFile(null);
      });
      return;
    }

    const elapsed = Date.now() - t0;
    if (elapsed < MIN_VERIFY_MS) await new Promise((r) => setTimeout(r, MIN_VERIFY_MS - elapsed));

    if (v.valid) {
      await doUpload(file);
    } else {
      flushSync(() => { setVerifyResult(v); setStage("warn"); });
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    disabled: stage === "verifying" || stage === "uploading",
    accept: { "application/octet-stream": [".mha", ".nii", ".gz", ".dcm"], "image/*": [".png", ".jpg", ".jpeg"] },
  });

  const isActive = stage === "verifying" || stage === "uploading";
  const ringColor = stage === "warn" ? "#ff9f0a" : "#00e5cc";

  /* ── Warning state ──────────────────────────────────────────────── */
  if (stage === "warn" && pendingFile && verifyResult) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl p-6 space-y-5"
        style={{ background: "var(--bg-card)", border: "1px solid rgba(255,159,10,0.3)", boxShadow: "0 0 40px rgba(255,159,10,0.06)" }}
      >
        <div className="flex gap-4">
          {/* Warning icon — hexagonal */}
          <div className="shrink-0 w-11 h-11 flex items-center justify-center" style={{
            background: "rgba(255,159,10,0.1)", border: "1px solid rgba(255,159,10,0.3)", borderRadius: 10,
          }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M11 3L20 18H2L11 3Z" stroke="#ff9f0a" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M11 9v5" stroke="#ff9f0a" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="11" cy="16" r="0.8" fill="#ff9f0a"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold mb-1" style={{ fontFamily: "var(--font-display)", color: "#ff9f0a" }}>
              Not a breast MRI scan
            </p>
            <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {verifyResult.reason}
            </p>
            <p className="text-xs mt-2 font-mono" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              {pendingFile.name} · {(verifyResult.confidence * 100).toFixed(0)}% confidence
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={() => { setStage("idle"); setPendingFile(null); setVerifyResult(null); }}
            className="flex-1 text-xs py-2.5 rounded-xl font-medium transition-all hover:brightness-110"
            style={{ background: "var(--bg-card2)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
            ← Choose another file
          </button>
          <button onClick={() => doUpload(pendingFile)}
            className="flex-1 text-xs py-2.5 rounded-xl font-semibold transition-all hover:brightness-110"
            style={{ background: "rgba(255,159,10,0.12)", color: "#ff9f0a", border: "1px solid rgba(255,159,10,0.4)" }}>
            Analyse anyway →
          </button>
        </div>
      </motion.div>
    );
  }

  /* ── Main dropzone — MRI aperture ───────────────────────────────── */
  return (
    <div
      {...getRootProps()}
      className="relative rounded-2xl overflow-hidden transition-all duration-500 select-none"
      style={{
        background: isDragActive ? "rgba(0,229,204,0.04)" : "var(--bg-card)",
        border: `1px solid ${isDragActive ? "rgba(0,229,204,0.5)" : isActive ? "rgba(0,229,204,0.25)" : "var(--border)"}`,
        boxShadow: isDragActive ? "0 0 60px rgba(0,229,204,0.08), inset 0 0 40px rgba(0,229,204,0.04)" : isActive ? "0 0 40px rgba(0,229,204,0.05)" : "none",
        cursor: isActive ? "default" : "pointer",
        minHeight: 280,
      }}
    >
      <input {...getInputProps()} />

      {/* Scan sweep overlay — only while uploading */}
      {stage === "uploading" && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
          <div className="absolute inset-x-0 h-px animate-scan"
            style={{ background: "linear-gradient(90deg, transparent, var(--teal), transparent)", boxShadow: "0 0 16px var(--teal)" }} />
        </div>
      )}

      <AnimatePresence mode="wait">

        {/* ── Idle ─────────────────────────────────────────── */}
        {stage === "idle" && (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center gap-6 p-10">

            {/* Aperture rings */}
            <div className="relative w-32 h-32 flex items-center justify-center">
              {/* Outermost ring — very slow orbit */}
              <div className="absolute inset-0 rounded-full border border-dashed"
                style={{ borderColor: "rgba(0,229,204,0.12)", animation: "orbit-cw 25s linear infinite" }} />
              {/* Mid ring */}
              <div className="absolute inset-4 rounded-full border"
                style={{ borderColor: "rgba(0,229,204,0.18)", animation: "orbit-ccw 18s linear infinite", borderStyle: "dashed" }} />
              {/* Inner ring */}
              <div className="absolute inset-8 rounded-full"
                style={{ border: `1px solid rgba(0,229,204,${isDragActive ? "0.6" : "0.3"})`, transition: "border-color 0.3s" }} />
              {/* Core — MRI cross-section icon */}
              <div className="absolute inset-10 rounded-full flex items-center justify-center"
                style={{ background: isDragActive ? "rgba(0,229,204,0.12)" : "rgba(0,229,204,0.05)", transition: "background 0.3s" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="5" stroke={isDragActive ? "#00e5cc" : "rgba(0,229,204,0.5)"} strokeWidth="1.2"/>
                  <circle cx="12" cy="12" r="2" fill={isDragActive ? "rgba(0,229,204,0.4)" : "rgba(0,229,204,0.15)"}/>
                  <path d="M2 12h3M19 12h3M12 2v3M12 19v3" stroke={isDragActive ? "#00e5cc" : "rgba(0,229,204,0.4)"} strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
              </div>
            </div>

            <div className="text-center space-y-1.5">
              <p className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)", color: isDragActive ? "var(--teal)" : "var(--text-primary)" }}>
                {isDragActive ? "Release to scan" : "Drop breast MRI scan"}
              </p>
              <p className="text-xs" style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)", letterSpacing: "0.06em" }}>
                .png · .jpg · .nii · .dcm · up to 50 MB
              </p>
            </div>

            {error && (
              <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                className="text-xs px-4 py-2 rounded-lg"
                style={{ background: "rgba(255,55,95,0.1)", color: "#ff375f", border: "1px solid rgba(255,55,95,0.25)" }}>
                {error}
              </motion.div>
            )}
          </motion.div>
        )}

        {/* ── Verifying ───────────────────────────────────── */}
        {stage === "verifying" && (
          <motion.div key="verifying" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center gap-6 p-10">

            {/* Aperture rings — faster, more intense */}
            <div className="relative w-32 h-32 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full"
                style={{ border: "1.5px dashed rgba(0,229,204,0.25)", animation: "orbit-cw 8s linear infinite" }} />
              <div className="absolute inset-4 rounded-full"
                style={{ border: "1.5px solid rgba(0,229,204,0.35)", animation: "orbit-ccw 6s linear infinite", borderStyle: "dashed" }} />
              <div className="absolute inset-8 rounded-full"
                style={{ border: "1px solid rgba(0,229,204,0.5)", animation: "ring-breathe 1.6s ease-in-out infinite" }} />
              <div className="absolute inset-10 rounded-full flex items-center justify-center"
                style={{ background: "rgba(0,229,204,0.08)", boxShadow: "0 0 20px rgba(0,229,204,0.2)" }}>
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M10 2a8 8 0 0 1 8 8" stroke="#00e5cc" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </motion.div>
              </div>
            </div>

            <div className="text-center space-y-1.5">
              <p className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
                Verifying scan
              </p>
              <p className="text-xs" style={{ fontFamily: "var(--font-mono)", color: "var(--teal)", letterSpacing: "0.08em" }}>
                Checking modality · {pendingFile?.name}
              </p>
            </div>
          </motion.div>
        )}

        {/* ── Uploading ───────────────────────────────────── */}
        {stage === "uploading" && (
          <motion.div key="uploading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center gap-6 p-10">

            {/* Aperture fully lit */}
            <div className="relative w-32 h-32 flex items-center justify-center"
              style={{ filter: "drop-shadow(0 0 16px rgba(0,229,204,0.3))" }}>
              <div className="absolute inset-0 rounded-full"
                style={{ border: "1.5px solid rgba(0,229,204,0.4)", animation: "orbit-cw 5s linear infinite" }} />
              <div className="absolute inset-4 rounded-full"
                style={{ border: "1.5px solid rgba(0,229,204,0.55)", animation: "orbit-ccw 4s linear infinite" }} />
              <div className="absolute inset-8 rounded-full"
                style={{ border: "2px solid rgba(0,229,204,0.7)", animation: "glow-flicker 1.4s ease-in-out infinite" }} />
              <div className="absolute inset-10 rounded-full flex items-center justify-center"
                style={{ background: "rgba(0,229,204,0.15)" }}>
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <rect x="3" y="5" width="16" height="12" rx="2.5" stroke="#00e5cc" strokeWidth="1.3"/>
                  <circle cx="11" cy="11" r="3.5" stroke="#00e5cc" strokeWidth="1.2"/>
                  <circle cx="11" cy="11" r="1.3" fill="#00e5cc"/>
                </svg>
              </div>
            </div>

            <div className="w-full max-w-xs space-y-2 text-center">
              <p className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
                Running inference
              </p>
              <p className="text-xs" style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)", letterSpacing: "0.06em" }}>
                {pendingFile?.name}
              </p>
              {/* Progress bar */}
              <div className="h-[2px] w-full rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                <motion.div className="h-full rounded-full"
                  style={{ background: "linear-gradient(90deg, var(--teal-deep), var(--teal))", boxShadow: "0 0 8px var(--teal)" }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3, ease: "easeOut" }} />
              </div>
              <p className="text-[10px] tabular-nums text-right" style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                {Math.round(progress)}%
              </p>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

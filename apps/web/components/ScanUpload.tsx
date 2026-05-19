"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { apiUploadCase } from "@/lib/api";
import type { CaseResult } from "@/lib/types";

interface Props {
  onUploaded: (result: CaseResult) => void;
}

export function ScanUpload({ onUploaded }: Props) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [filename, setFilename] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setError(null);
      setUploading(true);
      setFilename(file.name);
      setProgress(0);

      // Animate progress while waiting
      const ticker = setInterval(() => {
        setProgress((p) => Math.min(p + Math.random() * 12, 88));
      }, 300);

      try {
        const result = await apiUploadCase(file) as CaseResult;
        setProgress(100);
        clearInterval(ticker);
        setTimeout(() => {
          setUploading(false);
          onUploaded(result);
        }, 400);
      } catch (e: any) {
        clearInterval(ticker);
        setError(e?.message || "Upload failed");
        setUploading(false);
      }
    },
    [onUploaded],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      "application/octet-stream": [".mha", ".nii", ".gz", ".dcm"],
      "image/*": [".png", ".jpg", ".jpeg"],
    },
  });

  return (
    <div
      {...getRootProps()}
      className="rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all"
      style={{
        borderColor: isDragActive ? "var(--teal)" : uploading ? "var(--teal)80" : "var(--border)",
        background: isDragActive ? "var(--teal-glow)" : "var(--bg-card)",
      }}
    >
      <input {...getInputProps()} />

      <AnimatePresence mode="wait">
        {uploading ? (
          <motion.div
            key="uploading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            {/* MRI scan icon */}
            <div className="mx-auto w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ background: "var(--teal-glow)", border: "1px solid var(--teal)40" }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect x="2" y="4" width="16" height="12" rx="2" stroke="var(--teal)" strokeWidth="1.5"/>
                <circle cx="10" cy="10" r="3" stroke="var(--teal)" strokeWidth="1.2"/>
                <circle cx="10" cy="10" r="1.2" fill="var(--teal)"/>
              </svg>
            </div>
            <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Analysing {filename}
            </div>
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Running inference on federated model v10
            </div>
            <div className="mx-auto max-w-xs">
              <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--bg-base)" }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: "linear-gradient(90deg, var(--teal-dim), var(--teal))" }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                />
              </div>
              <div className="mt-1 text-[11px] text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>
                {Math.round(progress)}%
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            <div className="mx-auto w-12 h-12 rounded-xl flex items-center justify-center transition-colors"
              style={{
                background: isDragActive ? "var(--teal)20" : "var(--bg-card2)",
                border: "1px solid " + (isDragActive ? "var(--teal)" : "var(--border)"),
              }}>
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M11 3v10M7 7l4-4 4 4" stroke={isDragActive ? "var(--teal)" : "var(--text-secondary)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 15v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke={isDragActive ? "var(--teal)" : "var(--text-secondary)"} strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div className="text-sm font-medium" style={{ color: isDragActive ? "var(--teal)" : "var(--text-primary)" }}>
                {isDragActive ? "Drop to analyse" : "Drop an MRI scan or click to browse"}
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                .mha · .nii · .nii.gz · .dcm · .png — up to 50MB
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 text-xs px-3 py-1.5 rounded-lg inline-block"
          style={{ background: "#fb718515", color: "#fb7185", border: "1px solid #fb718530" }}
        >
          {error}
        </motion.div>
      )}
    </div>
  );
}

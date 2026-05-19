"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { apiUploadCase } from "@/lib/api";
import type { CaseResult } from "@/lib/types";

interface Props {
  onUploaded: (result: CaseResult) => void;
}

export function ScanUpload({ onUploaded }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setError(null);
      setUploading(true);
      try {
        const result = (await apiUploadCase(file)) as CaseResult;
        onUploaded(result);
      } catch (e: any) {
        setError(e?.message || "Upload failed");
      } finally {
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
      className={`rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${
        isDragActive
          ? "border-teal-500 bg-teal-50"
          : "border-gray-300 hover:border-gray-400 bg-white"
      }`}
    >
      <input {...getInputProps()} />
      {uploading ? (
        <div className="text-gray-700">
          <div className="text-lg font-medium">Analyzing scan…</div>
          <div className="text-sm text-gray-500 mt-1">
            This usually takes 2–4 seconds
          </div>
          <div className="mt-4 mx-auto h-1 w-48 overflow-hidden rounded bg-gray-200">
            <div className="h-1 bg-teal-500 animate-pulse w-full" />
          </div>
        </div>
      ) : (
        <>
          <div className="text-lg font-medium text-gray-800">
            {isDragActive ? "Drop the MRI scan…" : "Drop an MRI scan or click to browse"}
          </div>
          <div className="text-sm text-gray-500 mt-1">
            .mha, .nii, .nii.gz, .dcm, or .png (up to 50MB)
          </div>
        </>
      )}
      {error && (
        <div className="mt-3 text-sm text-red-700 bg-red-50 inline-block px-3 py-1 rounded">
          {error}
        </div>
      )}
    </div>
  );
}

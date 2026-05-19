"use client";

import { API_URL } from "./api";

function token(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export async function downloadCasePdf(caseId: string): Promise<void> {
  const t = token();
  const res = await fetch(`${API_URL}/cases/${caseId}/pdf`, {
    headers: t ? { Authorization: `Bearer ${t}` } : {},
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `PDF download failed (${res.status})`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fedmri-case-${caseId.slice(0, 8)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

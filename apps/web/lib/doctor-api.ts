import { apiFetch } from "@/lib/api";
import type { CaseResult } from "@/lib/types";

export interface CasesResponse {
  data: CaseResult[];
  total: number;
}

export function getCases(params?: { page?: number; limit?: number }): Promise<CasesResponse> {
  const p = new URLSearchParams();
  if (params?.page !== undefined) p.set("page", String(params.page));
  if (params?.limit !== undefined) p.set("limit", String(params.limit));
  const qs = p.toString() ? `?${p.toString()}` : "";
  return apiFetch<CasesResponse>(`/cases${qs}`);
}

export interface ModelComparison {
  centralized: { f1Macro: number };
  fedprox: { f1Macro: number };
  gap: number;
  privacyCost: { patientsProtected: number };
  totalCases: number;
}

export function getModelComparison(): Promise<ModelComparison> {
  return apiFetch<ModelComparison>("/model/comparison");
}

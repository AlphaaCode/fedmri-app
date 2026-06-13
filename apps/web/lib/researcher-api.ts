import { apiFetch, API_URL } from "./api";

// ─── FL experiment types ──────────────────────────────────────────────────────

export interface FlRoundStat {
  round: number;
  f1: number;
  auc: number;
  accuracy: number;
}

export interface FlExperiment {
  strategy: string;
  alpha: number;
  rounds: number;
  history: FlRoundStat[];
  final: { f1: number; auc: number; accuracy: number };
}

// ─── Overview ─────────────────────────────────────────────────────────────────

export interface ResearcherOverview {
  modelVersion: number;
  strategy: string;
  f1Macro: number;
  accuracy: number;
  totalRounds: number;
  hospitals: number;
  patientsProtected: number;
  rawBytesSent: number;
  phase: "idle" | "local_training" | "aggregating" | "complete";
}

// ─── Training log ─────────────────────────────────────────────────────────────

export interface TrainingRound {
  roundNumber: number;
  strategy: string;
  nodesParticipating: number;
  totalNodes: number;
  gradientNorm: number;
  globalF1After: number;
  status: "active" | "completed";
}

// ─── Model versions ───────────────────────────────────────────────────────────

export interface ModelVersion {
  modelVersion: number;
  flRound: number;
  f1Macro: number;
  accuracy: number;
  strategy: string;
  status: "active" | "archived";
  hash: string;
}

// ─── Datasets ─────────────────────────────────────────────────────────────────

export interface DatasetNode {
  displayName: string;
  flClientId: string;
  totalCases: number;
  specialty: string;
}

export interface DatasetCohort {
  designation: string;
  description: string;
  sourceNode: string;
  modality: string;
  records: number;
  access: string;
}

export interface DatasetsResponse {
  totalRecords: number;
  dataQuality: { annotationCompleteness: number; dicomIntegrity: number };
  nodes: DatasetNode[];
  cohorts: DatasetCohort[];
}

// ─── System logs ──────────────────────────────────────────────────────────────

export interface SystemLogEvent {
  id: string;
  ts: string;
  severity: string;
  nodeId: string;
  eventType: string;
  payload: string;
  latencyMs: number;
  bytes: number;
}

export interface SystemLogsResponse {
  total: number;
  connectedNodes: number;
  totalNodes: number;
  events: SystemLogEvent[];
}

// ─── Topology ─────────────────────────────────────────────────────────────────

export interface TopologyNode {
  id: string;
  displayName: string;
  flClientId: string;
  totalCases: number;
  status: string;
  lastContributionNorm: number;
}

export interface TopologyResponse {
  aggregator: { id: string; label: string; phase: string };
  currentRound: number;
  totalRounds: number;
  uptime: string;
  globalDataVolume: number;
  nodes: TopologyNode[];
}

// ─── API functions ────────────────────────────────────────────────────────────

export function getOverview(): Promise<ResearcherOverview> {
  return apiFetch("/researcher/overview");
}

export function getTrainingLog(
  page = 1,
  limit = 20,
): Promise<{ total: number; rounds: TrainingRound[] }> {
  return apiFetch(`/researcher/training-log?page=${page}&limit=${limit}`);
}

export function getModelVersions(): Promise<{ versions: ModelVersion[] }> {
  return apiFetch("/researcher/model-versions");
}

export function getFlExperiments(): Promise<FlExperiment[]> {
  return apiFetch("/researcher/fl-experiments");
}

export function runFlTest(
  strategy: "fedscrt" | "fedavg",
  rounds: number,
  alpha = 0.5,
): Promise<{ test_id: string; status: string }> {
  return apiFetch("/researcher/fl-test", {
    method: "POST",
    body: JSON.stringify({ strategy, rounds, alpha }),
  });
}

export function getTopology(): Promise<TopologyResponse> {
  return apiFetch("/researcher/topology");
}

// ─── Node audit (topology "Request Audit") ──────────────────────────────────────

export interface NodeAuditCheck {
  label: string;
  detail: string;
  status: "pass" | "warn";
}

export interface NodeAudit {
  found: boolean;
  flClientId?: string;
  auditId?: string;
  generatedAt?: string;
  node?: { displayName: string; flClientId: string; totalCases: number };
  summary?: {
    contributions: number;
    privacyEvents: number;
    bytesTransmitted: number;
    rawDataTransmitted: number;
    avgLocalF1: number;
  };
  checks?: NodeAuditCheck[];
  recentContributions?: {
    round: number;
    samplesUsed: number;
    localF1After: number;
    weightDeltaNorm: number;
    at: string;
  }[];
  verdict?: "COMPLIANT" | "REVIEW";
}

export function getNodeAudit(flClientId: string): Promise<NodeAudit> {
  return apiFetch(`/researcher/node-audit/${encodeURIComponent(flClientId)}`);
}

// Download the signed PDF compliance report for a node.
export async function downloadNodeAuditReport(flClientId: string): Promise<void> {
  const t = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const res = await fetch(
    `${API_URL}/researcher/node-audit/${encodeURIComponent(flClientId)}/report`,
    { headers: t ? { Authorization: `Bearer ${t}` } : {} },
  );
  if (!res.ok) throw new Error(`Report download failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fedmri-compliance-${flClientId}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Network insights feed (Datasets) ───────────────────────────────────────────

export interface InsightEvent {
  id: string;
  kind: "signup" | "case" | "round";
  title: string;
  detail: string;
  ts: string;
  severity: "info" | "success" | "accent";
}

export interface InsightsResponse {
  events: InsightEvent[];
  stats: { hospitals: number; recentSignups: number; recentPatients: number };
}

export function getInsights(limit = 10): Promise<InsightsResponse> {
  return apiFetch(`/researcher/insights?limit=${limit}`);
}

export function getDatasets(): Promise<DatasetsResponse> {
  return apiFetch("/researcher/datasets");
}

export function getSystemLogs(
  opts: { page?: number; limit?: number; severity?: string } = {},
): Promise<SystemLogsResponse> {
  const { page = 1, limit = 50, severity } = opts;
  const q = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(severity ? { severity } : {}),
  });
  return apiFetch(`/researcher/system-logs?${q}`);
}

// Convergence curves + confusion matrix come from the shared /model/* endpoints
// (RESEARCHER role is allowed). ConvergenceChart wants { curves }, ConfusionMatrix
// wants { subtypes, matrix } — both returned directly by these endpoints.
export function getModelHistory(): Promise<{ curves: Record<string, { round: number; f1: number }[]> }> {
  return apiFetch("/model/history");
}

export function getConfusionMatrix(): Promise<{ subtypes: string[]; matrix: Record<string, Record<string, number>> }> {
  return apiFetch("/model/confusion-matrix");
}

export interface PerClassResponse {
  subtypes: string[];
  strategies: string[];
  values: Record<string, Record<string, number>>;
}

export function getPerClass(): Promise<PerClassResponse> {
  return apiFetch("/model/per-class");
}

export interface ModelComparison {
  centralized: { f1Macro: number };
  fedscrt?: { f1Macro: number };
  gap: number;
  privacyCost: { patientsProtected: number; bytesNeverShared?: number };
  totalCases: number;
}

export function getModelComparison(): Promise<ModelComparison> {
  return apiFetch("/model/comparison");
}

import { apiFetch } from "./api";

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
): Promise<{ test_id: string; status: string }> {
  return apiFetch("/researcher/fl-test", {
    method: "POST",
    body: JSON.stringify({ strategy, rounds }),
  });
}

export function getTopology(): Promise<TopologyResponse> {
  return apiFetch("/researcher/topology");
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

// Not yet implemented in backend — callers use Promise.allSettled and handle failures gracefully.
export function getModelHistory(): Promise<unknown> {
  return apiFetch("/researcher/model-history");
}

export function getConfusionMatrix(): Promise<unknown> {
  return apiFetch("/researcher/confusion-matrix");
}

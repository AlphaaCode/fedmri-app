import { apiFetch } from "@/lib/api";

// ─── Overview ────────────────────────────────────────────────────────────────

export interface ResearcherOverview {
  modelVersion: number;
  strategy: string;
  f1Macro: number;
  accuracy: number;
  totalRounds: number;
  hospitals: number;
  patientsProtected: number;
  rawBytesSent: number;
  phase: string;
}

export function getOverview(): Promise<ResearcherOverview> {
  return apiFetch<ResearcherOverview>("/researcher/overview");
}

// ─── Training Log ─────────────────────────────────────────────────────────────

export interface TrainingRound {
  roundNumber: number;
  strategy: string;
  nodesParticipating: number;
  totalNodes: number;
  gradientNorm: number;
  globalF1After: number;
  status: "active" | "completed";
}

export interface TrainingLogResponse {
  total: number;
  rounds: TrainingRound[];
}

export function getTrainingLog(page?: number, limit?: number): Promise<TrainingLogResponse> {
  const params = new URLSearchParams();
  if (page !== undefined) params.set("page", String(page));
  if (limit !== undefined) params.set("limit", String(limit));
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<TrainingLogResponse>(`/researcher/training-log${qs}`);
}

// ─── Model Versions ───────────────────────────────────────────────────────────

export interface ModelVersion {
  modelVersion: number;
  flRound: number;
  f1Macro: number;
  accuracy: number;
  strategy: string;
  status: "active" | "archived";
  hash: string;
}

export interface ModelVersionsResponse {
  versions: ModelVersion[];
}

export function getModelVersions(): Promise<ModelVersionsResponse> {
  return apiFetch<ModelVersionsResponse>("/researcher/model-versions");
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

export function getTopology(): Promise<TopologyResponse> {
  return apiFetch<TopologyResponse>("/researcher/topology");
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
  access: "GRANTED" | "PENDING" | "RESTRICTED";
}

export interface DatasetsResponse {
  totalRecords: number;
  dataQuality: { annotationCompleteness: number; dicomIntegrity: number };
  nodes: DatasetNode[];
  cohorts: DatasetCohort[];
}

export function getDatasets(): Promise<DatasetsResponse> {
  return apiFetch<DatasetsResponse>("/researcher/datasets");
}

// ─── System Logs ──────────────────────────────────────────────────────────────

export interface SystemLogEvent {
  id: string;
  ts: string;
  severity: string;
  nodeId: string;
  eventType: string;
  payload: string;
  latencyMs: number | null;
  bytes: number | null;
}

export interface SystemLogsResponse {
  total: number;
  connectedNodes: number;
  totalNodes: number;
  events: SystemLogEvent[];
}

export function getSystemLogs(params?: {
  page?: number;
  limit?: number;
  severity?: string;
}): Promise<SystemLogsResponse> {
  const p = new URLSearchParams();
  if (params?.page !== undefined) p.set("page", String(params.page));
  if (params?.limit !== undefined) p.set("limit", String(params.limit));
  if (params?.severity) p.set("severity", params.severity);
  const qs = p.toString() ? `?${p.toString()}` : "";
  return apiFetch<SystemLogsResponse>(`/researcher/system-logs${qs}`);
}

// ─── Model History & Confusion Matrix (for chart components) ─────────────────

export function getModelHistory(): Promise<any> {
  return apiFetch("/model/history");
}

export function getConfusionMatrix(): Promise<any> {
  return apiFetch("/model/confusion-matrix");
}

export type UserRole = "DOCTOR" | "PATIENT" | "ADMIN" | "RESEARCHER";
export type Subtype  = "Luminal A" | "Luminal B" | "HER2" | "Triple Negative";
export const SUBTYPES: Subtype[] = ["Luminal A", "Luminal B", "HER2", "Triple Negative"];

export const SUBTYPE_PLAIN: Record<Subtype, string> = {
  "Luminal A":        "Most common — typically slower-growing and hormone-sensitive",
  "Luminal B":        "Hormone-sensitive but tends to grow faster than Luminal A",
  "HER2":             "Tests positive for HER2 protein — targeted therapies available",
  "Triple Negative":  "Negative for three receptors — typically treated with chemotherapy",
};

export const SUBTYPE_CLINICAL: Record<Subtype, string> = {
  "Luminal A":        "ER+/PR+, HER2−, low Ki-67",
  "Luminal B":        "ER+/PR+, HER2±, high Ki-67",
  "HER2":             "ER−/PR−, HER2+",
  "Triple Negative":  "ER−/PR−, HER2−",
};

export interface AuthUser {
  id: string; email: string; name: string; role: UserRole;
  hospitalId?: string; hospitalName?: string;
}

export interface PredictionResult {
  predictedSubtype: Subtype;
  confidence: number;
  probs: [number, number, number, number];
  attentionMap?: number[];
  modelVersion: number;
}

export interface CaseSummary {
  id: string; scope: "HOSPITAL" | "PATIENT";
  predictedSubtype: Subtype; confidence: number;
  status: "PENDING" | "VALIDATED" | "DISPUTED";
  modelVersion: number; createdAt: string;
}

export interface FlRoundSummary {
  id: string; roundNumber: number; strategy: "FEDAVG" | "FEDPROX";
  globalF1Before: number; globalF1After: number;
  durationSeconds: number; modelVersion: number;
  triggeredBy: "DOCTOR_UPLOAD" | "DISPUTE" | "SCHEDULED"; createdAt: string;
}

export interface PrivacyAuditEntry {
  id: string; eventType: string;
  bytesTransmitted: number; rawDataTransmitted: 0; createdAt: string;
}

// WebSocket payloads
export interface WsFlRoundStarted  { roundId: string; roundNumber: number; strategy: string; }
export interface WsFlRoundProgress { roundId: string; hospitalId: string; phase: string; epochsDone: number; }
export interface WsFlRoundComplete { roundId: string; globalF1After: number; f1Delta: number; modelVersion: number; }
export interface WsInferenceDone   { caseId: string; prediction: PredictionResult; }
export interface WsChatToken       { token: string; done: boolean; }

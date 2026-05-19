export type Subtype = "Luminal A" | "Luminal B" | "HER2" | "Triple Negative";

export const SUBTYPES: Subtype[] = [
  "Luminal A",
  "Luminal B",
  "HER2",
  "Triple Negative",
];

export const SUBTYPE_PLAIN: Record<Subtype, string> = {
  "Luminal A": "Most common — typically slower-growing and hormone-sensitive",
  "Luminal B": "Hormone-sensitive but tends to grow faster than Luminal A",
  "HER2": "Tests positive for HER2 protein — targeted therapies available",
  "Triple Negative": "Negative for three receptors — typically treated with chemotherapy",
};

export const SUBTYPE_COLOR: Record<Subtype, string> = {
  "Luminal A": "#14b8a6",      // teal
  "Luminal B": "#3b82f6",      // blue
  "HER2": "#f59e0b",            // amber
  "Triple Negative": "#fb7185", // coral
};

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "DOCTOR" | "PATIENT" | "ADMIN";
  hospitalId?: string;
}

export interface CaseResult {
  id: string;
  scope: "HOSPITAL" | "PATIENT";
  predictedSubtype: Subtype;
  confidence: number;
  probs: number[];
  modelVersion: number;
  hospitalId?: string | null;
  userId: string;
  createdAt: string;
}

export interface WsRoundStarted {
  roundId: string;
  hospitalId: string;
  caseId: string;
}

export interface WsRoundProgress {
  roundId: string;
  hospitalId: string;
  phase: "local_training" | "aggregating" | "complete" | string;
  epochsDone: number;
}

export interface WsRoundComplete {
  roundId: string;
  globalF1After: number;
  f1Delta: number;
  modelVersion: number;
}

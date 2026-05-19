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
  "Luminal A": "#2dd4bf",
  "Luminal B": "#60a5fa",
  "HER2": "#f59e0b",
  "Triple Negative": "#fb7185",
};

export interface MedProtocol {
  line: "First-line" | "Second-line" | "Adjuvant";
  agents: string[];
  note: string;
}

export const SUBTYPE_MEDS: Record<Subtype, { profile: string; protocols: MedProtocol[] }> = {
  "Luminal A": {
    profile: "ER+/PR+, HER2−, low Ki-67",
    protocols: [
      { line: "First-line", agents: ["Tamoxifen", "Aromatase inhibitors (letrozole, anastrozole)"], note: "Hormone therapy is primary treatment. Chemo often unnecessary." },
      { line: "Adjuvant", agents: ["OFS + AI (premenopausal)", "CDK4/6 inhibitors (high-risk cases)"], note: "Ribociclib or palbociclib for node-positive patients." },
    ],
  },
  "Luminal B": {
    profile: "ER+/PR+, HER2±, high Ki-67",
    protocols: [
      { line: "First-line", agents: ["Tamoxifen or AI + CDK4/6 inhibitor"], note: "Higher proliferation rate warrants combined approach." },
      { line: "First-line", agents: ["AC-T or TC chemotherapy"], note: "Chemotherapy recommended if high genomic risk score." },
      { line: "Adjuvant", agents: ["Palbociclib", "Ribociclib", "Abemaciclib"], note: "CDK4/6 inhibitors significantly improve PFS." },
    ],
  },
  "HER2": {
    profile: "ER−/PR−, HER2+",
    protocols: [
      { line: "First-line", agents: ["Trastuzumab (Herceptin) + Pertuzumab + Docetaxel"], note: "HER2-targeted dual blockade is standard of care." },
      { line: "Adjuvant", agents: ["T-DM1 (ado-trastuzumab emtansine)"], note: "For residual disease post-neoadjuvant therapy." },
      { line: "Second-line", agents: ["Trastuzumab deruxtecan (T-DXd)", "Lapatinib + capecitabine"], note: "For progression on first-line HER2 therapy." },
    ],
  },
  "Triple Negative": {
    profile: "ER−/PR−, HER2−",
    protocols: [
      { line: "First-line", agents: ["Pembrolizumab + nab-paclitaxel/carboplatin"], note: "Immunotherapy + chemo for PD-L1+ tumors (KEYNOTE-522)." },
      { line: "First-line", agents: ["AC-T (doxorubicin + cyclophosphamide + paclitaxel)"], note: "Standard chemo backbone for TNBC." },
      { line: "Adjuvant", agents: ["Olaparib (BRCA1/2 mutated)", "Capecitabine (residual disease)"], note: "PARP inhibitor for germline BRCA carriers." },
    ],
  },
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

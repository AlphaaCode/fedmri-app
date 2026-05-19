"use client";

import { create } from "zustand";
import type {
  WsRoundStarted,
  WsRoundProgress,
  WsRoundComplete,
} from "./types";

export type FlPhase = "idle" | "local_training" | "aggregating" | "complete";

interface FlState {
  phase: FlPhase;
  roundId: string | null;
  activeHospitalId: string | null;
  modelVersion: number | null;
  lastF1Delta: number | null;
  lastF1After: number | null;
  lastUpdateSource: "fl" | "al" | null;
  onRoundStarted: (p: WsRoundStarted) => void;
  onProgress: (p: WsRoundProgress) => void;
  onRoundComplete: (p: WsRoundComplete) => void;
  onModelUpdated: (p: { modelVersion: number; f1Delta: number; f1Macro: number; correctedSubtype: string }) => void;
  reset: () => void;
}

export const useFlStore = create<FlState>((set) => ({
  phase: "idle",
  roundId: null,
  activeHospitalId: null,
  modelVersion: null,
  lastF1Delta: null,
  lastF1After: null,
  lastUpdateSource: null,
  onRoundStarted: (p) =>
    set({
      phase: "local_training",
      roundId: p.roundId,
      activeHospitalId: p.hospitalId,
      lastUpdateSource: "fl",
    }),
  onProgress: (p) =>
    set({
      phase:
        p.phase === "aggregating"
          ? "aggregating"
          : p.phase === "complete"
            ? "complete"
            : "local_training",
      activeHospitalId: p.hospitalId,
    }),
  onRoundComplete: (p) =>
    set({
      phase: "complete",
      lastF1After: p.globalF1After,
      lastF1Delta: p.f1Delta,
      modelVersion: p.modelVersion,
      activeHospitalId: null,
      lastUpdateSource: "fl",
    }),
  onModelUpdated: (p) =>
    set({
      modelVersion: p.modelVersion,
      lastF1Delta: p.f1Delta,
      lastF1After: p.f1Macro,
      lastUpdateSource: "al",
      phase: "complete",
    }),
  reset: () =>
    set({
      phase: "idle",
      roundId: null,
      activeHospitalId: null,
    }),
}));

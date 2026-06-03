import { MutableRefObject } from "react";

export type Phase =
  | "BRAIN_SPIN"
  | "FADE_TO_MRI"
  | "MRI_SCAN"
  | "FADE_TO_BRAIN";

export const PHASE_DURATION: Record<Phase, number> = {
  BRAIN_SPIN:    5,
  FADE_TO_MRI:   1,
  MRI_SCAN:      6,
  FADE_TO_BRAIN: 1,
};

export const NEXT_PHASE: Record<Phase, Phase> = {
  BRAIN_SPIN:    "FADE_TO_MRI",
  FADE_TO_MRI:   "MRI_SCAN",
  MRI_SCAN:      "FADE_TO_BRAIN",
  FADE_TO_BRAIN: "BRAIN_SPIN",
};

/** Shared animation state — written by SceneController, read by models */
export interface SceneRefs {
  phaseRef:      MutableRefObject<Phase>;
  elapsedRef:    MutableRefObject<number>;
  brainOpacRef:  MutableRefObject<number>;
  mriOpacRef:    MutableRefObject<number>;
  mriReadyRef:   MutableRefObject<boolean>;
}

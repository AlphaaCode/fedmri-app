"use client";

import { useFrame } from "@react-three/fiber";
import { SceneRefs, Phase, PHASE_DURATION, NEXT_PHASE } from "./types";

interface Props {
  refs: SceneRefs;
}

export function SceneController({ refs }: Props) {
  useFrame((_, delta) => {
    const { phaseRef, elapsedRef, brainOpacRef, mriOpacRef, mriReadyRef } = refs;

    elapsedRef.current += delta;
    const phase = phaseRef.current;
    const dur = PHASE_DURATION[phase];
    const t = Math.min(elapsedRef.current / dur, 1);

    if (phase === "BRAIN_SPIN") {
      brainOpacRef.current = 1;
      mriOpacRef.current = 0;
    } else if (phase === "FADE_TO_MRI") {
      brainOpacRef.current = 1 - t;
      mriOpacRef.current = mriReadyRef.current ? t : 0;
    } else if (phase === "MRI_SCAN") {
      brainOpacRef.current = 0;
      mriOpacRef.current = mriReadyRef.current ? 1 : 0;
    } else if (phase === "FADE_TO_BRAIN") {
      brainOpacRef.current = t;
      mriOpacRef.current = mriReadyRef.current ? 1 - t : 0;
    }

    if (elapsedRef.current >= dur) {
      const next: Phase = NEXT_PHASE[phase];
      if (
        (next === "FADE_TO_MRI" || next === "MRI_SCAN") &&
        !mriReadyRef.current
      ) {
        phaseRef.current = "BRAIN_SPIN";
      } else {
        phaseRef.current = next;
      }
      elapsedRef.current = 0;
    }
  });

  return null;
}

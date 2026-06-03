"use client";

import { useRef, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { SceneLights } from "./SceneLights";
import { BrainModel } from "./BrainModel";
import { MriModel } from "./MriModel";
import { SceneController } from "./SceneController";
import type { SceneRefs, Phase } from "./types";

function ShimmerFallback() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div
        className="w-32 h-32 rounded-full animate-pulse"
        style={{
          background:
            "radial-gradient(circle, rgba(45,212,191,0.15) 0%, transparent 70%)",
          border: "1px solid rgba(45,212,191,0.2)",
        }}
      />
    </div>
  );
}

export function LoginScene3D() {
  const phaseRef    = useRef<Phase>("BRAIN_SPIN");
  const elapsedRef  = useRef(0);
  const brainOpacRef = useRef(1);
  const mriOpacRef  = useRef(0);
  const mriReadyRef = useRef(false);

  const sceneRefs: SceneRefs = {
    phaseRef,
    elapsedRef,
    brainOpacRef,
    mriOpacRef,
    mriReadyRef,
  };

  return (
    <div className="relative w-full h-full">
      <Suspense fallback={<ShimmerFallback />}>
        <Canvas
          camera={{ fov: 35, position: [0, 0, 6] }}
          gl={{ antialias: true, alpha: true } as THREE.WebGLRendererParameters}
          style={{ background: "transparent" }}
        >
          <SceneLights />
          <SceneController refs={sceneRefs} />
          <Suspense fallback={null}>
            <BrainModel refs={sceneRefs} />
          </Suspense>
          <Suspense fallback={null}>
            <MriModel refs={sceneRefs} />
          </Suspense>
        </Canvas>
      </Suspense>
    </div>
  );
}

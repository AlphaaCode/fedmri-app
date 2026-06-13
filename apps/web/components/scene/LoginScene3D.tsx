"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { SceneLights } from "./SceneLights";
import { BrainModel } from "./BrainModel";

function ShimmerFallback() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div
        className="w-36 h-36 rounded-full animate-pulse"
        style={{
          background: "radial-gradient(circle, rgba(45,212,191,0.12) 0%, transparent 70%)",
          border: "1px solid rgba(45,212,191,0.15)",
        }}
      />
    </div>
  );
}

export function LoginScene3D() {
  return (
    <div className="relative w-full h-full">
      <Suspense fallback={<ShimmerFallback />}>
        <Canvas
          camera={{ fov: 35, position: [0, 0, 6] }}
          gl={{ antialias: true, alpha: true }}
          style={{ background: "transparent" }}
        >
          <SceneLights />

          {/* OrbitControls: auto-spins endlessly; user can drag to explore 360° */}
          <OrbitControls
            enableZoom={false}
            enablePan={false}
            autoRotate
            autoRotateSpeed={8}
            minPolarAngle={Math.PI * 0.25}
            maxPolarAngle={Math.PI * 0.75}
          />

          <Suspense fallback={null}>
            <BrainModel />
          </Suspense>
        </Canvas>
      </Suspense>
    </div>
  );
}

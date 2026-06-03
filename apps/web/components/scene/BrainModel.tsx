/// <reference types="@react-three/fiber" />
"use client";

import { useEffect, useRef } from "react";
import { useLoader, useFrame } from "@react-three/fiber";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import * as THREE from "three";

// 1.5 × 1.2 = 1.8 — slightly bigger than previous reference
const TARGET_SIZE = 1.8;

export function BrainModel() {
  // @ts-ignore
  const fbx = useLoader(FBXLoader, "/3d/brain/stylizedhumanbrain.fbx");
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    // Guard: useLoader returns same cached object; React Strict Mode calls effect twice.
    // Second call would re-measure the already-scaled bbox → scale resets to 1.
    if (fbx.userData.fedmriScaled) return;
    fbx.userData.fedmriScaled = true;

    fbx.traverse((child: THREE.Object3D) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = false;

      // Keep all original textures/maps; just add teal emissive glow + boost metal
      const enhance = (m: THREE.Material) => {
        const c = m.clone();
        const std = c as THREE.MeshStandardMaterial;
        if (std.emissive !== undefined) {
          std.emissive = new THREE.Color("#2dd4bf");
          std.emissiveIntensity = 0.2;
          std.roughness = Math.min(std.roughness ?? 0.5, 0.55);
          std.metalness = Math.max(std.metalness ?? 0, 0.25);
        }
        return c;
      };

      child.material = Array.isArray(child.material)
        ? child.material.map(enhance)
        : enhance(child.material);
    });

    // Scale to TARGET_SIZE based on native (unscaled) bounding box
    const box = new THREE.Box3().setFromObject(fbx);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) fbx.scale.setScalar(TARGET_SIZE / maxDim);

    // Centre on origin after scaling
    box.setFromObject(fbx);
    fbx.position.sub(box.getCenter(new THREE.Vector3()));
  }, [fbx]);

  // Gentle vertical float — OrbitControls handles the rotation via autoRotate
  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.position.y = Math.sin(Date.now() * 0.0005) * 0.05;
  });

  return (
    // @ts-ignore
    <group ref={groupRef}>
      <primitive object={fbx} />
    </group>
  );
}

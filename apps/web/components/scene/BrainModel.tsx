/// <reference types="@react-three/fiber" />
"use client";

import { useEffect, useRef } from "react";
import { useLoader, useFrame } from "@react-three/fiber";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import * as THREE from "three";
import { SceneRefs } from "./types";

// 2× the reference 0.75 unit size that fit the canvas nicely
const TARGET_SIZE = 1.5;

interface Props { refs: SceneRefs; }

export function BrainModel({ refs }: Props) {
  // @ts-ignore
  const fbx = useLoader(FBXLoader, "/3d/brain/stylizedhumanbrain.fbx");
  const groupRef = useRef<THREE.Group>(null);
  const clonedMats = useRef<THREE.Material[]>([]);

  useEffect(() => {
    // CRITICAL: useLoader returns the SAME cached object on every mount.
    // React Strict Mode (dev) calls useEffect twice. Without this guard the
    // second invocation re-measures the already-scaled bbox → scale resets to 1
    // → model renders at full native size (fills entire canvas).
    if (fbx.userData.fedmriScaled) {
      clonedMats.current = [];
      fbx.traverse((child: THREE.Object3D) => {
        if (!(child instanceof THREE.Mesh)) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        (mats as THREE.Material[]).forEach((m) => clonedMats.current.push(m));
      });
      return;
    }
    fbx.userData.fedmriScaled = true;
    clonedMats.current = [];

    fbx.traverse((child: THREE.Object3D) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = false;

      const clone = (m: THREE.Material) => {
        const c = m.clone();
        (c as any).transparent = true;
        (c as any).opacity = 1;
        if ((c as THREE.MeshStandardMaterial).emissive !== undefined) {
          const std = c as THREE.MeshStandardMaterial;
          std.emissive = new THREE.Color("#2dd4bf");
          std.emissiveIntensity = 0.18;
          std.roughness = Math.min((std.roughness ?? 0.5), 0.6);
          std.metalness = Math.max((std.metalness ?? 0), 0.2);
        }
        clonedMats.current.push(c);
        return c;
      };

      if (Array.isArray(child.material)) {
        child.material = child.material.map(clone);
      } else {
        child.material = clone(child.material);
      }
    });

    // Measure BEFORE scaling (native bbox)
    const box = new THREE.Box3().setFromObject(fbx);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) fbx.scale.setScalar(TARGET_SIZE / maxDim);

    // Centre after scaling
    box.setFromObject(fbx);
    fbx.position.sub(box.getCenter(new THREE.Vector3()));
  }, [fbx]);

  useFrame(() => {
    if (!groupRef.current) return;
    const { phaseRef, brainOpacRef } = refs;
    const phase = phaseRef.current;
    if (phase === "BRAIN_SPIN") {
      groupRef.current.rotation.y += 0.005;
      groupRef.current.position.y = Math.sin(Date.now() * 0.0005) * 0.05;
    }
    const opac = brainOpacRef.current;
    const t = Date.now() * 0.002;
    clonedMats.current.forEach((m) => {
      (m as any).opacity = opac;
      if ((m as THREE.MeshStandardMaterial).emissiveIntensity !== undefined && phase === "BRAIN_SPIN") {
        (m as THREE.MeshStandardMaterial).emissiveIntensity = 0.14 + Math.sin(t) * 0.08;
      }
    });
  });

  return (
    // @ts-ignore
    <group ref={groupRef}>
      <primitive object={fbx} />
    </group>
  );
}

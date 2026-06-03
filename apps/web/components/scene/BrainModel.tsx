/// <reference types="@react-three/fiber" />
"use client";

import { useEffect, useRef } from "react";
import { useLoader, useFrame } from "@react-three/fiber";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import * as THREE from "three";
import { SceneRefs } from "./types";

interface Props {
  refs: SceneRefs;
}

export function BrainModel({ refs }: Props) {
  // @ts-ignore
  const fbx = useLoader(FBXLoader, "/3d/brain/stylizedhumanbrain.fbx");
  const groupRef = useRef<THREE.Group>(null);
  // Collect cloned materials for opacity control
  const clonedMats = useRef<THREE.Material[]>([]);

  useEffect(() => {
    clonedMats.current = [];

    fbx.traverse((child: THREE.Object3D) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = false;

      // Clone material(s) so we own opacity without touching shared instances
      const clone = (m: THREE.Material) => {
        const c = m.clone();
        (c as any).transparent = true;
        (c as any).opacity = 1;
        // Keep all original maps/colors — just add a subtle teal emissive boost
        if ((c as THREE.MeshStandardMaterial).emissive !== undefined) {
          const std = c as THREE.MeshStandardMaterial;
          // Blend original emissive with teal
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

    // Scale to fit: target 1.4 world units across longest axis
    const box = new THREE.Box3().setFromObject(fbx);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) fbx.scale.setScalar(0.75 / maxDim);

    // Centre the model on the origin
    box.setFromObject(fbx);
    const centre = box.getCenter(new THREE.Vector3());
    fbx.position.sub(centre);
  }, [fbx]);

  useFrame(() => {
    if (!groupRef.current) return;
    const { phaseRef, brainOpacRef } = refs;
    const phase = phaseRef.current;

    if (phase === "BRAIN_SPIN") {
      groupRef.current.rotation.y += 0.005;
      groupRef.current.position.y = Math.sin(Date.now() * 0.0005) * 0.06;
    }

    const opac = brainOpacRef.current;
    const t = Date.now() * 0.002;
    clonedMats.current.forEach((m) => {
      (m as any).opacity = opac;
      // Pulse emissive on spin phase
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

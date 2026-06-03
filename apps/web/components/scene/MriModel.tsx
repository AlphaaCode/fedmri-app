/// <reference types="@react-three/fiber" />
"use client";

import { useEffect, useRef } from "react";
import { useLoader, useFrame } from "@react-three/fiber";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import * as THREE from "three";
import { SceneRefs, PHASE_DURATION } from "./types";

interface Props {
  refs: SceneRefs;
}

export function MriModel({ refs }: Props) {
  // Load with resource path so FBXLoader finds textures at /3d/mri/textures/
  // @ts-ignore
  const fbx = useLoader(FBXLoader, "/3d/mri/IRM.fbx", (loader: any) => {
    loader.setResourcePath("/3d/mri/textures/");
  });
  const groupRef = useRef<THREE.Group>(null);
  const ringMeshes = useRef<THREE.Mesh[]>([]);
  const bedMeshes = useRef<THREE.Mesh[]>([]);
  const opacMats = useRef<THREE.Material[]>([]);
  const bedOriginZ = useRef<number>(0);

  useEffect(() => {
    opacMats.current = [];
    ringMeshes.current = [];
    bedMeshes.current = [];

    // Guard: same cached-object + Strict Mode double-invocation fix
    if (!fbx.userData.fedmriScaled) {
      fbx.userData.fedmriScaled = true;

      // Measure BEFORE scaling (native bbox)
      const box = new THREE.Box3().setFromObject(fbx);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim > 0) fbx.scale.setScalar(1.6 / maxDim);

      // Centre after scaling
      box.setFromObject(fbx);
      const centre = box.getCenter(new THREE.Vector3());
      fbx.position.set(-centre.x, -centre.y, -centre.z);
    }

    fbx.traverse((child: THREE.Object3D) => {
      if (!(child instanceof THREE.Mesh)) return;
      const name = child.name.toLowerCase();

      // Clone materials to own opacity — keep all original PBR textures/metals
      const cloneWithTransparency = (m: THREE.Material) => {
        const c = m.clone();
        (c as any).transparent = true;
        (c as any).opacity = 0;
        return c;
      };

      if (Array.isArray(child.material)) {
        child.material = child.material.map(cloneWithTransparency);
        child.material.forEach((m: THREE.Material) => opacMats.current.push(m));
      } else {
        child.material = cloneWithTransparency(child.material);
        opacMats.current.push(child.material);
      }

      if (name.includes("ring")) ringMeshes.current.push(child);
      if (name.includes("bed") || name.includes("matelas")) {
        bedMeshes.current.push(child);
        if (bedOriginZ.current === 0) bedOriginZ.current = child.position.z;
      }
    });

    refs.mriReadyRef.current = true;
  }, [fbx, refs]);

  useFrame(() => {
    if (!groupRef.current) return;
    const { phaseRef, elapsedRef, mriOpacRef } = refs;
    const phase = phaseRef.current;
    const t = Math.min(elapsedRef.current / PHASE_DURATION[phase], 1);

    const opac = mriOpacRef.current;
    opacMats.current.forEach((m) => { (m as any).opacity = opac; });

    if (phase === "MRI_SCAN") {
      const slideRange = 2.5;
      const bedZ = bedOriginZ.current + THREE.MathUtils.lerp(-slideRange, slideRange, t);
      bedMeshes.current.forEach((m) => { m.position.z = bedZ; });

      const emitIntensity = Math.sin(t * Math.PI) * 2.0;
      ringMeshes.current.forEach((m) => {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        (mats as THREE.MeshStandardMaterial[]).forEach((mat) => {
          if (mat.emissiveIntensity !== undefined) mat.emissiveIntensity = emitIntensity;
        });
      });
    } else {
      bedMeshes.current.forEach((m) => { m.position.z = bedOriginZ.current; });
    }
  });

  return (
    // @ts-ignore
    <group ref={groupRef} rotation={[0, Math.PI * 0.15, 0]}>
      <primitive object={fbx} />
    </group>
  );
}

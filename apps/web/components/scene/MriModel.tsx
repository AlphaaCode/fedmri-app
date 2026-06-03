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
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore – FBXLoader type signature diverges from LoaderProto<unknown>
  const fbx = useLoader(FBXLoader, "/3d/mri/IRM.fbx");
  const groupRef = useRef<THREE.Group>(null);
  const ringMeshes = useRef<THREE.Mesh[]>([]);
  const bedMeshes = useRef<THREE.Mesh[]>([]);
  const opacMats = useRef<THREE.MeshStandardMaterial[]>([]);
  const bedOriginZ = useRef<number>(0);

  useEffect(() => {
    const box = new THREE.Box3().setFromObject(fbx);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      fbx.scale.setScalar(3.5 / maxDim);
    }

    fbx.traverse((child: THREE.Object3D) => {
      if (!(child instanceof THREE.Mesh)) return;
      const name = child.name.toLowerCase();

      if (Array.isArray(child.material)) {
        child.material = child.material.map((m) => m.clone());
      } else {
        child.material = child.material.clone();
      }

      const mats: THREE.MeshStandardMaterial[] = (
        Array.isArray(child.material) ? child.material : [child.material]
      ) as THREE.MeshStandardMaterial[];

      mats.forEach((m) => {
        m.transparent = true;
        opacMats.current.push(m);
      });

      if (name.includes("ring")) {
        ringMeshes.current.push(child);
      }
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
    opacMats.current.forEach((m) => { m.opacity = opac; });

    if (phase === "MRI_SCAN") {
      const slideRange = 3;
      const bedZ = bedOriginZ.current + THREE.MathUtils.lerp(-slideRange, slideRange, t);
      bedMeshes.current.forEach((m) => { m.position.z = bedZ; });

      const emitIntensity = Math.sin(t * Math.PI) * 2.5;
      ringMeshes.current.forEach((m) => {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        (mats as THREE.MeshStandardMaterial[]).forEach((mat) => {
          mat.emissiveIntensity = emitIntensity;
        });
      });
    } else {
      bedMeshes.current.forEach((m) => { m.position.z = bedOriginZ.current; });
    }
  });

  return (
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore – duplicate @types/three versions cause Group ref mismatch
    <group ref={groupRef} position={[0, -0.5, 0]} rotation={[0, Math.PI * 0.25, 0]}>
      <primitive object={fbx} />
    </group>
  );
}

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

export function BrainModel({ refs }: Props) {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore – FBXLoader type signature diverges from LoaderProto<unknown>
  const fbx = useLoader(FBXLoader, "/3d/brain/stylizedhumanbrain.fbx");
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshStandardMaterial | null>(null);

  useEffect(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#1a3a38"),
      emissive: new THREE.Color("#2dd4bf"),
      emissiveIntensity: 0.3,
      roughness: 0.55,
      metalness: 0.25,
    });
    matRef.current = mat;

    fbx.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh) {
        child.material = mat;
        child.castShadow = false;
      }
    });

    const box = new THREE.Box3().setFromObject(fbx);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      fbx.scale.setScalar(1.6 / maxDim);
    }

    return () => { mat.dispose(); };
  }, [fbx]);

  useFrame(() => {
    if (!groupRef.current || !matRef.current) return;

    const { phaseRef, elapsedRef, brainOpacRef } = refs;
    const phase = phaseRef.current;

    if (phase === "BRAIN_SPIN") {
      groupRef.current.rotation.y += 0.006;
      groupRef.current.position.y = Math.sin(Date.now() * 0.0006) * 0.08;
    }

    const opac = brainOpacRef.current;
    const mat = matRef.current;
    mat.transparent = opac < 1;
    mat.opacity = opac;

    if (phase === "BRAIN_SPIN") {
      mat.emissiveIntensity = 0.25 + Math.sin(Date.now() * 0.002) * 0.12;
    }
  });

  return (
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore – duplicate @types/three versions cause Group ref mismatch
    <group ref={groupRef} position={[0, 0, 0]}>
      <primitive object={fbx} />
    </group>
  );
}

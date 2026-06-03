/// <reference types="@react-three/fiber" />

export function SceneLights() {
  return (
    <>
      <ambientLight intensity={0.25} />
      <directionalLight position={[5, 8, 5]} intensity={1.2} color="#ffffff" castShadow={false} />
      <pointLight position={[0, 2, 4]} intensity={3} color="#2dd4bf" distance={12} />
      <pointLight position={[0, -3, -6]} intensity={0.8} color="#0d4444" distance={14} />
    </>
  );
}

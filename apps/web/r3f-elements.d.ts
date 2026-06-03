/**
 * React 19 + @react-three/fiber v8 compatibility shim.
 *
 * R3F v8 augments the old global `JSX.IntrinsicElements` namespace, but
 * React 19 (with "jsx": "react-jsx") resolves JSX through `React.JSX`.
 * This file bridges the gap so that R3F elements (group, primitive, mesh,
 * ambientLight, etc.) are recognised by the TypeScript JSX type checker.
 */
import type { ThreeElements } from "@react-three/fiber";

declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements extends ThreeElements {}
    }
  }
}

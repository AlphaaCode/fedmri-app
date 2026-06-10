/** Fixed ambient gradient glows behind all content. Pure CSS, transform-only
 *  blob drift + a slow hue breathe on the whole layer. Pair with translucent
 *  .glass surfaces so the color reads through. */
export function AuroraBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={{ animation: "aurora-hue 30s ease-in-out infinite" }}
    >
      <div
        className="absolute rounded-full"
        style={{
          width: 560, height: 560, top: -160, right: -120,
          background: "radial-gradient(circle, var(--aurora-teal), transparent 70%)",
          filter: "blur(60px)",
          animation: "aurora-drift-1 20s ease-in-out infinite",
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: 480, height: 480, bottom: -140, left: 80,
          background: "radial-gradient(circle, var(--aurora-blue), transparent 70%)",
          filter: "blur(60px)",
          animation: "aurora-drift-2 26s ease-in-out infinite",
        }}
      />
      {/* third roaming blob — adds depth + constant subtle motion */}
      <div
        className="absolute rounded-full"
        style={{
          width: 360, height: 360, top: "40%", left: "45%",
          background: "radial-gradient(circle, var(--aurora-teal), transparent 70%)",
          filter: "blur(70px)",
          opacity: 0.7,
          animation: "aurora-drift-1 34s ease-in-out infinite reverse",
        }}
      />
    </div>
  );
}

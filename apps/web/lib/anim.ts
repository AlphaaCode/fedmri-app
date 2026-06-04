import type { Variants, Transition } from "framer-motion";

// Smooth ease-out curve (easeOutExpo-ish) used across the app for animate-in.
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const springSoft: Transition = { type: "spring", stiffness: 220, damping: 26, mass: 0.9 };

// ── Single-element entrances ──────────────────────────────────────────────────
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT } },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.4, ease: EASE_OUT } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT } },
};

// ── Parent/child orchestration (stagger) ──────────────────────────────────────
// Put `staggerContainer` on a parent with initial="hidden" animate="show", and
// `staggerItem` (or fadeUp) on each child — children cascade in automatically.
export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.07, delayChildren: 0.04 },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT } },
};

// Convenience props for an on-mount entrance without writing variants inline.
export const animateInProps = {
  initial: "hidden" as const,
  animate: "show" as const,
};

// Reveal-on-scroll props (animates the first time it enters the viewport).
export const revealProps = {
  initial: "hidden" as const,
  whileInView: "show" as const,
  viewport: { once: true, margin: "-60px" },
};

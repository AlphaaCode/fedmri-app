"use client";
import { motion } from "framer-motion";
import { ReactNode } from "react";

/** Wraps children in a fade-up animation. Use `delay` to stagger siblings. */
export function FadeIn({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut", delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Stagger a list of items — each child gets an increasing delay. */
export function StaggerList({ children, baseDelay = 0, step = 0.06, className }: {
  children: ReactNode[];
  baseDelay?: number;
  step?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      {children.map((child, i) => (
        <FadeIn key={i} delay={baseDelay + i * step}>{child}</FadeIn>
      ))}
    </div>
  );
}

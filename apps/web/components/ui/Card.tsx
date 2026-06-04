"use client";

import { CSSProperties, ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { fadeIn, revealProps } from "@/lib/anim";

export function Card({ children, className, style, animate = true }: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  animate?: boolean;
}) {
  // Opacity-only entrance: the `.card-hover` class owns the transform (hover
  // lift), so animating `y` here would leave an inline transform that overrides
  // the hover. Fade keeps both working.
  if (!animate) {
    return (
      <div
        className={cn("card-hover rounded-xl border p-4", className)}
        style={{ background: "var(--bg-card)", borderColor: "var(--border)", ...style }}
      >
        {children}
      </div>
    );
  }
  return (
    <motion.div
      variants={fadeIn}
      {...revealProps}
      className={cn("card-hover rounded-xl border p-4", className)}
      style={{ background: "var(--bg-card)", borderColor: "var(--border)", ...style }}
    >
      {children}
    </motion.div>
  );
}

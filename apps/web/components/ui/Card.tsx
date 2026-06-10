"use client";

import { CSSProperties, ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { fadeIn, revealProps } from "@/lib/anim";
import { spotlightHandlers } from "@/lib/spotlight";

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
        className={cn("glass spotlight card-hover relative rounded-xl border p-4", className)}
        style={{ borderColor: "var(--border)", ...style }}
        {...spotlightHandlers}
      >
        {children}
      </div>
    );
  }
  return (
    <motion.div
      variants={fadeIn}
      {...revealProps}
      className={cn("glass spotlight card-hover relative rounded-xl border p-4", className)}
      style={{ borderColor: "var(--border)", ...style }}
      {...spotlightHandlers}
    >
      {children}
    </motion.div>
  );
}

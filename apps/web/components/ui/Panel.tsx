"use client";

import { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { fadeUp, revealProps } from "@/lib/anim";

export function Panel({ title, subtitle, action, children, className, animate = true }: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  animate?: boolean;
}) {
  const header = (title || subtitle || action) && (
    <div className="flex items-start justify-between mb-3">
      <div>
        {title && <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{title}</div>}
        {subtitle && <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{subtitle}</div>}
      </div>
      {action}
    </div>
  );

  if (!animate) {
    return (
      <div className={cn("rounded-xl border p-4", className)} style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        {header}
        {children}
      </div>
    );
  }
  return (
    <motion.div
      variants={fadeUp}
      {...revealProps}
      className={cn("rounded-xl border p-4", className)}
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      {header}
      {children}
    </motion.div>
  );
}

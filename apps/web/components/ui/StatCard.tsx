"use client";

import { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { AnimatedNumber } from "./AnimatedNumber";
import { spotlightHandlers } from "@/lib/spotlight";

export function StatCard({ label, value, hint, accent = "var(--text-primary)", className, delay = 0, suffix = "" }: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: string;
  className?: string;
  delay?: number;
  suffix?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut", delay }}
      className={cn("glass spotlight card-hover edge-sweep relative overflow-hidden rounded-xl border p-4", className)}
      style={{ borderColor: "var(--border)" }}
      {...spotlightHandlers}
    >
      <div className="text-[11px] uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1" style={{ color: accent }}>
        {typeof value === "number"
          ? <AnimatedNumber value={value} decimals={Number.isInteger(value) ? 0 : 2} suffix={suffix} />
          : value}
      </div>
      {hint && <div className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>{hint}</div>}
    </motion.div>
  );
}

import { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

export function StatCard({ label, value, hint, accent = "var(--text-primary)", className }: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: string;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={cn("rounded-xl border p-4", className)}
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div className="text-[11px] uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1" style={{ color: accent }}>{value}</div>
      {hint && <div className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>{hint}</div>}
    </motion.div>
  );
}

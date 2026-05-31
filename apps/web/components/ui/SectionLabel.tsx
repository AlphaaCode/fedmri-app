import { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("text-xs uppercase tracking-widest", className)} style={{ color: "var(--text-secondary)" }}>
      {children}
    </div>
  );
}

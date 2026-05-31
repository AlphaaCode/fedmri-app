import { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({ children, className, style }: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn("rounded-xl border p-4", className)}
      style={{ background: "var(--bg-card)", borderColor: "var(--border)", ...style }}
    >
      {children}
    </div>
  );
}

import { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Panel({ title, subtitle, action, children, className }: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border p-4", className)} style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      {(title || action) && (
        <div className="flex items-start justify-between mb-3">
          <div>
            {title && <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{title}</div>}
            {subtitle && <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

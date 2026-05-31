import { ReactNode } from "react";

export function PageHeader({ title, description, action }: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div>
        <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h1>
        {description && <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{description}</p>}
      </div>
      {action}
    </div>
  );
}

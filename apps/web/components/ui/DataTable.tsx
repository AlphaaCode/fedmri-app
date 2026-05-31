import { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface Column<T> {
  key: string;
  header: ReactNode;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
}

export function DataTable<T>({ columns, rows, getRowKey, empty = "No data", className }: {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T, index: number) => string;
  empty?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn("font-medium pb-2 text-xs uppercase tracking-wider [&:not(:last-child)]:pr-4", c.align === "right" ? "text-right" : "text-left")}
                style={{ color: "var(--text-secondary)" }}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-6 text-center text-xs" style={{ color: "var(--text-secondary)" }}>{empty}</td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={getRowKey(row, i)} style={{ borderBottom: "1px solid var(--border)" }}>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn("py-3 [&:not(:last-child)]:pr-4", c.align === "right" ? "text-right tabular-nums" : "text-left")}
                    style={{ color: "var(--text-primary)" }}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

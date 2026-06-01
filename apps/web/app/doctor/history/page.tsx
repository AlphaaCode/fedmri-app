"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePortalTitle } from "@/lib/use-portal-title";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { getCases, type CasesResponse } from "@/lib/doctor-api";
import { SUBTYPES, SUBTYPE_COLOR, type CaseResult, type Subtype } from "@/lib/types";

const PAGE_SIZE = 10;
const shortId = (id: string) => `#FED-${id.slice(0, 6).toUpperCase()}`;

export default function MedicalHistoryPage() {
  usePortalTitle("Medical History");
  const [page, setPage] = useState(1);
  const [pageData, setPageData] = useState<CasesResponse | null>(null);
  const [all, setAll] = useState<CasesResponse | null>(null);

  useEffect(() => {
    getCases({ page, limit: PAGE_SIZE }).then(setPageData).catch(() => setPageData({ data: [], total: 0 }));
  }, [page]);

  useEffect(() => {
    getCases({ limit: 200 }).then(setAll).catch(() => setAll({ data: [], total: 0 }));
  }, []);

  const rows = pageData?.data ?? [];
  const total = pageData?.total ?? all?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const analytics = useMemo(() => {
    const cases = all?.data ?? [];
    const n = cases.length;
    const avgConf = n ? cases.reduce((s, c) => s + c.confidence, 0) / n : 0;
    const latestModel = n ? Math.max(...cases.map((c) => c.modelVersion)) : 0;
    const counts: Record<string, number> = {};
    for (const c of cases) counts[c.predictedSubtype] = (counts[c.predictedSubtype] ?? 0) + 1;
    return { n, avgConf, latestModel, counts };
  }, [all]);

  const columns: Column<CaseResult>[] = [
    { key: "date", header: "Date", render: (r) => new Date(r.createdAt).toLocaleDateString() },
    { key: "id", header: "Case", render: (r) => <span className="font-mono text-xs">{shortId(r.id)}</span> },
    { key: "subtype", header: "Subtype", render: (r) => <span style={{ color: SUBTYPE_COLOR[r.predictedSubtype as Subtype] }}>{r.predictedSubtype}</span> },
    { key: "conf", header: "Confidence", align: "right", render: (r) => `${Math.round(r.confidence * 100)}%` },
    { key: "model", header: "Model", render: (r) => `v${r.modelVersion}` },
    { key: "status", header: "Status", render: () => <StatusBadge status="pending" label="Awaiting review" /> },
    { key: "go", header: "", align: "right", render: (r) => <Link href={`/doctor/chat?caseId=${r.id}`} className="text-xs" style={{ color: "var(--teal)" }}>Discuss →</Link> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Medical History & Analytics" description="Your hospital's case archive and outcomes" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard label="Total Studies" value={total} accent="var(--teal)" hint="In your hospital silo" />
        <StatCard label="Avg Confidence" value={analytics.n ? `${Math.round(analytics.avgConf * 100)}%` : "—"} accent="var(--blue-accent)" />
        <StatCard label="Latest Model" value={analytics.latestModel ? `v${analytics.latestModel}` : "—"} accent="var(--amber)" />
      </div>

      <Panel title="Subtype distribution" subtitle="Across your hospital's analysed cases">
        {analytics.n === 0 ? (
          <div className="text-xs py-4 text-center" style={{ color: "var(--text-secondary)" }}>No cases yet.</div>
        ) : (
          <div className="space-y-2">
            {SUBTYPES.map((s) => {
              const count = analytics.counts[s] ?? 0;
              const pct = analytics.n ? (count / analytics.n) * 100 : 0;
              return (
                <div key={s} className="flex items-center gap-3">
                  <div className="w-32 text-xs shrink-0" style={{ color: SUBTYPE_COLOR[s] }}>{s}</div>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-base)" }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: SUBTYPE_COLOR[s] }} />
                  </div>
                  <div className="w-10 text-right text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>{count}</div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Case archive" subtitle={`${total} stud${total === 1 ? "y" : "ies"}`}>
        <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} empty="No studies yet — upload a scan to begin." />
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-3">
            <Button variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Prev</Button>
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Page {page} of {totalPages}</span>
            <Button variant="ghost" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next →</Button>
          </div>
        )}
      </Panel>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePortalTitle } from "@/lib/use-portal-title";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getCases, type CasesResponse } from "@/lib/doctor-api";
import { SUBTYPE_COLOR, type CaseResult, type Subtype } from "@/lib/types";

const shortId = (id: string) => `#FED-${id.slice(-6).toUpperCase()}`;
const Demo = () => (
  <span className="text-[10px] px-1.5 py-0.5 rounded border shrink-0" style={{ color: "var(--text-secondary)", borderColor: "var(--border)", background: "var(--bg-card2)" }}>demo</span>
);

// Illustrative clinical content (no real backing — demo-labeled).
const NOTES = [
  { who: "Radiologist", when: "2d ago", text: "Spiculated mass, upper outer quadrant. Hormone-receptor correlation advised." },
  { who: "Oncology", when: "5d ago", text: "Consistent with a hormone-positive profile; recommend IHC confirmation." },
];
const SIMILAR = [
  { id: "9MX2A1", node: "Hospital B", sim: 0.93 },
  { id: "4402KQ", node: "Hospital C", sim: 0.88 },
];

function VolumeBars({ seed }: { seed?: number }) {
  // Deterministic but case-specific bars seeded from case confidence/id
  const s = seed ?? 0;
  const bars = [
    Math.round(55 + ((s * 7) % 20)),
    Math.round(47 + ((s * 11) % 18)),
    Math.round(40 + ((s * 13) % 15)),
    Math.round(34 + ((s * 17) % 12)),
    Math.round(28 + ((s * 19) % 10)),
    Math.round(22 + ((s * 23) % 8)),
  ];
  const max = Math.max(...bars);
  return (
    <div className="flex items-end gap-1.5 h-28">
      {bars.map((b, i) => (
        <div key={i} className="flex-1 rounded-t" style={{ height: `${(b / max) * 100}%`, background: i === bars.length - 1 ? "var(--teal)" : "var(--teal-dim)", opacity: 0.45 + 0.55 * (i / (bars.length - 1)) }} />
      ))}
    </div>
  );
}

export default function MedicalHistoryPage() {
  usePortalTitle("Medical History");
  const [cases, setCases] = useState<CasesResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    getCases({ limit: 8 }).then(setCases).catch(() => setCases({ data: [], total: 0 }));
  }, []);

  const list = cases?.data ?? [];
  const c: CaseResult | null = useMemo(
    () => list.find((x) => x.id === selectedId) ?? list[0] ?? null,
    [list, selectedId],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Medical History & Analytics"
        description="Longitudinal patient case detail across the federated network."
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="text-sm inline-flex items-center gap-2" title="Non-functional in demo">Export longitudinal <Demo /></Button>
            {c && (
              <Link href={`/doctor/chat?caseId=${c.id}`} className="rounded-lg text-sm font-semibold px-4 py-2" style={{ background: "var(--teal-dim)", color: "#0d1117" }}>Consult federated node</Link>
            )}
          </div>
        }
      />

      {/* Recent-case selector (real data) */}
      {list.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-[11px] uppercase tracking-widest shrink-0" style={{ color: "var(--text-secondary)" }}>Recent studies</span>
          {list.map((x) => {
            const on = x.id === c?.id;
            return (
              <button
                key={x.id}
                type="button"
                onClick={() => setSelectedId(x.id)}
                className="text-xs font-mono px-2.5 py-1 rounded-lg shrink-0 transition-colors"
                style={{ background: on ? "var(--teal-glow)" : "var(--bg-card2)", color: on ? "var(--teal)" : "var(--text-secondary)", border: "1px solid " + (on ? "#2dd4bf40" : "var(--border)") }}
              >
                {shortId(x.id)}
              </button>
            );
          })}
        </div>
      )}

      {/* Patient header */}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: "var(--teal-glow)", color: "var(--teal)", border: "1px solid #2dd4bf40" }}>ER</div>
            <div>
              <div className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>Elena Rodriguez <Demo /></div>
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>F · 54y · {c ? shortId(c.id) : "—"} · model v{c?.modelVersion ?? 10}</div>
            </div>
          </div>
          {c && (
            <div className="flex items-center gap-2">
              <span className="text-sm" style={{ color: SUBTYPE_COLOR[c.predictedSubtype as Subtype] }}>{c.predictedSubtype}</span>
              <StatusBadge status={c.status === "VALIDATED" ? "validated" : c.status === "DISPUTED" ? "disputed" : "pending"} label={c.status === "PENDING" || !c.status ? "Awaiting review" : undefined} />
            </div>
          )}
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        <div className="space-y-4 min-w-0">
          <Panel title="Patient case timeline" subtitle="Scan history for this session">
            {list.length > 0 ? (
              <div className="space-y-2">
                {list.slice(0, 5).map((x) => {
                  const active = x.id === c?.id;
                  const date = new Date(x.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
                  return (
                    <button key={x.id} type="button" onClick={() => setSelectedId(x.id)}
                      className="w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all"
                      style={{ background: active ? "var(--teal-glow)" : "var(--bg-card2)", borderColor: active ? "#2dd4bf40" : "var(--border)" }}>
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: active ? "var(--teal)" : "var(--text-secondary)" }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-mono" style={{ color: active ? "var(--teal)" : "var(--text-primary)" }}>{shortId(x.id)}</div>
                        <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{date} · {x.predictedSubtype} · {Math.round(x.confidence * 100)}%</div>
                      </div>
                      {active && <span className="text-[10px] font-semibold shrink-0" style={{ color: "var(--teal)" }}>Viewing</span>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs py-6 text-center" style={{ color: "var(--text-secondary)" }}>No cases found for this session.</div>
            )}
          </Panel>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Panel title="AI prediction" subtitle="Model output for this case">
              {c ? (
                <div className="space-y-3">
                  <div className="rounded-xl p-3" style={{ background: "var(--bg-card2)", border: `1px solid ${(SUBTYPE_COLOR[c.predictedSubtype as Subtype] ?? "#2dd4bf")}40` }}>
                    <div className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--text-secondary)" }}>Predicted subtype</div>
                    <div className="text-xl font-bold" style={{ color: SUBTYPE_COLOR[c.predictedSubtype as Subtype] ?? "var(--teal)" }}>{c.predictedSubtype}</div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Confidence: {Math.round(c.confidence * 100)}%</div>
                  </div>
                  {Array.isArray(c.probs) && c.probs.length > 0 && (() => {
                    const labels = c.probs.length === 2 ? ["Luminal", "Non-Luminal"] : ["Luminal A", "Luminal B", "HER2", "Triple Negative"];
                    const colors = c.probs.length === 2 ? ["#2dd4bf", "#f59e0b"] : ["#2dd4bf", "#60a5fa", "#f59e0b", "#fb7185"];
                    return (
                      <div className="space-y-2">
                        {labels.map((label, i) => {
                          const p = Math.round((c.probs?.[i] ?? 0) * 100);
                          return (
                            <div key={label} className="flex items-center gap-3">
                              <div className="w-28 text-xs shrink-0" style={{ color: colors[i] }}>{label}</div>
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-base)" }}>
                                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${p}%`, background: colors[i] }} />
                              </div>
                              <div className="w-9 text-right text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>{p}%</div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="text-xs py-4 text-center" style={{ color: "var(--text-secondary)" }}>No case selected.</div>
              )}
            </Panel>

            <Panel title="Tumor volume progression" subtitle="Estimated, last 6 studies" action={<Demo />}>
              <VolumeBars seed={c ? Math.round(c.confidence * 100) + (c.modelVersion ?? 0) : 0} />
              <div className="text-[11px] mt-2" style={{ color: "var(--text-secondary)" }}>Illustrative — not derived from this demo's data.</div>
            </Panel>
          </div>

          <Panel title="Federated embedding recommendations" subtitle="Similar cases across the network" action={<Demo />}>
            <div className="space-y-2">
              {SIMILAR.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg p-2.5" style={{ background: "var(--bg-card2)", border: "1px solid var(--border)" }}>
                  <div>
                    <div className="text-xs font-mono" style={{ color: "var(--text-primary)" }}>#FED-{s.id}</div>
                    <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{s.node}</div>
                  </div>
                  <div className="text-xs tabular-nums" style={{ color: "var(--teal)" }}>{Math.round(s.sim * 100)}% match</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Clinical notes" action={<Demo />}>
            <div className="space-y-3">
              {NOTES.map((n, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between text-[11px]">
                    <span style={{ color: "var(--teal)" }}>{n.who}</span>
                    <span style={{ color: "var(--text-secondary)" }}>{n.when}</span>
                  </div>
                  <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--text-primary)" }}>{n.text}</p>
                </div>
              ))}
              <input disabled placeholder="Add a note… (demo)" className="w-full text-xs rounded-lg px-2.5 py-2 outline-none" style={{ background: "var(--bg-base)", color: "var(--text-secondary)", border: "1px solid var(--border)" }} />
            </div>
          </Panel>

          <Panel title="Biomarkers" subtitle="Derived from FedSCRT binary classification">
            {c ? (
              <div className="space-y-2">
                {(() => {
                  const isLuminal = (c.predictedSubtype as string) === "Luminal" || (c.predictedSubtype as string)?.startsWith("Luminal");
                  const biomarks = [
                    { k: "ER", v: isLuminal ? "Positive" : "Negative", hint: "Estrogen receptor" },
                    { k: "PR", v: isLuminal ? "Positive" : "Negative", hint: "Progesterone receptor" },
                    { k: "HER2", v: "Negative", hint: "Not assessed by this model" },
                    { k: "Ki-67", v: isLuminal ? "< 20%" : "> 20%", hint: "Proliferation index (estimated)" },
                  ];
                  return biomarks.map(({ k, v, hint }) => (
                    <div key={k} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "var(--bg-card2)", border: "1px solid var(--border)" }}>
                      <div>
                        <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{k}</span>
                        <span className="text-[11px] ml-2" style={{ color: "var(--text-secondary)" }}>{hint}</span>
                      </div>
                      <span className="text-xs font-medium" style={{ color: v.includes("Positive") || v.includes("<") ? "var(--teal)" : "var(--text-secondary)" }}>{v}</span>
                    </div>
                  ));
                })()}
                <p className="text-[11px] mt-1" style={{ color: "var(--text-secondary)", opacity: 0.7 }}>
                  Derived from binary Luminal/Non-Luminal classification · confirm with IHC.
                </p>
              </div>
            ) : (
              <div className="text-xs py-4 text-center" style={{ color: "var(--text-secondary)" }}>No case selected.</div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePortalTitle } from "@/lib/use-portal-title";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AttentionOverlay } from "@/components/AttentionOverlay";
import { getCases, type CasesResponse } from "@/lib/doctor-api";
import { apiUpdateCase } from "@/lib/api";
import { useToastStore } from "@/components/ToastProvider";
import { SUBTYPE_COLOR, type CaseResult, type Subtype } from "@/lib/types";

const shortId = (id: string) => `#FED-${id.slice(-6).toUpperCase()}`;

// A case is a TEST scan only if explicitly tagged; everything else (incl. older
// cases with no attribution) is treated as a patient study.
function isTest(c: { subjectType?: string | null }): boolean {
  return c.subjectType === "TEST";
}
function subjectName(c: { subjectType?: string | null; subjectLabel?: string | null }): string {
  if (c.subjectLabel && c.subjectLabel.trim()) return c.subjectLabel;
  return isTest(c) ? "Test scan" : "Unlabelled patient";
}

type Filter = "ALL" | "PATIENT" | "TEST";

export default function MedicalHistoryPage() {
  usePortalTitle("Medical History");
  const [cases, setCases] = useState<CasesResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [showScan, setShowScan] = useState(false);
  const push = useToastStore((s) => s.push);

  useEffect(() => {
    getCases({ limit: 30 }).then(setCases).catch(() => setCases({ data: [], total: 0 }));
  }, []);

  const all = cases?.data ?? [];
  const list = useMemo(
    () => all.filter((x) => (filter === "ALL" ? true : filter === "TEST" ? isTest(x) : !isTest(x))),
    [all, filter],
  );
  const counts = useMemo(
    () => ({
      ALL: all.length,
      PATIENT: all.filter((x) => !isTest(x)).length,
      TEST: all.filter((x) => isTest(x)).length,
    }),
    [all],
  );

  const c: CaseResult | null = useMemo(
    () => list.find((x) => x.id === selectedId) ?? list[0] ?? null,
    [list, selectedId],
  );

  // ── Notes: load the selected case's persisted note, edit + save ──
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  useEffect(() => {
    setNote(c?.clinicalNote ?? "");
    setShowScan(false);
  }, [c?.id, c?.clinicalNote]);

  async function saveNote() {
    if (!c) return;
    setSavingNote(true);
    try {
      const updated = await apiUpdateCase(c.id, { clinicalNote: note });
      setCases((prev) =>
        prev
          ? { ...prev, data: prev.data.map((x) => (x.id === c.id ? { ...x, clinicalNote: updated.clinicalNote } : x)) }
          : prev,
      );
      push("Clinical note saved", "success");
    } catch (e: any) {
      push(e?.message || "Could not save note", "warning");
    } finally {
      setSavingNote(false);
    }
  }

  const noteDirty = c ? note !== (c.clinicalNote ?? "") : false;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Medical History & Analytics"
        description="Your hospital's case studies — patient scans and test runs, with re-viewable imaging."
        action={
          c && (
            <Link href={`/doctor/chat?caseId=${c.id}`} className="rounded-lg text-sm font-semibold px-4 py-2" style={{ background: "var(--teal-dim)", color: "#0d1117" }}>Consult federated node</Link>
          )
        }
      />

      {/* Subject filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] uppercase tracking-widest mr-1" style={{ color: "var(--text-secondary)" }}>Show</span>
        {([
          ["ALL", "All"],
          ["PATIENT", "Patient studies"],
          ["TEST", "Test scans"],
        ] as [Filter, string][]).map(([key, label]) => {
          const on = filter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => { setFilter(key); setSelectedId(null); }}
              className="text-xs px-3 py-1 rounded-full font-semibold border transition-colors"
              style={{
                background: on ? "var(--teal-glow)" : "var(--bg-card2)",
                color: on ? "var(--teal)" : "var(--text-secondary)",
                borderColor: on ? "#2dd4bf40" : "var(--border)",
              }}
            >
              {label} <span style={{ opacity: 0.7 }}>· {counts[key]}</span>
            </button>
          );
        })}
      </div>

      {/* Recent-case selector */}
      {list.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-[11px] uppercase tracking-widest shrink-0" style={{ color: "var(--text-secondary)" }}>Studies</span>
          {list.map((x) => {
            const on = x.id === c?.id;
            return (
              <button
                key={x.id}
                type="button"
                onClick={() => setSelectedId(x.id)}
                className="text-xs font-mono px-2.5 py-1 rounded-lg shrink-0 transition-colors inline-flex items-center gap-1.5"
                style={{ background: on ? "var(--teal-glow)" : "var(--bg-card2)", color: on ? "var(--teal)" : "var(--text-secondary)", border: "1px solid " + (on ? "#2dd4bf40" : "var(--border)") }}
              >
                {isTest(x) && <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#f59e0b" }} />}
                {shortId(x.id)}
              </button>
            );
          })}
        </div>
      )}

      {/* Subject header (real attribution) */}
      <Panel>
        {c ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                style={{
                  background: isTest(c) ? "#f59e0b20" : "var(--teal-glow)",
                  color: isTest(c) ? "#f59e0b" : "var(--teal)",
                  border: `1px solid ${isTest(c) ? "#f59e0b40" : "#2dd4bf40"}`,
                }}
              >
                {isTest(c) ? "T" : (subjectName(c)[0] ?? "P").toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                  {subjectName(c)}
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                    style={{
                      background: isTest(c) ? "#f59e0b20" : "var(--teal-glow)",
                      color: isTest(c) ? "#f59e0b" : "var(--teal)",
                    }}
                  >
                    {isTest(c) ? "TEST SCAN" : "PATIENT STUDY"}
                  </span>
                </div>
                <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {shortId(c.id)} · {new Date(c.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · model v{c.modelVersion}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm" style={{ color: SUBTYPE_COLOR[c.predictedSubtype as Subtype] }}>{c.predictedSubtype}</span>
              <StatusBadge status={c.status === "VALIDATED" ? "validated" : c.status === "DISPUTED" ? "disputed" : "pending"} label={c.status === "PENDING" || !c.status ? "Awaiting review" : undefined} />
            </div>
          </div>
        ) : (
          <div className="text-xs py-4 text-center" style={{ color: "var(--text-secondary)" }}>
            No {filter === "TEST" ? "test scans" : filter === "PATIENT" ? "patient studies" : "cases"} found.
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div className="space-y-4 min-w-0">
          {/* Re-view the scan (real imaging + attention heatmap) */}
          <Panel
            title="Scan review"
            subtitle="Re-open the imaging and AI focus map for this study"
            action={
              c && (
                <button
                  type="button"
                  onClick={() => setShowScan((s) => !s)}
                  className="text-xs px-3 py-1 rounded-lg font-medium"
                  style={{ background: showScan ? "var(--bg-card2)" : "var(--teal-glow)", color: showScan ? "var(--text-secondary)" : "var(--teal)", border: "1px solid " + (showScan ? "var(--border)" : "#2dd4bf40") }}
                >
                  {showScan ? "Hide scan" : "Re-view scan"}
                </button>
              )
            }
          >
            {!c ? (
              <div className="text-xs py-4 text-center" style={{ color: "var(--text-secondary)" }}>No case selected.</div>
            ) : showScan ? (
              <AttentionOverlay caseId={c.id} />
            ) : (
              <div className="text-xs py-6 text-center" style={{ color: "var(--text-secondary)" }}>
                Imaging is kept in the hospital silo. Tap <span style={{ color: "var(--teal)" }}>Re-view scan</span> to load the slice + attention map.
              </div>
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

          <Panel title="Patient case timeline" subtitle="Studies in this view">
            {list.length > 0 ? (
              <div className="space-y-2">
                {list.slice(0, 6).map((x) => {
                  const active = x.id === c?.id;
                  const date = new Date(x.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
                  return (
                    <button key={x.id} type="button" onClick={() => setSelectedId(x.id)}
                      className="w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all"
                      style={{ background: active ? "var(--teal-glow)" : "var(--bg-card2)", borderColor: active ? "#2dd4bf40" : "var(--border)" }}>
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: isTest(x) ? "#f59e0b" : active ? "var(--teal)" : "var(--text-secondary)" }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-mono flex items-center gap-2" style={{ color: active ? "var(--teal)" : "var(--text-primary)" }}>
                          {shortId(x.id)}
                          <span style={{ color: "var(--text-secondary)" }}>· {subjectName(x)}</span>
                        </div>
                        <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{date} · {x.predictedSubtype} · {Math.round(x.confidence * 100)}%</div>
                      </div>
                      {active && <span className="text-[10px] font-semibold shrink-0" style={{ color: "var(--teal)" }}>Viewing</span>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs py-6 text-center" style={{ color: "var(--text-secondary)" }}>No cases in this view.</div>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          {/* Working, persisted clinical notes */}
          <Panel title="Clinical notes" subtitle={c ? "Saved with this case" : undefined}>
            {c ? (
              <div className="space-y-2">
                {c.clinicalNote ? (
                  <div className="rounded-lg p-3 text-xs leading-relaxed" style={{ background: "var(--bg-card2)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                    {c.clinicalNote}
                  </div>
                ) : (
                  <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>No note yet — add the first clinical note for this study.</p>
                )}
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  placeholder="Add a clinical note…"
                  className="w-full text-xs rounded-lg px-2.5 py-2 outline-none resize-none"
                  style={{ background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{note.length}/2000</span>
                  <Button variant="teal" className="text-xs px-3 py-1.5" onClick={saveNote} disabled={savingNote || !noteDirty}>
                    {savingNote ? "Saving…" : "Save note"}
                  </Button>
                </div>
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

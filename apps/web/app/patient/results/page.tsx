"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { apiFetch } from "@/lib/api";
import { downloadCasePdf } from "@/lib/download-pdf";
import { AttentionOverlay } from "@/components/AttentionOverlay";
import { SUBTYPE_COLOR, SUBTYPE_PLAIN } from "@/lib/types";
import { useLang, isRTL, LANGS, PATIENT_T, type Lang } from "@/lib/i18n";

function subtypeColor(s: string): string {
  return (SUBTYPE_COLOR as Record<string, string>)[s] ?? "var(--text-secondary)";
}
function subtypePlain(s: string): string {
  return (SUBTYPE_PLAIN as Record<string, string>)[s] ?? s;
}
function isBinary(s: string): boolean {
  return s === "Luminal" || s === "Non-Luminal";
}

// Longitudinal trend: AI confidence per scan over time. Plain-language, no jargon.
function TrendChart({ cases, t }: { cases: any[]; t: Record<string, string> }) {
  const data = [...cases]
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
    .map((c) => ({
      date: new Date(c.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      confidence: Math.round((c.confidence ?? 0) * 100),
      subtype: c.predictedSubtype as string,
    }));
  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{t.trendTitle}</div>
      <div className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>{t.trendSub}</div>
      <div style={{ width: "100%", height: 170 }} dir="ltr">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis dataKey="date" stroke="var(--chart-axis)" fontSize={11} />
            <YAxis domain={[0, 100]} stroke="var(--chart-axis)" fontSize={11} tickFormatter={(v: number) => `${v}%`} />
            <Tooltip
              contentStyle={{ background: "var(--chart-tooltip-bg)", border: "1px solid var(--border)" }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any, _n: any, p: any) => [`${v}%`, p?.payload?.subtype ?? "confidence"]}
            />
            <Line type="monotone" dataKey="confidence" stroke="var(--teal)" strokeWidth={2.5} dot={{ r: 4, fill: "var(--teal)" }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Full-scan review: probability bars + the attention heatmap (real MRI slice in
// real mode) + advisory. Patients open this from their results list.
function ScanReview({ c, t, lang }: { c: any; t: Record<string, string>; lang: Lang }) {
  const subtype = c.predictedSubtype as string;
  const probs: number[] = Array.isArray(c.probs) ? c.probs : [];
  const bars = isBinary(subtype)
    ? [
        { label: "Luminal", p: probs[0] ?? 0, c: "#2dd4bf" },
        { label: "Non-Luminal", p: probs[1] ?? 0, c: "#f59e0b" },
      ]
    : ["Luminal A", "Luminal B", "HER2", "Triple Negative"].map((l, i) => ({
        label: l,
        p: probs[i] ?? 0,
        c: subtypeColor(l),
      }));
  const advisory = isBinary(subtype)
    ? subtype === "Luminal"
      ? t.luminalAdvisory
      : t.nonLuminalAdvisory
    : subtypePlain(subtype);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden"
    >
      <div className="grid md:grid-cols-2 gap-3 pt-3">
        <div className="space-y-3">
          <div className="space-y-2">
            {bars.map((b) => {
              const isTop = b.label === subtype;
              return (
                <div key={b.label} className="flex items-center gap-3">
                  <div className="w-24 text-xs shrink-0" style={{ color: isTop ? "var(--text-primary)" : "var(--text-secondary)" }}>{b.label}</div>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-base)" }} dir="ltr">
                    <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${Math.round(b.p * 100)}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }} style={{ background: isTop ? b.c : "var(--border)" }} />
                  </div>
                  <div className="w-10 text-right text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>{(b.p * 100).toFixed(1)}%</div>
                </div>
              );
            })}
          </div>
          <div className="rounded-lg p-3 text-xs leading-relaxed" style={{ background: "var(--teal-glow)", color: "var(--teal-on-glow)", border: "1px solid var(--teal)30" }}>
            {advisory}
          </div>
          <button onClick={() => downloadCasePdf(c.id, lang).catch(() => {})}
            className="text-xs px-3 py-1.5 rounded-lg font-medium"
            style={{ background: "var(--teal-glow)", color: "var(--teal)", border: "1px solid var(--teal)40" }}>
            {t.download}
          </button>
        </div>
        <AttentionOverlay caseId={c.id} />
      </div>
    </motion.div>
  );
}

export default function PatientResultsPage() {
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [lang, setLang] = useLang();
  const t = PATIENT_T[lang];
  const rtl = isRTL(lang);

  useEffect(() => {
    apiFetch<{ data: any[] }>("/cases")
      .then((r) => setCases(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="w-full space-y-4 p-1" dir={rtl ? "rtl" : "ltr"}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>{t.historyTitle}</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{t.historySub}</p>
        </div>
        {/* Language selector */}
        <div className="flex gap-1 p-0.5 rounded-lg shrink-0" style={{ background: "var(--bg-card2)", border: "1px solid var(--border)" }} dir="ltr">
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLang(l.code)}
              aria-label={l.label}
              className="text-xs px-2.5 py-1 rounded-md font-medium transition-colors"
              style={{
                background: lang === l.code ? "var(--teal-glow)" : "transparent",
                color: lang === l.code ? "var(--teal-on-glow)" : "var(--text-secondary)",
              }}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {!loading && cases.length >= 2 && <TrendChart cases={cases} t={t} />}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl skeleton" />)}
        </div>
      ) : cases.length === 0 ? (
        <div className="text-center py-12 text-sm" style={{ color: "var(--text-secondary)" }}>
          {t.none}
        </div>
      ) : (
        <div className="space-y-2">
          {cases.map((c, i) => {
            const color = subtypeColor(c.predictedSubtype);
            const plain = subtypePlain(c.predictedSubtype);
            const confidence = typeof c.confidence === "number" ? Math.round(c.confidence * 100) : null;
            const date = new Date(c.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
            const open = openId === c.id;
            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl border p-4"
                style={{ background: "var(--bg-card)", borderColor: open ? "var(--teal)" : "var(--border)" }}
              >
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : c.id)}
                  className="w-full flex items-center justify-between text-left gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold" style={{ color }}>{c.predictedSubtype}</div>
                    <div className="text-xs mt-0.5 max-w-xs truncate" style={{ color: "var(--text-secondary)" }}>{plain}</div>
                    {confidence !== null && (
                      <div className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>{t.confidence} {confidence}%</div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{date}</div>
                    <div className="text-[11px] mt-1" style={{ color: "var(--teal)" }}>
                      {open ? t.hide : t.review}
                    </div>
                  </div>
                </button>
                <AnimatePresence>{open && <ScanReview c={c} t={t} lang={lang} />}</AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

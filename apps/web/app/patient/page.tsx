"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { ScanLine, MessageSquare, Download, CheckCircle, Upload, Activity } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { SUBTYPE_COLOR, SUBTYPE_PLAIN } from "@/lib/types";
import { downloadCasePdf } from "@/lib/download-pdf";

function subtypeColor(s: string) { return (SUBTYPE_COLOR as Record<string, string>)[s] ?? "var(--teal)"; }
function subtypePlain(s: string) { return (SUBTYPE_PLAIN as Record<string, string>)[s] ?? s; }

const QUICK_ACTIONS = [
  { label: "Ask AI Assistant", desc: "Get answers about your scan", icon: MessageSquare, href: "/patient/chat" },
  { label: "New Scan", desc: "Upload and analyse an MRI", icon: ScanLine, href: "/patient/scan" },
  { label: "Download Records", desc: "Export your health reports", icon: Download, href: "/patient/results" },
];

function ActivityIcon({ type }: { type: string }) {
  if (type === "review") return <CheckCircle size={14} style={{ color: "var(--teal)" }} />;
  if (type === "upload") return <Upload size={14} style={{ color: "#60a5fa" }} />;
  return <Activity size={14} style={{ color: "#f59e0b" }} />;
}

export default function PatientDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ data: any[] }>("/cases?limit=5")
      .then((r) => setCases(r.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const latest = cases[0];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Patient Dashboard</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
          Overview of your recent clinical data and federated AI activities.
        </p>
      </div>

      {/* Top row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Latest MRI Analysis */}
        <div className="md:col-span-2 rounded-2xl border p-5 space-y-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>Latest MRI Analysis</div>
            {latest && (
              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                style={{ background: "rgba(45,212,191,0.1)", color: "var(--teal)", border: "1px solid rgba(45,212,191,0.3)" }}>
                ✓ Processed
              </span>
            )}
          </div>

          {loading ? (
            <div className="h-24 rounded-xl skeleton" />
          ) : !latest ? (
            <div className="text-center py-8 space-y-3">
              <div className="text-sm" style={{ color: "var(--text-secondary)" }}>No scans yet</div>
              <Link href="/patient/scan"
                className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg font-medium"
                style={{ background: "var(--teal-glow)", color: "var(--teal)", border: "1px solid rgba(45,212,191,0.3)" }}>
                <ScanLine size={13} /> Upload your first scan
              </Link>
            </div>
          ) : (
            <div className="flex items-start gap-5">
              {/* Subtype */}
              <div className="flex-1">
                <div className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--text-secondary)" }}>
                  Classification Result
                </div>
                <div className="text-4xl font-black" style={{ color: subtypeColor(latest.predictedSubtype) }}>
                  {latest.predictedSubtype}
                </div>
                <div className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {subtypePlain(latest.predictedSubtype)}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>Confidence</div>
                    <div className="text-sm font-bold" style={{ color: subtypeColor(latest.predictedSubtype) }}>
                      {Math.round(latest.confidence * 100)}%
                    </div>
                  </div>
                  <div className="w-px h-8" style={{ background: "var(--border)" }} />
                  <div>
                    <div className="text-[11px] uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>Date</div>
                    <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {new Date(latest.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                  </div>
                </div>
                <p className="text-[11px] mt-3" style={{ color: "var(--text-secondary)", opacity: 0.7 }}>
                  Analysis indicates stable imaging characteristics. See your oncologist to review these results.
                </p>
                <button onClick={() => downloadCasePdf(latest.id).catch(() => {})}
                  className="mt-3 text-xs px-3 py-1.5 rounded-lg font-medium"
                  style={{ background: "var(--teal-glow)", color: "var(--teal)", border: "1px solid rgba(45,212,191,0.3)" }}>
                  Download Clinical Report
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Network Status */}
        <div className="rounded-2xl border p-5 flex flex-col justify-between" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="text-xs uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>Network Status</div>
          <div className="space-y-3 my-4">
            <motion.div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
              style={{ background: "rgba(45,212,191,0.12)", border: "2px solid var(--teal)" }}
              animate={{ boxShadow: ["0 0 0 0 rgba(45,212,191,0.25)", "0 0 0 12px rgba(45,212,191,0)", "0 0 0 0 rgba(45,212,191,0.25)"] }}
              transition={{ repeat: Infinity, duration: 2.5 }}>
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M4 11a7 7 0 1114 0 7 7 0 01-14 0z" stroke="var(--teal)" strokeWidth="1.5"/>
                <path d="M11 7v4l3 3" stroke="var(--teal)" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </motion.div>
            <div className="text-center">
              <div className="text-sm font-semibold" style={{ color: "var(--teal)" }}>AI Synchronized</div>
              <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                Model v10 · 3 hospitals active
              </div>
            </div>
          </div>
          <div className="text-[11px] text-center leading-relaxed" style={{ color: "var(--text-secondary)", opacity: 0.7 }}>
            The global AI is up-to-date. No raw data was shared in the last training cycle.
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <div className="text-xs uppercase tracking-widest mb-3" style={{ color: "var(--text-secondary)" }}>Quick Actions</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {QUICK_ACTIONS.map((a, i) => (
            <motion.div key={a.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
              <Link href={a.href}
                className="flex items-center gap-3 rounded-xl border p-4 transition-colors group"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "var(--teal-glow)", border: "1px solid rgba(45,212,191,0.2)" }}>
                  <a.icon size={16} style={{ color: "var(--teal)" }} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{a.label}</div>
                  <div className="text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>{a.desc}</div>
                </div>
                <span className="ml-auto shrink-0 text-xs" style={{ color: "var(--text-secondary)" }}>→</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      {cases.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-widest mb-3" style={{ color: "var(--text-secondary)" }}>Recent Activity</div>
          <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            {cases.slice(0, 4).map((c, i) => {
              const date = new Date(c.createdAt);
              const timeStr = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
              const dateStr = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
              return (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3"
                  style={{ borderBottom: i < cases.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: "var(--bg-card2)" }}>
                    <ActivityIcon type={i === 0 ? "review" : "upload"} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                      {i === 0 ? "AI Analysis Complete" : "New Scan Uploaded"}
                    </div>
                    <div className="text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>
                      Result: <span style={{ color: subtypeColor(c.predictedSubtype) }}>{c.predictedSubtype}</span>
                      {" "}· Confidence {Math.round(c.confidence * 100)}%
                    </div>
                  </div>
                  <div className="text-[11px] shrink-0 text-right" style={{ color: "var(--text-secondary)" }}>
                    <div>{dateStr}</div>
                    <div style={{ opacity: 0.6 }}>{timeStr}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

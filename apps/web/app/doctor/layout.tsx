"use client";

import { ReactNode, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useAuthStore } from "@/lib/auth-store";
import { FlTopology } from "@/components/FlTopology";
import { useFlStore } from "@/lib/fl-store";
import { useToastStore } from "@/components/ToastProvider";

export default function DoctorLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const flPhase = useFlStore((s) => s.phase);

  useEffect(() => {
    const t = setTimeout(() => {
      const { token: tok, user: u } = useAuthStore.getState();
      if (!tok) { router.replace("/login"); return; }
      // Keep non-doctors out of the doctor portal.
      if (u && u.role !== "DOCTOR") {
        router.replace(u.role === "PATIENT" ? "/patient/chat" : u.role === "RESEARCHER" ? "/researcher" : "/login");
      }
    }, 120);
    return () => clearTimeout(t);
  }, [token, router]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top nav */}
      <header className="border-b px-6 py-3 flex items-center justify-between shrink-0"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "var(--teal-glow)", border: "1px solid var(--teal)40" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="3" stroke="var(--teal)" strokeWidth="1.2"/>
              <circle cx="7" cy="7" r="1.2" fill="var(--teal)"/>
              <path d="M1 7h1.5M11.5 7H13M7 1v1.5M7 11.5V13" stroke="var(--teal)" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>FedMRI</div>
          <div className="w-px h-4 mx-1" style={{ background: "var(--border)" }} />
          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>Doctor Portal</div>
          <nav className="ml-6 flex items-center gap-1">
            {[
              { href: "/doctor/scan", label: "Scan" },
              { href: "/doctor/chat", label: "Assistant" },
              { href: "/doctor/model", label: "Metrics" },
            ].map((item) => {
              const active = pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-xs px-3 py-1 rounded-lg transition-colors"
                  style={{
                    background: active ? "var(--teal-glow)" : "transparent",
                    color: active ? "var(--teal)" : "var(--text-secondary)",
                    border: "1px solid " + (active ? "var(--teal)40" : "transparent"),
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {user?.name ?? "Doctor"}
          </div>
          <button
            type="button"
            onClick={() => { clear(); router.replace("/login"); }}
            className="text-xs px-3 py-1 rounded-lg transition-colors"
            style={{
              background: "var(--bg-card2)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Silo status bar */}
      <div
        className="px-6 py-1.5 text-[11px] flex items-center gap-2 shrink-0"
        style={{
          background: flPhase === "local_training" || flPhase === "aggregating" ? "#f59e0b15" : "var(--teal-glow)",
          color: flPhase === "local_training" || flPhase === "aggregating" ? "#fbbf24" : "#99f6e4",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 1L10 3v4c0 2.2-1.6 4-4 4.5C3.6 11 2 9.2 2 7V3L6 1z" stroke="currentColor" strokeWidth="1.2"/>
        </svg>
        {flPhase === "idle" && "Your hospital silo is active — data stays here"}
        {flPhase === "local_training" && "FL round running — only model weights leaving hospital, 0 bytes of patient data"}
        {flPhase === "aggregating" && "Aggregating updates — still 0 bytes of patient data transmitted"}
        {flPhase === "complete" && "Round complete — your hospital silo remained intact throughout"}
      </div>

      {/* Main two-column layout */}
      <div className="flex-1 grid lg:grid-cols-[1fr_300px] gap-5 p-5 max-w-7xl mx-auto w-full">
        <motion.main
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="space-y-4 min-w-0"
        >
          {children}
        </motion.main>
        <aside className="space-y-4">
          <FlTopology />
        </aside>
      </div>
    </div>
  );
}

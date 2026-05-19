"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

const STEPS = [
  {
    title: "AI trained across 3 hospitals",
    body: "Three hospitals worked together to train an AI model. Each hospital's team of doctors contributed their expertise — without sharing a single patient record.",
    visual: (
      <div className="flex items-center justify-center gap-6 py-4">
        {["Hospital A", "Hospital B", "Hospital C"].map((h, i) => (
          <motion.div
            key={h}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.15 }}
            className="flex flex-col items-center gap-2"
          >
            <div className="w-14 h-14 rounded-xl flex items-center justify-center relative" style={{ background: "var(--teal-glow)", border: "1px solid var(--teal)40" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="9" width="18" height="12" rx="1" stroke="var(--teal)" strokeWidth="1.5"/>
                <path d="M9 21V15a3 3 0 016 0v6" stroke="var(--teal)" strokeWidth="1.5"/>
                <path d="M3 9L12 3l9 6" stroke="var(--teal)" strokeWidth="1.5" strokeLinejoin="round"/>
              </svg>
              <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <rect x="2" y="4" width="6" height="5" rx="1" stroke="var(--teal)" strokeWidth="1.2"/>
                  <path d="M3.5 4V3a1.5 1.5 0 013 0v1" stroke="var(--teal)" strokeWidth="1.2"/>
                </svg>
              </div>
            </div>
            <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{h}</span>
          </motion.div>
        ))}
      </div>
    ),
  },
  {
    title: "Your records never left your hospital",
    body: "Only the AI's learned patterns — not patient scans, not names, not records — were shared between hospitals. Think of it like sharing a recipe, not the ingredients.",
    visual: (
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="flex items-center gap-4">
          {["A", "B", "C"].map((h, i) => (
            <motion.div key={h} className="flex flex-col items-center gap-1.5"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.1 }}>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "var(--bg-card2)", border: "1px solid var(--border)" }}>
                <span className="text-xs font-bold" style={{ color: "var(--teal)" }}>{h}</span>
              </div>
              <motion.div
                className="text-[10px] px-2 py-0.5 rounded"
                style={{ background: "#fb718520", color: "#fb7185", border: "1px solid #fb718840" }}
                animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 2, delay: i * 0.3 }}
              >
                raw data ✕
              </motion.div>
            </motion.div>
          ))}
          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>→</div>
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "var(--teal-glow)", border: "1px solid var(--teal)40" }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2l1.5 3 3.5.5-2.5 2.5.5 3.5L8 10l-3 1.5.5-3.5L3 5.5 6.5 5z" stroke="var(--teal)" strokeWidth="1.2" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
        <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>Only AI patterns travel — patient data stays put</div>
      </div>
    ),
  },
  {
    title: "You benefit from all 3 hospitals' expertise",
    body: "The combined AI model has seen far more cases than any single hospital could provide. You receive a more accurate analysis — powered by collaboration, protected by privacy.",
    visual: (
      <div className="flex flex-col items-center gap-4 py-4">
        <div className="flex items-center gap-3">
          {["A", "B", "C"].map((h, i) => (
            <div key={h} className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
              style={{ background: "var(--teal-glow)", border: "1px solid var(--teal)40", color: "var(--teal)" }}>
              {h}
            </div>
          ))}
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="w-px h-6" style={{ background: "var(--teal)" }} />
          <motion.div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: "var(--teal-glow)", border: "2px solid var(--teal)" }}
            animate={{ boxShadow: ["0 0 0 0 rgba(45,212,191,0.2)", "0 0 0 12px rgba(45,212,191,0)", "0 0 0 0 rgba(45,212,191,0)"] }}
            transition={{ repeat: Infinity, duration: 2 }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 3C7 3 3 7 3 12s4 9 9 9 9-4 9-9-4-9-9-9z" stroke="var(--teal)" strokeWidth="1.5"/>
              <path d="M12 8v4l3 3" stroke="var(--teal)" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </motion.div>
          <div className="text-xs font-medium" style={{ color: "var(--teal)" }}>Your AI analysis</div>
        </div>
      </div>
    ),
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const token = useAuthStore((s) => s.token);

  async function complete() {
    try {
      await apiFetch("/users/me", { method: "PATCH", body: JSON.stringify({ onboardingDone: true }) });
      if (user && token) setAuth({ ...user, onboardingDone: true } as any, token);
    } catch {}
    router.replace("/patient/scan");
  }

  const current = STEPS[step];

  return (
    <main className="flex-1 flex items-center justify-center p-6 min-h-screen">
      <div className="w-full max-w-md space-y-6">
        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2">
          {STEPS.map((_, i) => (
            <div key={i} className="h-1 rounded-full transition-all" style={{ width: i === step ? 32 : 16, background: i === step ? "var(--teal)" : "var(--border)" }} />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.28 }}
            className="rounded-2xl border p-6 space-y-4"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <div className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              {current.title}
            </div>
            {current.visual}
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {current.body}
            </p>
          </motion.div>
        </AnimatePresence>

        <div className="flex gap-3">
          <button
            onClick={complete}
            className="text-xs px-4 py-2 rounded-lg"
            style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
          >
            Skip
          </button>
          <button
            onClick={() => step < STEPS.length - 1 ? setStep(step + 1) : complete()}
            className="flex-1 rounded-lg text-sm font-semibold py-2.5"
            style={{ background: "var(--teal-dim)", color: "#0d1117" }}
          >
            {step < STEPS.length - 1 ? "Next →" : "Got it"}
          </button>
        </div>
      </div>
    </main>
  );
}

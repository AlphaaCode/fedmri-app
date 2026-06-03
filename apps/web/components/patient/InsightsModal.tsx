"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

function HospitalIcon() {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center relative"
        style={{ background: "rgba(45,212,191,0.08)", border: "1px solid rgba(45,212,191,0.25)" }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="9" width="18" height="12" rx="1" stroke="#2dd4bf" strokeWidth="1.5"/>
          <path d="M9 21V15a3 3 0 016 0v6" stroke="#2dd4bf" strokeWidth="1.5"/>
          <path d="M3 9L12 3l9 6" stroke="#2dd4bf" strokeWidth="1.5" strokeLinejoin="round"/>
        </svg>
        <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect x="2" y="4" width="6" height="5" rx="1" stroke="#2dd4bf" strokeWidth="1.2"/>
            <path d="M3.5 4V3a1.5 1.5 0 013 0v1" stroke="#2dd4bf" strokeWidth="1.2"/>
          </svg>
        </div>
      </div>
    </div>
  );
}

function Step1Visual() {
  return (
    <div className="flex items-end justify-center gap-6 py-4">
      {["A", "B", "C"].map((h, i) => (
        <motion.div key={h} className="flex flex-col items-center gap-2"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.15 }}>
          <HospitalIcon />
          <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>Hospital {h}</span>
        </motion.div>
      ))}
    </div>
  );
}

function Step2Visual() {
  return (
    <div className="py-4 flex items-center justify-center">
      <svg width="200" height="100" viewBox="0 0 200 100" fill="none">
        <rect x="2" y="35" width="36" height="28" rx="4" fill="rgba(45,212,191,0.08)" stroke="rgba(45,212,191,0.4)" strokeWidth="1.2"/>
        <text x="20" y="53" textAnchor="middle" fill="#2dd4bf" fontSize="11" fontWeight="600">A</text>
        <rect x="2" y="35" width="10" height="8" rx="1" fill="rgba(251,113,133,0.3)" stroke="rgba(251,113,133,0.5)" strokeWidth="0.8" transform="translate(0,-12)"/>
        <text x="7" y="27" textAnchor="middle" fill="#fb7185" fontSize="7">raw</text>

        <rect x="82" y="2" width="36" height="28" rx="4" fill="rgba(45,212,191,0.08)" stroke="rgba(45,212,191,0.4)" strokeWidth="1.2"/>
        <text x="100" y="20" textAnchor="middle" fill="#2dd4bf" fontSize="11" fontWeight="600">B</text>
        <rect x="82" y="2" width="10" height="8" rx="1" fill="rgba(251,113,133,0.3)" stroke="rgba(251,113,133,0.5)" strokeWidth="0.8" transform="translate(0,-10)"/>

        <rect x="162" y="35" width="36" height="28" rx="4" fill="rgba(45,212,191,0.08)" stroke="rgba(45,212,191,0.4)" strokeWidth="1.2"/>
        <text x="180" y="53" textAnchor="middle" fill="#2dd4bf" fontSize="11" fontWeight="600">C</text>

        {/* Central star node */}
        <circle cx="100" cy="65" r="14" fill="rgba(45,212,191,0.12)" stroke="rgba(45,212,191,0.6)" strokeWidth="1.5"/>
        <text x="100" y="70" textAnchor="middle" fill="#2dd4bf" fontSize="14">★</text>

        {/* Connections (dashed) */}
        <line x1="38" y1="52" x2="86" y2="65" stroke="#2dd4bf" strokeWidth="1" strokeDasharray="3,3" strokeOpacity="0.5"/>
        <line x1="100" y1="30" x2="100" y2="51" stroke="#2dd4bf" strokeWidth="1" strokeDasharray="3,3" strokeOpacity="0.5"/>
        <line x1="162" y1="52" x2="114" y2="65" stroke="#2dd4bf" strokeWidth="1" strokeDasharray="3,3" strokeOpacity="0.5"/>
      </svg>
    </div>
  );
}

function Step3Visual() {
  return (
    <div className="py-4 flex items-center justify-center">
      <svg width="180" height="80" viewBox="0 0 180 80" fill="none">
        <rect x="2" y="26" width="30" height="26" rx="4" fill="rgba(45,212,191,0.08)" stroke="rgba(45,212,191,0.4)" strokeWidth="1.2"/>
        <text x="17" y="43" textAnchor="middle" fill="#2dd4bf" fontSize="10" fontWeight="600">A</text>

        <rect x="148" y="26" width="30" height="26" rx="4" fill="rgba(45,212,191,0.08)" stroke="rgba(45,212,191,0.4)" strokeWidth="1.2"/>
        <text x="163" y="43" textAnchor="middle" fill="#2dd4bf" fontSize="10" fontWeight="600">B</text>

        <rect x="68" y="50" width="30" height="26" rx="4" fill="rgba(45,212,191,0.08)" stroke="rgba(45,212,191,0.4)" strokeWidth="1.2"/>
        <text x="83" y="67" textAnchor="middle" fill="#2dd4bf" fontSize="10" fontWeight="600">C</text>

        {/* Central check circle */}
        <circle cx="83" cy="22" r="16" fill="rgba(45,212,191,0.15)" stroke="#2dd4bf" strokeWidth="1.5"/>
        <path d="M76 22l5 5 8-9" stroke="#2dd4bf" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>

        <line x1="32" y1="36" x2="67" y2="25" stroke="#2dd4bf" strokeWidth="1" strokeOpacity="0.5"/>
        <line x1="148" y1="36" x2="99" y2="25" stroke="#2dd4bf" strokeWidth="1" strokeOpacity="0.5"/>
        <line x1="83" y1="38" x2="83" y2="50" stroke="#2dd4bf" strokeWidth="1" strokeOpacity="0.5"/>
      </svg>
    </div>
  );
}

const STEPS = [
  {
    title: "How it works",
    body: "Your scan is analyzed by an AI that has learned from thousands of cases across three world-class hospitals. Your personal information never leaves this facility.",
    visual: <Step1Visual />,
    banner: null,
  },
  {
    title: "How it learns",
    body: "The AI visits each hospital to learn patterns from scans. It only brings back the \"lessons learned\" to a central hub — never your actual medical images or identity.",
    visual: <Step2Visual />,
    banner: "AI TRAINED ACROSS 3 HOSPITALS — NO PATIENT DATA WAS EVER SHARED BETWEEN THEM",
  },
  {
    title: "Better together",
    body: "By combining insights from thousands of cases across our network, you receive the most accurate and up-to-date analysis possible — all without your data ever leaving this facility.",
    visual: <Step3Visual />,
    banner: "AI TRAINED ACROSS 3 HOSPITALS — NO PATIENT DATA WAS EVER SHARED BETWEEN THEM",
  },
];

interface Props {
  onDone: () => void;
}

export function InsightsModal({ onDone }: Props) {
  const [step, setStep] = useState(0);
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const setAuth = useAuthStore((s) => s.setAuth);

  async function complete() {
    try {
      await apiFetch("/users/me", { method: "PATCH", body: JSON.stringify({ onboardingDone: true }) });
      if (user && token) setAuth({ ...user, onboardingDone: true } as any, token);
    } catch {}
    onDone();
  }

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(5,10,14,0.85)", backdropFilter: "blur(4px)" }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        {current.banner && (
          <div className="px-4 py-2 text-center text-[10px] font-medium tracking-widest"
            style={{ background: "rgba(45,212,191,0.08)", color: "var(--teal)", borderBottom: "1px solid var(--border)" }}>
            {current.banner}
          </div>
        )}

        <div className="p-6 space-y-5">
          {/* Step dots */}
          <div className="flex items-center justify-center gap-1.5">
            {STEPS.map((_, i) => (
              <div key={i} className="rounded-full transition-all"
                style={{ width: i === step ? 28 : 10, height: 4, background: i === step ? "var(--teal)" : "var(--border)" }} />
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={step}
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}>
              {current.visual}
              <h2 className="text-xl font-bold text-center mt-2" style={{ color: "var(--text-primary)" }}>
                {current.title}
              </h2>
              <p className="text-sm text-center leading-relaxed mt-3" style={{ color: "var(--text-secondary)" }}>
                {current.body}
              </p>
            </motion.div>
          </AnimatePresence>

          <div className="space-y-2 pt-2">
            {isLast ? (
              <>
                <button onClick={complete}
                  className="w-full rounded-xl text-sm font-semibold py-3"
                  style={{ background: "var(--teal-dim)", color: "#0d1117" }}>
                  Get started
                </button>
                <button onClick={complete}
                  className="w-full rounded-xl text-sm py-2"
                  style={{ background: "var(--bg-card2)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                  Skip
                </button>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <button onClick={complete}
                  className="text-sm px-4 py-2"
                  style={{ color: "var(--text-secondary)" }}>
                  Skip
                </button>
                <button onClick={() => setStep((s) => s + 1)}
                  className="text-sm font-semibold px-6 py-2 rounded-lg flex items-center gap-2"
                  style={{ background: "var(--teal-dim)", color: "#0d1117" }}>
                  Next <span>→</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

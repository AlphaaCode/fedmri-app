"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuthStore } from "@/lib/auth-store";

async function apiRegister(email: string, password: string, name: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name, role: "PATIENT" }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Registration failed");
  return res.json();
}

async function apiLogin(email: string, password: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Login failed");
  return res.json();
}

// Patient-facing copy only — no FL jargon (per project invariant). We say
// "AI trained across 3 hospitals", never "federated learning".
const FEATURES = [
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="2" y="8" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M5.5 8V6a3.5 3.5 0 017 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    title: "Your scans stay private",
    desc: "Your images are analysed without ever leaving the hospital that holds them.",
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M5 9l2.5 2.5L13 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: "Trained across 3 hospitals",
    desc: "Your result is reviewed by an AI that learned from breast MRI scans at three hospitals.",
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M3 4.5h12M3 9h12M3 13.5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    title: "Results, explained simply",
    desc: "Plain-language explanations of what your result means — your care team stays in the loop.",
  },
];

export default function PatientRegisterPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) { setError("Please agree to the Terms and Privacy Policy."); return; }
    setError(null);
    setLoading(true);
    try {
      await apiRegister(form.email, form.password, form.name);
      const { accessToken, user } = await apiLogin(form.email, form.password);
      setAuth(user, accessToken);
      router.replace("/patient");
    } catch (e: any) {
      setError(e?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex">
      {/* Left — reassurance panel */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-10 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #050a0e 0%, #0d1117 60%, #0a1a1a 100%)" }}>
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: "linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px)",
          backgroundSize: "48px 48px", opacity: 0.12,
        }} />
        <div className="relative z-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/main_logo.svg" alt="FedMRI" style={{ width: "300px", height: "auto" }} />
        </div>
        <div className="relative z-10 space-y-6">
          <div>
            <h2 className="text-3xl font-bold leading-snug" style={{ color: "var(--text-primary)" }}>
              Your results,<br />kept private.
            </h2>
            <p className="text-sm mt-3 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Follow your breast MRI analysis securely. The AI was trained across three
              hospitals — and your scans are never shared.
            </p>
          </div>
          <div className="space-y-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-start gap-3">
                <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5"
                  style={{ background: "var(--teal-glow)", color: "var(--teal)", border: "1px solid #2dd4bf30" }}>
                  {f.icon}
                </div>
                <div>
                  <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{f.title}</div>
                  <div className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="relative z-10 text-[11px]" style={{ color: "var(--text-secondary)", opacity: 0.5 }}>
          © 2026 FedMRI — Your data, your consent
        </p>
      </div>

      {/* Right — form panel */}
      <div className="flex-1 flex items-center justify-center p-6" style={{ background: "var(--bg-base)" }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="w-full max-w-sm">
          <div className="lg:hidden mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/main_logo.svg" alt="FedMRI" className="h-12 w-auto object-contain" />
          </div>

          <div className="mb-6">
            <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Create your account</h1>
            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>Securely follow your breast MRI results</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            {[
              { label: "Full Name", key: "name", type: "text", placeholder: "Sara Benali" },
              { label: "Email", key: "email", type: "email", placeholder: "you@email.com" },
              { label: "Password", key: "password", type: "password", placeholder: "••••••••" },
            ].map(({ label, key, type, placeholder }) => (
              <div key={key}>
                <label className="text-xs uppercase tracking-widest block mb-1.5" style={{ color: "var(--text-secondary)" }}>{label}</label>
                <input
                  type={type}
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full rounded-lg text-sm px-3 py-2.5 outline-none"
                  style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                  required
                  autoComplete={key === "password" ? "new-password" : key === "email" ? "email" : "name"}
                />
              </div>
            ))}

            <label className="flex items-start gap-2.5 pt-1 cursor-pointer">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 accent-teal-400 shrink-0" />
              <span className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                I agree to the{" "}
                <span className="underline" style={{ color: "var(--teal)" }}>Terms of Use</span>{" "}and{" "}
                <span className="underline" style={{ color: "var(--teal)" }}>Privacy Policy</span>
              </span>
            </label>

            {error && (
              <div className="text-xs rounded-lg p-3" style={{ background: "#fb718515", color: "#fb7185", border: "1px solid #fb718830" }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading || !agreed}
              className="w-full rounded-lg text-sm font-semibold py-2.5 flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
              style={{ background: "var(--teal-dim)", color: "#0d1117" }}>
              {loading ? "Creating account…" : (<>Create Account <span>→</span></>)}
            </button>
          </form>

          <p className="text-center text-xs mt-4" style={{ color: "var(--text-secondary)" }}>
            Already have an account?{" "}
            <Link href="/login" className="underline" style={{ color: "var(--teal)" }}>Sign In</Link>
          </p>
          <p className="text-center text-[11px] mt-2" style={{ color: "var(--text-secondary)", opacity: 0.5 }}>
            Your data is encrypted and never shared without your consent.
          </p>
        </motion.div>
      </div>
    </main>
  );
}

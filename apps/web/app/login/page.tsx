"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import { apiLogin } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

function NeuralBrain() {
  return (
    <svg viewBox="0 0 420 420" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full max-w-xs mx-auto opacity-80">
      <defs>
        <radialGradient id="glow-center" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
        </radialGradient>
        <filter id="blur-sm"><feGaussianBlur stdDeviation="2.5" /></filter>
        <filter id="blur-xs"><feGaussianBlur stdDeviation="1" /></filter>
      </defs>
      {/* Glow backdrop */}
      <ellipse cx="210" cy="210" rx="140" ry="140" fill="url(#glow-center)" />
      {/* Brain outline — simplified lobes */}
      <path d="M210 90 C160 70 110 100 105 150 C95 185 115 210 105 240 C95 270 110 310 150 320 C170 330 195 320 210 325 C225 320 250 330 270 320 C310 310 325 270 315 240 C305 210 325 185 315 150 C310 100 260 70 210 90Z"
        stroke="#2dd4bf" strokeWidth="1.5" strokeOpacity="0.5" fill="none" />
      {/* Neural network nodes */}
      {[
        [210,120],[170,150],[250,150],[140,200],[210,195],[280,200],
        [160,250],[210,265],[260,250],[190,310],[230,310]
      ].map(([cx,cy],i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="5" fill="#0d1117" stroke="#2dd4bf" strokeWidth="1.5" strokeOpacity="0.9" />
          <circle cx={cx} cy={cy} r="9" fill="#2dd4bf" fillOpacity="0.08" />
        </g>
      ))}
      {/* Connections */}
      {[
        [210,120,170,150],[210,120,250,150],
        [170,150,140,200],[170,150,210,195],[250,150,210,195],[250,150,280,200],
        [140,200,160,250],[210,195,160,250],[210,195,210,265],[210,195,260,250],
        [280,200,260,250],[160,250,190,310],[210,265,190,310],[210,265,230,310],[260,250,230,310]
      ].map(([x1,y1,x2,y2],i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#2dd4bf" strokeWidth="0.8" strokeOpacity="0.3" />
      ))}
      {/* Animated pulse on center node */}
      <circle cx="210" cy="195" r="12" fill="none" stroke="#2dd4bf" strokeWidth="1" strokeOpacity="0.4">
        <animate attributeName="r" values="9;18;9" dur="3s" repeatCount="indefinite" />
        <animate attributeName="stroke-opacity" values="0.5;0;0.5" dur="3s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { accessToken, user } = await apiLogin(email, password);
      setAuth(user, accessToken);
      if (user.role === "DOCTOR") router.replace("/doctor");
      else if (user.role === "PATIENT") router.replace("/patient");
      else if (user.role === "RESEARCHER") router.replace("/researcher");
      else setError("Unknown role — contact support.");
    } catch (e: any) {
      setError(e?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex">
      {/* Left — brand panel */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-10 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #050a0e 0%, #0d1117 60%, #0a1a1a 100%)" }}>
        {/* Grid overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: "linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px)",
          backgroundSize: "48px 48px", opacity: 0.12,
        }} />
        {/* Logo */}
        <div className="relative z-10 flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/main_logo.svg" alt="FedMRI" className="h-14 w-auto object-contain" />
        </div>
        {/* Brain illustration */}
        <div className="relative z-10 flex-1 flex items-center justify-center py-8">
          <NeuralBrain />
        </div>
        {/* Bottom copy */}
        <div className="relative z-10">
          <h2 className="text-2xl font-bold leading-snug" style={{ color: "var(--text-primary)" }}>
            Federated Medical<br />Intelligence.
          </h2>
          <p className="text-sm mt-2 leading-relaxed max-w-xs" style={{ color: "var(--text-secondary)" }}>
            Train visual diagnostic models across distributed hospital
            networks without compromising patient data privacy.
          </p>
        </div>
      </div>

      {/* Right — auth panel */}
      <div className="flex-1 flex items-center justify-center p-6"
        style={{ background: "var(--bg-base)" }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-sm"
        >
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/main_logo.svg" alt="FedMRI" className="h-12 w-auto object-contain" />
          </div>

          <div className="mb-7">
            <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Welcome Back</h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
              Secure access to your federated medical node.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-widest block mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Institutional Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="doctor@hospital.edu"
                className="w-full rounded-lg text-sm px-3 py-2.5 outline-none transition-colors"
                style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                required
                autoFocus
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
                  Node Password
                </label>
                <span className="text-[11px] cursor-default" style={{ color: "var(--teal)" }}>Forgot password?</span>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg text-sm px-3 py-2.5 outline-none"
                style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                required
              />
            </div>

            {error && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="text-xs rounded-lg p-3"
                style={{ background: "#fb718515", color: "#fb7185", border: "1px solid #fb718830" }}>
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg text-sm font-semibold py-2.5 flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
              style={{ background: "var(--teal-dim)", color: "#0d1117" }}
            >
              {loading ? "Signing in…" : (<>Sign In <span>→</span></>)}
            </button>
          </form>

          <p className="text-center text-xs mt-5" style={{ color: "var(--text-secondary)" }}>
            Don't have an account?{" "}
            <Link href="/patient/register" className="underline" style={{ color: "var(--teal)" }}>
              Request access
            </Link>
          </p>

          <p className="text-center text-[11px] mt-8 leading-relaxed" style={{ color: "var(--text-secondary)", opacity: 0.6 }}>
            Your healthcare data remains encrypted and decentralised.
            No patient data is shared between nodes without cryptographic consent.
          </p>
        </motion.div>
      </div>
    </main>
  );
}

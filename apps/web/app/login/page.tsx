"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import dynamic from "next/dynamic";
import { apiLogin } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

const LoginScene3D = dynamic(
  () => import("@/components/scene/LoginScene3D").then((m) => m.LoginScene3D),
  { ssr: false }
);

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
        {/* 3D scene */}
        <div className="relative z-10 flex-1 w-full min-h-[300px]">
          <LoginScene3D />
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

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { apiLogin } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState("dr.benali@fedmri.local");
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
      if (user.role === "DOCTOR") {
        router.replace("/doctor/scan");
      } else if (user.role === "PATIENT") {
        router.replace("/patient/chat");
      } else if (user.role === "RESEARCHER") {
        router.replace("/researcher");
      } else {
        setError("Unknown role — contact support.");
      }
    } catch (e: any) {
      setError(e?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center p-6 min-h-screen">
      {/* Background grid */}
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
        opacity: 0.15,
      }} />

      <motion.form
        onSubmit={onSubmit}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative w-full max-w-sm rounded-2xl border p-8 space-y-6"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        {/* Logo mark */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "var(--teal-glow)", border: "1px solid var(--teal)40" }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="4" stroke="var(--teal)" strokeWidth="1.5"/>
              <circle cx="9" cy="9" r="1.5" fill="var(--teal)"/>
              <path d="M2 9h2M14 9h2M9 2v2M9 14v2" stroke="var(--teal)" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div className="text-base font-bold" style={{ color: "var(--text-primary)" }}>FedMRI</div>
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>Doctor portal</div>
          </div>
        </div>

        <div>
          <div className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Sign in</div>
          <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            Access the federated MRI analysis platform
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs uppercase tracking-widest block mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg text-sm px-3 py-2.5 outline-none transition-colors"
              style={{
                background: "var(--bg-base)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
              required
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest block mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg text-sm px-3 py-2.5 outline-none"
              style={{
                background: "var(--bg-base)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
              required
            />
          </div>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs rounded-lg p-3"
            style={{ background: "#fb718515", color: "#fb7185", border: "1px solid #fb718830" }}
          >
            {error}
          </motion.div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg text-sm font-semibold py-2.5 transition-opacity disabled:opacity-50"
          style={{ background: "var(--teal-dim)", color: "#0d1117" }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>

        <div className="text-center text-[11px]" style={{ color: "var(--text-secondary)" }}>
          AI trained across 3 hospitals — your data never leaves your institution
        </div>
      </motion.form>
    </main>
  );
}

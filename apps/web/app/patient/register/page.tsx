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

export default function PatientRegisterPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiRegister(form.email, form.password, form.name);
      const { accessToken, user } = await apiLogin(form.email, form.password);
      setAuth(user, accessToken);
      router.replace("/patient/onboarding");
    } catch (e: any) {
      setError(e?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center p-6 min-h-screen">
      <div className="fixed inset-0 pointer-events-none" style={{ backgroundImage: "linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px)", backgroundSize: "48px 48px", opacity: 0.15 }} />
      <motion.form
        onSubmit={onSubmit}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-sm rounded-2xl border p-8 space-y-5"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div>
          <div className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Create account</div>
          <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            Access AI-powered breast MRI analysis
          </div>
        </div>

        {[
          { label: "Full name", key: "name", type: "text" },
          { label: "Email", key: "email", type: "email" },
          { label: "Password", key: "password", type: "password" },
        ].map(({ label, key, type }) => (
          <div key={key}>
            <label className="text-xs uppercase tracking-widest block mb-1.5" style={{ color: "var(--text-secondary)" }}>{label}</label>
            <input
              type={type}
              value={form[key as keyof typeof form]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              className="w-full rounded-lg text-sm px-3 py-2.5 outline-none"
              style={{ background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              required
            />
          </div>
        ))}

        {error && (
          <div className="text-xs rounded-lg p-3" style={{ background: "#fb718515", color: "#fb7185", border: "1px solid #fb718830" }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg text-sm font-semibold py-2.5 disabled:opacity-50"
          style={{ background: "var(--teal-dim)", color: "#0d1117" }}
        >
          {loading ? "Creating account…" : "Create account"}
        </button>

        <p className="text-center text-xs" style={{ color: "var(--text-secondary)" }}>
          Already have an account?{" "}
          <Link href="/login" className="underline" style={{ color: "var(--teal)" }}>Sign in</Link>
        </p>
      </motion.form>
    </main>
  );
}

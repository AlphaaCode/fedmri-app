"use client";

import { useAuthStore } from "@/lib/auth-store";

export default function PatientSettingsPage() {
  const user = useAuthStore((s) => s.user);
  return (
    <div className="w-full space-y-4 p-1">
      <div>
        <h1 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Settings</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Manage your account and privacy preferences</p>
      </div>
      <div className="rounded-xl border p-5 space-y-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="text-xs uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>Account</div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
            style={{ background: "var(--teal-glow)", color: "var(--teal)", border: "1px solid rgba(45,212,191,0.3)" }}>
            {user?.name?.[0]?.toUpperCase() ?? "P"}
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{user?.name}</div>
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{user?.email}</div>
          </div>
        </div>
      </div>
      <div className="rounded-xl border p-5" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="text-xs uppercase tracking-widest mb-3" style={{ color: "var(--text-secondary)" }}>Privacy</div>
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Your scan data is stored locally and is never shared with other hospitals.
          Only anonymised AI model weights are exchanged — never your images or identity.
        </p>
      </div>
    </div>
  );
}

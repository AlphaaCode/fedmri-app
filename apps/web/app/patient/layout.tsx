"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";

export default function PatientLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!useAuthStore.getState().token) router.replace("/login");
    }, 120);
    return () => clearTimeout(t);
  }, [token, router]);

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className="border-b px-6 py-3 flex items-center justify-between shrink-0"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--teal-glow)", border: "1px solid var(--teal)40" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="3" stroke="var(--teal)" strokeWidth="1.2"/>
              <circle cx="7" cy="7" r="1.2" fill="var(--teal)"/>
            </svg>
          </div>
          <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>FedMRI</div>
          <div className="w-px h-4 mx-1" style={{ background: "var(--border)" }} />
          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>Patient Portal</div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{user?.name ?? "Patient"}</div>
          <button
            type="button"
            onClick={() => { clear(); router.replace("/login"); }}
            className="text-xs px-3 py-1 rounded-lg"
            style={{ background: "var(--bg-card2)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

"use client";

import { ReactNode, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";

const NAV = [
  { href: "/patient/scan", label: "Scan" },
  { href: "/patient/results", label: "Results" },
  { href: "/patient/chat", label: "Ask AI" },
];

export default function PatientLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);

  useEffect(() => {
    // Skip auth checks for register page
    if (pathname?.includes("register")) return;
    const t = setTimeout(() => {
      const { token: tok, user: u } = useAuthStore.getState();
      if (!tok) { router.replace("/login"); return; }
      // Redirect to onboarding if not done (skip for onboarding page itself)
      if (u && !(u as any).onboardingDone && !pathname?.includes("onboarding")) {
        router.replace("/patient/onboarding");
      }
    }, 120);
    return () => clearTimeout(t);
  }, [token, pathname, router]);

  const isOnboarding = pathname?.includes("onboarding");

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b px-5 py-3 flex items-center justify-between shrink-0"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3">
          <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>FedMRI</div>
          <div className="w-px h-4" style={{ background: "var(--border)" }} />
          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>Patient Portal</div>
          {!isOnboarding && (
            <nav className="ml-4 flex items-center gap-1">
              {NAV.map((item) => {
                const active = pathname?.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href}
                    className="text-xs px-3 py-1 rounded-lg transition-colors"
                    style={{
                      background: active ? "var(--teal-glow)" : "transparent",
                      color: active ? "var(--teal)" : "var(--text-secondary)",
                      border: "1px solid " + (active ? "var(--teal)40" : "transparent"),
                    }}>
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{user?.name}</div>
          <button onClick={() => { clear(); router.replace("/login"); }}
            className="text-xs px-3 py-1 rounded-lg"
            style={{ background: "var(--bg-card2)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
            Sign out
          </button>
        </div>
      </header>

      {/* AI info banner — no FL jargon, invariant #5 */}
      {!isOnboarding && (
        <div className="px-5 py-2 text-[11px] flex items-center gap-2" style={{ background: "var(--teal-glow)", color: "#99f6e4", borderBottom: "1px solid var(--border)" }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M6 4v4M6 3h.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          AI trained across 3 hospitals — no patient data was ever shared between them
        </div>
      )}

      <main className="flex-1">{children}</main>
    </div>
  );
}

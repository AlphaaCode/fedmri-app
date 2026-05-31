"use client";

import { ReactNode, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { useAuthStore } from "@/lib/auth-store";
import { usePortalChrome } from "@/lib/portal-chrome";

export interface NavItem { href: string; label: string; icon: LucideIcon; }
export interface FooterItem { label: string; icon: LucideIcon; href?: string; onClick?: () => void; }
export interface ShellIdentity { title: string; subtitle?: string; status?: "ok" | "active" | "idle"; icon?: ReactNode; }

function BrandMark() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo-mark.png" alt="FedMRI" className="w-full h-full object-contain" />;
}

const ROLE_HOME: Record<string, string> = {
  DOCTOR: "/doctor/scan",
  PATIENT: "/patient/chat",
  RESEARCHER: "/researcher",
};

export function PortalShell({ identity, nav, footerNav, primaryAction, headerStatus, requiredRole, children }: {
  identity: ShellIdentity;
  nav: NavItem[];
  footerNav?: FooterItem[];
  primaryAction?: { label: string; href: string; icon?: LucideIcon };
  headerStatus?: ReactNode;
  requiredRole?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const chromeTitle = usePortalChrome((s) => s.title);

  useEffect(() => {
    const t = setTimeout(() => {
      const { token: tok, user: u } = useAuthStore.getState();
      if (!tok) { router.replace("/login"); return; }
      // Enforce the portal's role: send mismatched users to their own portal.
      if (requiredRole && u && u.role !== requiredRole) {
        router.replace(ROLE_HOME[u.role] ?? "/login");
      }
    }, 120);
    return () => clearTimeout(t);
  }, [token, router, requiredRole]);

  const statusColor =
    identity.status === "active" ? "var(--amber)" :
    identity.status === "ok" ? "var(--teal)" : "var(--text-secondary)";

  const footerItemClass = "flex items-center gap-3 rounded-lg px-3 py-2 text-sm w-full transition-colors text-left";

  return (
    <div className="min-h-screen flex">
      <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="px-4 py-4 flex items-center gap-3 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 overflow-hidden" style={{ background: "var(--bg-card2)", border: "1px solid var(--border)" }}>
            {identity.icon ?? <BrandMark />}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{identity.title}</div>
            {identity.subtitle && (
              <div className="text-[11px] flex items-center gap-1.5 truncate" style={{ color: "var(--text-secondary)" }}>
                {identity.status && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: statusColor }} />}
                {identity.subtitle}
              </div>
            )}
          </div>
        </div>

        {primaryAction && (
          <div className="px-4 pt-4">
            <Link href={primaryAction.href} className="flex items-center justify-center gap-2 rounded-lg text-sm font-semibold py-2.5 w-full" style={{ background: "var(--teal-dim)", color: "#0d1117" }}>
              {primaryAction.icon && <primaryAction.icon size={16} />}
              {primaryAction.label}
            </Link>
          </div>
        )}

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {nav.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
                style={{
                  background: active ? "var(--teal-glow)" : "transparent",
                  color: active ? "var(--teal)" : "var(--text-secondary)",
                  border: "1px solid " + (active ? "#2dd4bf40" : "transparent"),
                }}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {footerNav && footerNav.length > 0 && (
          <div className="px-3 py-3 space-y-1 border-t" style={{ borderColor: "var(--border)" }}>
            {footerNav.map((item) => {
              const Icon = item.icon;
              return item.href ? (
                <Link key={item.label} href={item.href} className={footerItemClass} style={{ color: "var(--text-secondary)" }}>
                  <Icon size={16} />{item.label}
                </Link>
              ) : (
                <button key={item.label} type="button" onClick={item.onClick} className={footerItemClass} style={{ color: "var(--text-secondary)" }}>
                  <Icon size={16} />{item.label}
                </button>
              );
            })}
          </div>
        )}
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 border-b px-5 flex items-center justify-between" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{chromeTitle}</div>
          <div className="flex items-center gap-4">
            {headerStatus}
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{user?.name}</div>
          </div>
        </header>

        <motion.main initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="flex-1 p-5 md:p-6 overflow-y-auto">
          {children}
        </motion.main>
      </div>
    </div>
  );
}

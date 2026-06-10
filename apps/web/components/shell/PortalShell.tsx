"use client";

import { ReactNode, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { useAuthStore } from "@/lib/auth-store";
import { usePortalChrome } from "@/lib/portal-chrome";
import { cn } from "@/lib/cn";
import { pageEnter, animateInProps } from "@/lib/anim";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export interface NavItem { href: string; label: string; icon: LucideIcon; }
export interface FooterItem { label: string; icon: LucideIcon; href?: string; onClick?: () => void; }
export interface ShellIdentity { title: string; subtitle?: string; status?: "ok" | "active" | "idle"; icon?: ReactNode; }



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

  // Longest-matching-href wins across BOTH main nav and footer nav, so index
  // items (/doctor, /researcher) no longer read active on every sub-route, and a
  // footer route (e.g. /doctor/docs) resolves to its footer item rather than
  // falling back to the index.
  const activeHref = [...nav, ...(footerNav ?? [])].reduce<string | null>((best, item) => {
    const href = item.href;
    if (!href) return best;
    const matches = pathname === href || (pathname?.startsWith(href + "/") ?? false);
    if (!matches) return best;
    return !best || href.length > best.length ? href : best;
  }, null);

  useEffect(() => {
    const t = setTimeout(() => {
      const { token: tok, user: u } = useAuthStore.getState();
      if (!tok) { router.replace("/login"); return; }
      // Wrong role: send to login so user can authenticate with the right account.
      // (Redirecting to the current user's portal home is confusing when navigating
      // directly to a different portal's URL.)
      if (requiredRole && u && u.role !== requiredRole) {
        router.replace("/login");
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
      <AuroraBackground />
      <aside className="glass hidden lg:flex w-60 shrink-0 flex-col border-r relative z-10" style={{ borderColor: "var(--border)" }}>
        <div className="px-4 py-4 flex items-center gap-3 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex flex-col gap-1 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/main_logo.svg" alt="FedMRI" style={{ width: "180px", height: "auto" }} className="object-contain object-left" />
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
            <Link href={primaryAction.href} className="btn-press flex items-center justify-center gap-2 rounded-lg text-sm font-semibold py-2.5 w-full" style={{ background: "var(--teal-dim)", color: "#0d1117" }}>
              {primaryAction.icon && <primaryAction.icon size={16} />}
              {primaryAction.label}
            </Link>
          </div>
        )}

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {nav.map((item) => {
            const active = item.href === activeHref;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
                style={{ color: active ? "var(--teal)" : "var(--text-secondary)" }}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-lg"
                    style={{ background: "var(--teal-glow)", border: "1px solid #2dd4bf40" }}
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <Icon size={16} className="relative z-10" />
                <span className="relative z-10">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {footerNav && footerNav.length > 0 && (
          <div className="px-3 py-3 space-y-1 border-t" style={{ borderColor: "var(--border)" }}>
            {footerNav.map((item) => {
              const Icon = item.icon;
              const active = item.href != null && item.href === activeHref;
              return item.href ? (
                <Link key={item.label} href={item.href} className={cn(footerItemClass, "relative")}
                  style={{ color: active ? "var(--teal)" : "var(--text-secondary)" }}>
                  {active && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 rounded-lg"
                      style={{ background: "var(--teal-glow)", border: "1px solid #2dd4bf40" }}
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                  <Icon size={16} className="relative z-10" /><span className="relative z-10">{item.label}</span>
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

      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <header className="glass h-14 shrink-0 border-b px-5 flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
          <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{chromeTitle}</div>
          <div className="flex items-center gap-4">
            {headerStatus}
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{user?.name}</div>
            <ThemeToggle />
          </div>
        </header>

        <motion.main
          key={pathname}
          variants={pageEnter}
          {...animateInProps}
          className="flex-1 w-full p-5 md:p-6 overflow-y-auto"
        >
          {children}
        </motion.main>
      </div>
    </div>
  );
}

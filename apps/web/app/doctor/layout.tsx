"use client";

import { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, ScanLine, MessageSquare, BarChart3, History, Settings, BookOpen, HelpCircle, LogOut } from "lucide-react";
import { PortalShell } from "@/components/shell/PortalShell";
import { FlPhaseBadge } from "@/components/doctor/FlPhaseBadge";
import { useAuthStore } from "@/lib/auth-store";

export default function DoctorLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const clear = useAuthStore((s) => s.clear);

  return (
    <PortalShell
      requiredRole="DOCTOR"
      identity={{ title: "Hospital Silo", subtitle: "Active · data stays here", status: "ok" }}
      primaryAction={{ label: "New Scan", href: "/doctor/scan", icon: ScanLine }}
      headerStatus={<FlPhaseBadge />}
      nav={[
        { href: "/doctor", label: "Dashboard", icon: LayoutDashboard },
        { href: "/doctor/scan", label: "Scan Analysis", icon: ScanLine },
        { href: "/doctor/chat", label: "AI Assistant", icon: MessageSquare },
        { href: "/doctor/model", label: "Model Performance", icon: BarChart3 },
        { href: "/doctor/history", label: "Medical History", icon: History },
        { href: "/doctor/settings", label: "Settings", icon: Settings },
      ]}
      footerNav={[
        { href: "/doctor/docs", label: "Documentation", icon: BookOpen },
        { href: "/doctor/support", label: "Support", icon: HelpCircle },
        { label: "Logout", icon: LogOut, onClick: () => { clear(); router.replace("/login"); } },
      ]}
    >
      {children}
    </PortalShell>
  );
}

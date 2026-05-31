"use client";

import { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Share2, Database, BarChart3, HelpCircle, Settings, ScrollText, LogOut } from "lucide-react";
import { PortalShell } from "@/components/shell/PortalShell";
import { useAuthStore } from "@/lib/auth-store";

export default function ResearcherLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const clear = useAuthStore((s) => s.clear);

  return (
    <PortalShell
      requiredRole="RESEARCHER"
      identity={{ title: "Node Alpha-7", subtitle: "Synchronized", status: "ok" }}
      nav={[
        { href: "/researcher", label: "Models", icon: BarChart3 },
        { href: "/researcher/topology", label: "Network Topology", icon: Share2 },
        { href: "/researcher/datasets", label: "Datasets", icon: Database },
        { href: "/researcher/support", label: "Support", icon: HelpCircle },
        { href: "/researcher/settings", label: "Settings", icon: Settings },
      ]}
      footerNav={[
        { href: "/researcher/logs", label: "System Logs", icon: ScrollText },
        { label: "Logout", icon: LogOut, onClick: () => { clear(); router.replace("/login"); } },
      ]}
    >
      {children}
    </PortalShell>
  );
}

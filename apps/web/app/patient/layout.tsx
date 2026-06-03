"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, ScanLine, MessageSquare, FileText, Settings, HelpCircle, LogOut } from "lucide-react";
import { PortalShell } from "@/components/shell/PortalShell";
import { InsightsModal } from "@/components/patient/InsightsModal";
import { useAuthStore } from "@/lib/auth-store";

export default function PatientLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const clear = useAuthStore((s) => s.clear);
  const user = useAuthStore((s) => s.user);
  const [showInsights, setShowInsights] = useState(false);

  // Show insights modal for patients who haven't completed onboarding
  useEffect(() => {
    const t = setTimeout(() => {
      const { user: u } = useAuthStore.getState();
      if (u?.role === "PATIENT" && !(u as any).onboardingDone) {
        setShowInsights(true);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [user]);

  return (
    <>
      <PortalShell
        requiredRole="PATIENT"
        identity={{ title: "FedMRI", subtitle: "AI trained across 3 hospitals", status: "ok" }}
        primaryAction={{ label: "New Scan", href: "/patient/scan", icon: ScanLine }}
        nav={[
          { href: "/patient", label: "Dashboard", icon: LayoutDashboard },
          { href: "/patient/scan", label: "Scan Analysis", icon: ScanLine },
          { href: "/patient/chat", label: "AI Assistant", icon: MessageSquare },
          { href: "/patient/results", label: "My Results", icon: FileText },
          { href: "/patient/settings", label: "Settings", icon: Settings },
        ]}
        footerNav={[
          { href: "/patient/support", label: "Support", icon: HelpCircle },
          { label: "Log Out", icon: LogOut, onClick: () => { clear(); router.replace("/login"); } },
        ]}
      >
        {children}
      </PortalShell>

      {showInsights && <InsightsModal onDone={() => setShowInsights(false)} />}
    </>
  );
}

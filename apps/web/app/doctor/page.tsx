"use client";

import { usePortalTitle } from "@/lib/use-portal-title";
import { PageHeader } from "@/components/ui/PageHeader";
import { DoctorSiloBanner } from "@/components/doctor/DoctorSiloBanner";

export default function DoctorDashboardPage() {
  usePortalTitle("Dashboard");
  return (
    <div className="space-y-4">
      <DoctorSiloBanner />
      <PageHeader title="Clinical Overview" description="Federated diagnostics — your hospital silo" />
      <div className="text-sm" style={{ color: "var(--text-secondary)" }}>Dashboard panels land in Task 2.</div>
    </div>
  );
}

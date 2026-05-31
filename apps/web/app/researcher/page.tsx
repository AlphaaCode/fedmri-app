"use client";

import { usePortalTitle } from "@/lib/use-portal-title";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Panel } from "@/components/ui/Panel";

export default function ResearcherHome() {
  usePortalTitle("MRI Federated Core");
  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Global Model Performance"
        description="Federated DINOv2-MIL · aggregate metrics across all hospital nodes"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Model Version" value="v10" accent="var(--teal)" hint="FedProx" />
        <StatCard label="F1 Macro" value="0.41" accent="var(--teal)" />
        <StatCard label="FL Rounds" value="10" accent="var(--blue-accent)" />
        <StatCard label="Raw Data Sent" value="0 B" accent="var(--teal)" hint="Privacy preserved" />
      </div>
      <Panel title="Researcher portal" subtitle="Full screens land in Phase B">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Foundation shell is live. Network Topology, Datasets, Models, System Logs, Support,
          and Settings arrive in Phase B and read aggregate / model-level data only — no raw images.
        </p>
      </Panel>
    </div>
  );
}

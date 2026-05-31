"use client";

import { useRouter } from "next/navigation";
import { usePortalTitle } from "@/lib/use-portal-title";
import { useAuthStore } from "@/lib/auth-store";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Button } from "@/components/ui/Button";

// ─── Label/value row ──────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
      <SectionLabel className="shrink-0 pt-0.5">{label}</SectionLabel>
      <span
        className="text-sm text-right"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Demo toggle row ──────────────────────────────────────────────────────────

function ToggleRow({ label, defaultOn = false }: { label: string; defaultOn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2">
        <span className="text-sm" style={{ color: "var(--text-primary)" }}>{label}</span>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded border"
          style={{
            color: "var(--text-secondary)",
            borderColor: "var(--border)",
            background: "var(--bg-card2)",
          }}
        >
          demo
        </span>
      </div>
      {/* Static visual toggle */}
      <div
        className="relative w-9 h-5 rounded-full flex-shrink-0 cursor-not-allowed"
        style={{
          background: defaultOn ? "var(--teal-dim)" : "var(--bg-card2)",
          border: "1px solid var(--border)",
        }}
        title="Non-functional in demo"
        aria-hidden
      >
        <span
          className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
          style={{
            left: defaultOn ? "calc(100% - 18px)" : "2px",
            background: defaultOn ? "var(--teal)" : "var(--text-secondary)",
            opacity: 0.7,
          }}
        />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  usePortalTitle("Settings");

  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);

  const apiUrl =
    typeof window !== "undefined"
      ? (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001")
      : "http://localhost:3001";

  function handleSignOut() {
    clear();
    router.replace("/login");
  }

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader
        title="Settings"
        description="Node and account configuration."
      />

      {/* ── Identity ── */}
      <Panel title="Identity">
        <InfoRow label="Node" value="Node Alpha-7" />
        <InfoRow label="Operator" value={user?.name ?? "—"} />
        <InfoRow label="Email" value={user?.email ?? "—"} />
      </Panel>

      {/* ── Role ── */}
      <Panel title="Role">
        <InfoRow label="Assigned role" value={user?.role ?? "—"} />
      </Panel>

      {/* ── Network ── */}
      <Panel title="Network">
        <InfoRow label="API Endpoint" value={apiUrl} />
        <InfoRow label="Inference mode" value="mock" />
        <InfoRow label="FL mode" value="mock" />
      </Panel>

      {/* ── Notifications ── */}
      <Panel title="Notifications" subtitle="Alert preferences — read-only in demo.">
        <ToggleRow label="Email alerts on round completion" defaultOn={true} />
        <ToggleRow label="Telemetry reporting" defaultOn={false} />
      </Panel>

      {/* ── Sign out ── */}
      <Panel title="Session">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Signing out clears your local session token and returns you to the
            login screen.
          </p>
          <Button
            variant="coral"
            className="shrink-0 text-sm px-4 py-2"
            onClick={handleSignOut}
          >
            Sign out
          </Button>
        </div>
      </Panel>
    </div>
  );
}

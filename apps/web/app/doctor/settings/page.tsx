"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { usePortalTitle } from "@/lib/use-portal-title";
import { useAuthStore } from "@/lib/auth-store";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";

const DemoTag = () => (
  <span
    className="text-[10px] px-1.5 py-0.5 rounded border shrink-0"
    style={{ color: "var(--text-secondary)", borderColor: "var(--border)", background: "var(--bg-card2)" }}
  >
    demo
  </span>
);

function Toggle({ defaultOn = false }: { defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      type="button"
      onClick={() => setOn((v) => !v)}
      aria-pressed={on}
      className="relative w-9 h-5 rounded-full shrink-0 transition-colors"
      style={{ background: on ? "var(--teal-dim)" : "var(--bg-card2)", border: "1px solid var(--border)" }}
    >
      <span
        className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
        style={{ left: on ? "calc(100% - 18px)" : "2px", background: on ? "var(--teal)" : "var(--text-secondary)", opacity: 0.85 }}
      />
    </button>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
      <div className="min-w-0">
        <div className="text-sm" style={{ color: "var(--text-primary)" }}>{label}</div>
        {hint && <div className="text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>{hint}</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0">{children}</div>
    </div>
  );
}

function Gauge({ pct, label }: { pct: number; label: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1" style={{ color: "var(--text-secondary)" }}>
        <span>{label}</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-base)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--teal)" }} />
      </div>
    </div>
  );
}

export default function DoctorSettingsPage() {
  usePortalTitle("Settings");
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const [intensity, setIntensity] = useState(65);
  const [revealKey, setRevealKey] = useState(false);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const initial = (user?.name ?? "D").trim().charAt(0).toUpperCase();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Portal Configuration"
        description="Manage your clinical identity, AI processing preferences, and federated learning node status."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        <Panel title="Identity" action={<button type="button" className="text-xs" style={{ color: "var(--teal)" }} title="Non-functional in demo">Edit profile</button>}>
          <div className="flex flex-col items-center text-center pt-1 pb-2">
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold mb-3" style={{ background: "var(--teal-glow)", color: "var(--teal)", border: "1px solid #2dd4bf40" }}>
              {initial}
            </div>
            <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{user?.name ?? "Doctor"}</div>
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{user?.email ?? "—"}</div>
          </div>
          <Row label="License ID" hint="MED-90283-DT"><DemoTag /></Row>
          <Row label="Specialty" hint="Radiology · Hospital A"><DemoTag /></Row>
          <Row label="Role"><span className="text-sm" style={{ color: "var(--teal)" }}>{user?.role ?? "DOCTOR"}</span></Row>
        </Panel>

        <Panel title="Clinical Preferences" subtitle="How AI results are displayed and processed.">
          <Row label="Default MRI slice viewer">
            <select className="text-sm rounded-lg px-2 py-1 outline-none" style={{ background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--border)" }} defaultValue="Axial">
              <option>Axial</option>
              <option>Sagittal</option>
              <option>Coronal</option>
            </select>
            <DemoTag />
          </Row>
          <div className="py-2.5 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>Attention map intensity</span>
              <span className="text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>{intensity}%</span>
            </div>
            <input type="range" min={0} max={100} value={intensity} onChange={(e) => setIntensity(+e.target.value)} className="w-full accent-teal-400" />
          </div>
          <Row label="Automatic report generation" hint="Draft a structured report when confidence is high.">
            <Toggle defaultOn />
            <DemoTag />
          </Row>
        </Panel>
      </div>

      <Panel
        title="Federated Node Configuration"
        subtitle="Your hospital's participation in the global model."
        action={
          <span className="text-[11px] px-2 py-1 rounded-full inline-flex items-center gap-1.5" style={{ background: "var(--teal-glow)", color: "var(--teal)", border: "1px solid #2dd4bf40" }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--teal)" }} />
            ROUND 10 / 10
          </span>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
          <div>
            <Row label="Node"><span className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>Node Alpha-7</span></Row>
            <Row label="API endpoint"><span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>{apiUrl}</span></Row>
            <Row label="Inference / FL mode"><span className="text-sm" style={{ color: "var(--text-primary)" }}>mock</span></Row>
          </div>
          <div className="space-y-3 py-2.5">
            <Gauge pct={62} label="Local storage used" />
            <Gauge pct={88} label="Training contribution" />
            <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-secondary)" }}>
              <DemoTag /> Storage &amp; contribution are illustrative.
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Security &amp; Authentication">
          <Row label="Institutional access key">
            <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>{revealKey ? "FMRI-7Q2K-90283-DT" : "••••-••••-•••••"}</span>
            <button type="button" className="text-xs" style={{ color: "var(--teal)" }} onClick={() => setRevealKey((r) => !r)}>{revealKey ? "Hide" : "Reveal"}</button>
            <DemoTag />
          </Row>
          <Row label="Two-factor authentication" hint="Hardware token (FIDO2).">
            <Toggle defaultOn />
            <DemoTag />
          </Row>
        </Panel>

        <Panel title="Communication Alerts">
          <Row label="New study uploads"><Toggle defaultOn /><DemoTag /></Row>
          <Row label="Consensus reached alerts"><Toggle defaultOn /><DemoTag /></Row>
          <Row label="System maintenance"><Toggle /><DemoTag /></Row>
        </Panel>
      </div>

      <Panel title="Critical Actions">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Sign out of this session, or deactivate participation in the federated network.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" className="text-sm inline-flex items-center gap-2" title="Non-functional in demo">
              Deactivate node <DemoTag />
            </Button>
            <Button variant="coral" className="text-sm" onClick={() => { clear(); router.replace("/login"); }}>
              Sign out
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

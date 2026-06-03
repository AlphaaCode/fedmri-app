"use client";

export default function PatientSupportPage() {
  return (
    <div className="w-full space-y-4 p-1">
      <div>
        <h1 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Support</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Get help with your FedMRI patient account</p>
      </div>
      {[
        { q: "Is my data safe?", a: "Yes. Your scans and personal information never leave this hospital's servers. Only anonymised AI model patterns are shared during training." },
        { q: "What does the AI result mean?", a: "The AI result indicates the likely molecular subtype of the tumour in your MRI scan. Always discuss this result with your oncologist before making any medical decisions." },
        { q: "How accurate is the AI?", a: "The AI was trained across 3 hospitals and achieves over 70% accuracy. It is an educational tool — clinical confirmation by a specialist is always required." },
        { q: "Can I delete my data?", a: "Yes. Contact your hospital's data protection officer to request deletion of your scan records." },
      ].map((item) => (
        <div key={item.q} className="rounded-xl border p-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="text-sm font-semibold mb-1.5" style={{ color: "var(--text-primary)" }}>{item.q}</div>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{item.a}</p>
        </div>
      ))}
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { create } from "zustand";
import { useFlStore } from "@/lib/fl-store";

interface Toast { id: string; message: string; type: "success" | "info" | "warning"; }
interface ToastStore {
  toasts: Toast[];
  push: (message: string, type?: Toast["type"]) => void;
  dismiss: (id: string) => void;
}

function playNotificationSound(type: "success" | "info" | "warning" = "success") {
  if (typeof window === "undefined") return;
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    const freqs = type === "success" ? [523, 659] : type === "info" ? [440] : [330];
    let time = ctx.currentTime;
    freqs.forEach((f) => {
      osc.frequency.setValueAtTime(f, time);
      gain.gain.setValueAtTime(0.12, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
      time += 0.2;
    });
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch {
    // AudioContext blocked — silent fail
  }
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (message, type = "info") => {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    playNotificationSound(type);
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

const ICON = {
  success: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" fill="#2dd4bf30" stroke="#2dd4bf" strokeWidth="1.2"/><path d="M4 7l2.5 2.5L10 5" stroke="#2dd4bf" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  info: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="#60a5fa" strokeWidth="1.2"/><path d="M7 5v4M7 4h.01" stroke="#60a5fa" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  warning: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1l6 11H1L7 1z" stroke="#f59e0b" strokeWidth="1.2" strokeLinejoin="round"/><path d="M7 5.5V8M7 9.5h.01" stroke="#f59e0b" strokeWidth="1.2" strokeLinecap="round"/></svg>,
};
const COLOR = { success: "#2dd4bf", info: "#60a5fa", warning: "#f59e0b" };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { toasts, dismiss } = useToastStore();
  const { phase, modelVersion, lastF1Delta, lastUpdateSource } = useFlStore();
  const push = useToastStore((s) => s.push);

  useEffect(() => {
    if (phase === "complete" && lastUpdateSource === "fl") {
      push(`FL round complete — Model v${modelVersion}${lastF1Delta != null ? ` (+${(lastF1Delta * 100).toFixed(2)}pp F1)` : ""}`, "success");
    }
    if (lastUpdateSource === "al" && modelVersion) {
      push(`AI model updated to v${modelVersion} from your feedback`, "success");
    }
  }, [phase, modelVersion, lastUpdateSource, push]);

  return (
    <>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none" style={{ maxWidth: 340 }}>
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.22 }}
              className="pointer-events-auto flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm cursor-pointer shadow-lg"
              style={{ background: "var(--bg-card2)", border: `1px solid ${COLOR[t.type]}40`, color: "var(--text-primary)" }}
              onClick={() => dismiss(t.id)}
            >
              {ICON[t.type]}
              <span>{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

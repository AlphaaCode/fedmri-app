"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { getChatSocket, disconnectChatSocket } from "@/lib/chat-socket";
import { useAuthStore } from "@/lib/auth-store";

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface Props {
  role: "doctor" | "patient";
  caseId?: string;
  starters: string[];
  caseContext?: { subtype: string; confidence: number; modelVersion: number } | null;
  heightClass?: string;
}

export function ChatPanel({ role, caseId, starters, caseContext, heightClass = "h-[calc(100vh-180px)]" }: Props) {
  const token = useAuthStore((s) => s.token);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Connect socket
  useEffect(() => {
    if (!token) return;
    const socket = getChatSocket(token);

    const handleToken = (chunk: { token: string; done: boolean }) => {
      if (chunk.done) {
        setStreaming(false);
        return;
      }
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "assistant") {
          const updated = [...prev];
          updated[updated.length - 1] = { ...last, content: last.content + chunk.token };
          return updated;
        }
        return [...prev, { id: crypto.randomUUID(), role: "assistant", content: chunk.token }];
      });
    };
    const handleError = (err: { code: string; message?: string }) => {
      setStreaming(false);
      if (err.code === "RATE_LIMIT") setError("You're sending messages too fast — wait a minute.");
      else setError(err.message || "Chat error");
    };

    socket.on("chat:token", handleToken);
    socket.on("chat:error", handleError);

    return () => {
      socket.off("chat:token", handleToken);
      socket.off("chat:error", handleError);
    };
  }, [token]);

  useEffect(() => {
    return () => { disconnectChatSocket(); };
  }, []);

  function send(content: string) {
    if (!content.trim() || streaming || !token) return;
    setError(null);
    setStreaming(true);
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content }]);
    const socket = getChatSocket(token);
    socket.emit("chat:message", { content, role, caseId });
    setInput("");
  }

  return (
    <div className={`flex flex-col ${heightClass} rounded-xl border`} style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      {/* Case context banner (doctor only) */}
      {caseContext && (
        <div className="px-4 py-2 border-b text-xs flex items-center gap-3" style={{ borderColor: "var(--border)" }}>
          <span style={{ color: "var(--text-secondary)" }}>Case context:</span>
          <span style={{ color: "var(--teal)" }} className="font-medium">{caseContext.subtype}</span>
          <span style={{ color: "var(--text-secondary)" }}>•</span>
          <span style={{ color: "var(--text-secondary)" }}>{(caseContext.confidence * 100).toFixed(0)}% conf</span>
          <span style={{ color: "var(--text-secondary)" }}>•</span>
          <span style={{ color: "var(--text-secondary)" }}>Model v{caseContext.modelVersion}</span>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8 space-y-4">
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Ask me anything about {role === "doctor" ? "the case, FL training, or the prediction" : "your scan and what to expect"}.
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {starters.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-xs px-3 py-2 rounded-lg transition-colors text-left max-w-xs"
                  style={{ background: "var(--bg-card2)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className="max-w-[80%] rounded-lg px-3 py-2 text-sm"
                style={{
                  background: m.role === "user" ? "var(--teal-glow)" : "var(--bg-card2)",
                  color: m.role === "user" ? "var(--teal)" : "var(--text-primary)",
                  border: "1px solid " + (m.role === "user" ? "var(--teal)40" : "var(--border)"),
                }}
              >
                {m.role === "assistant" ? (
                  <div className="[&_p]:my-1 [&_p]:leading-relaxed [&_ul]:my-1 [&_ul]:ml-4 [&_ul]:list-disc [&_ol]:my-1 [&_ol]:ml-4 [&_ol]:list-decimal [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:bg-black/30 [&_strong]:font-semibold [&_strong]:text-teal-300 [&_a]:underline [&_a]:text-teal-400">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                    {streaming && m === messages[messages.length - 1] && (
                      <span className="inline-block w-1 h-3 bg-teal-400 ml-0.5 animate-pulse" />
                    )}
                  </div>
                ) : (
                  m.content
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {error && (
        <div className="px-4 pb-2 text-xs" style={{ color: "#fb7185" }}>{error}</div>
      )}

      {/* Quick actions (case-aware) — explain the attention heatmap */}
      {caseId && (
        <div className="px-3 pt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={streaming}
            onClick={() =>
              send(
                role === "patient"
                  ? "Can you explain the highlighted areas in my scan picture in simple terms?"
                  : "Explain what the attention heatmap shows for this case — which slices/regions most drove the prediction and how to interpret the colour intensity.",
              )
            }
            className="text-[11px] px-2.5 py-1 rounded-full transition-opacity disabled:opacity-40"
            style={{ background: "var(--teal-glow)", color: "var(--teal-on-glow)", border: "1px solid #2dd4bf40" }}
          >
            🔍 Explain the heatmap
          </button>
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="border-t p-3 flex gap-2"
        style={{ borderColor: "var(--border)" }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={streaming ? "Generating response…" : "Ask a question"}
          disabled={streaming}
          className="flex-1 rounded-lg text-sm px-3 py-2 outline-none disabled:opacity-50"
          style={{ background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="text-xs px-4 py-2 rounded-lg font-medium transition-opacity disabled:opacity-40"
          style={{ background: "var(--teal-dim)", color: "#0d1117" }}
        >
          Send
        </button>
      </form>

      {/* Patient disclaimer */}
      {role === "patient" && (
        <div
          className="px-3 py-2 text-[11px] border-t flex items-center gap-1.5"
          style={{ background: "#f59e0b15", color: "var(--amber-on-glow)", borderColor: "var(--border)" }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1l5 9H1L6 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M6 5v2M6 8.5h.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          This AI provides general information only. Always consult a certified oncologist.
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { colors } from "../lib/theme";
import { useAuthStore } from "../lib/auth-store";
import { getChatSocket, disconnectChatSocket } from "../lib/chat-socket";

interface Msg { id: string; role: "user" | "assistant"; content: string; }

const STARTERS = [
  "What does Luminal A mean?",
  "Questions to ask my oncologist?",
  "Is breast cancer hereditary?",
  "What lifestyle changes help?",
];

export function ChatScreen() {
  const token = useAuthStore((s) => s.token);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!token) return;
    const socket = getChatSocket(token);

    const onToken = (chunk: { token: string; done: boolean }) => {
      if (chunk.done) { setStreaming(false); return; }
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "assistant") {
          return [...prev.slice(0, -1), { ...last, content: last.content + chunk.token }];
        }
        return [...prev, { id: String(Math.random()), role: "assistant", content: chunk.token }];
      });
    };
    const onErr = (e: { code: string; message?: string }) => {
      setStreaming(false);
      setError(e.code === "RATE_LIMIT" ? "Slow down — too many messages" : e.message || "Chat error");
    };

    socket.on("chat:token", onToken);
    socket.on("chat:error", onErr);
    return () => {
      socket.off("chat:token", onToken);
      socket.off("chat:error", onErr);
    };
  }, [token]);

  useEffect(() => {
    return () => { disconnectChatSocket(); };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  function send(content: string) {
    if (!content.trim() || streaming || !token) return;
    setError(null);
    setStreaming(true);
    setMessages((prev) => [...prev, { id: String(Math.random()), role: "user", content }]);
    const socket = getChatSocket(token);
    socket.emit("chat:message", { content, role: "patient" });
    setInput("");
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={88}>
      <View style={s.header}>
        <Text style={s.h1}>Ask AI</Text>
        <Text style={s.sub}>General information only — confirm with your oncologist</Text>
      </View>

      <ScrollView ref={scrollRef} style={s.scroll} contentContainerStyle={{ padding: 16, paddingBottom: 8 }}>
        {messages.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyText}>What would you like to know?</Text>
            <View style={s.startersWrap}>
              {STARTERS.map((q) => (
                <TouchableOpacity key={q} style={s.starter} onPress={() => send(q)}>
                  <Text style={s.starterText}>{q}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          messages.map((m) => (
            <View key={m.id} style={[s.bubbleRow, { justifyContent: m.role === "user" ? "flex-end" : "flex-start" }]}>
              <View style={[
                s.bubble,
                m.role === "user" ? s.bubbleUser : s.bubbleAssistant,
              ]}>
                <Text style={[s.bubbleText, m.role === "user" && { color: colors.teal }]}>
                  {m.content}
                  {streaming && m === messages[messages.length - 1] && (
                    <Text style={{ color: colors.teal }}>▌</Text>
                  )}
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {error && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
          <Text style={{ color: colors.coral, fontSize: 11 }}>{error}</Text>
        </View>
      )}

      <View style={s.inputBar}>
        <TextInput
          style={s.input}
          value={input}
          onChangeText={setInput}
          placeholder={streaming ? "Generating…" : "Ask a question"}
          placeholderTextColor={colors.textSecondary}
          editable={!streaming}
          returnKeyType="send"
          onSubmitEditing={() => send(input)}
        />
        <TouchableOpacity
          style={[s.sendBtn, (streaming || !input.trim()) && { opacity: 0.4 }]}
          onPress={() => send(input)}
          disabled={streaming || !input.trim()}
        >
          {streaming ? <ActivityIndicator color={colors.bgBase} size="small" /> : <Text style={s.sendBtnText}>Send</Text>}
        </TouchableOpacity>
      </View>

      <View style={s.disclaimerBar}>
        <Text style={s.disclaimerText}>⚠ Always consult a certified oncologist for medical decisions</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  header: { padding: 16, paddingBottom: 8 },
  h1: { color: colors.textPrimary, fontSize: 18, fontWeight: "700" },
  sub: { color: colors.textSecondary, fontSize: 11, marginTop: 3 },
  scroll: { flex: 1 },
  empty: { paddingTop: 30, alignItems: "center", gap: 14 },
  emptyText: { color: colors.textSecondary, fontSize: 13 },
  startersWrap: { gap: 8, width: "100%" },
  starter: { backgroundColor: colors.bgCard, borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: 12 },
  starterText: { color: colors.textPrimary, fontSize: 12 },
  bubbleRow: { flexDirection: "row", marginBottom: 8 },
  bubble: { maxWidth: "85%", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1 },
  bubbleUser: { backgroundColor: colors.tealGlow, borderColor: colors.teal + "60" },
  bubbleAssistant: { backgroundColor: colors.bgCard, borderColor: colors.border },
  bubbleText: { color: colors.textPrimary, fontSize: 13, lineHeight: 18 },
  inputBar: { flexDirection: "row", padding: 10, gap: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bgCard },
  input: { flex: 1, backgroundColor: colors.bgBase, borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.textPrimary, fontSize: 13 },
  sendBtn: { backgroundColor: colors.tealDim, borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" },
  sendBtnText: { color: colors.bgBase, fontWeight: "600", fontSize: 13 },
  disclaimerBar: { backgroundColor: "#f59e0b15", borderTopWidth: 1, borderTopColor: colors.amber + "40", paddingHorizontal: 14, paddingVertical: 8 },
  disclaimerText: { color: colors.amber, fontSize: 10, textAlign: "center" },
});

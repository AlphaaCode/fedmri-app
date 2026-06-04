import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
} from "react-native";
import { Send, Sparkles } from "lucide-react-native";
import { colors } from "../lib/theme";
import { useAuthStore } from "../lib/auth-store";
import { getChatSocket, disconnectChatSocket } from "../lib/chat-socket";
import { AppHeader, SectionLabel } from "../components/ui";

interface Msg { id: string; role: "user" | "assistant"; content: string; }

const STARTERS = ["What are next steps?", "How accurate is this?", "What does my result mean?"];

export function ChatScreen({ navigation }: any) {
  const token = useAuthStore((s) => s.token);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!token) return;
    const socket = getChatSocket(token);
    const onToken = (chunk: { token: string; done: boolean }) => {
      if (chunk.done) { setStreaming(false); return; }
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "assistant") return [...prev.slice(0, -1), { ...last, content: last.content + chunk.token }];
        return [...prev, { id: String(Math.random()), role: "assistant", content: chunk.token }];
      });
    };
    const onErr = () => setStreaming(false);
    socket.on("chat:token", onToken);
    socket.on("chat:error", onErr);
    return () => { socket.off("chat:token", onToken); socket.off("chat:error", onErr); };
  }, [token]);

  useEffect(() => () => { disconnectChatSocket(); }, []);
  useEffect(() => { scrollRef.current?.scrollToEnd({ animated: true }); }, [messages]);

  function send(content: string) {
    if (!content.trim() || streaming || !token) return;
    setStreaming(true);
    setMessages((prev) => [...prev, { id: String(Math.random()), role: "user", content }]);
    getChatSocket(token).emit("chat:message", { content, role: "patient" });
    setInput("");
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <AppHeader onSettings={() => navigation.navigate("Settings")} />

      <ScrollView ref={scrollRef} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {/* AI context card */}
        <View style={s.ctx}>
          <View style={s.ctxIcon}><Sparkles size={14} color={colors.teal} /></View>
          <View style={{ flex: 1 }}>
            <SectionLabel>FedMRI AI · Clinical assistant</SectionLabel>
            <Text style={s.ctxText}>
              Ask about your scan result, what a subtype means, or questions for your oncologist.
            </Text>
          </View>
        </View>

        {messages.length === 0 && (
          <Text style={s.hint}>Trained across 3 hospitals — your data never leaves your hospital.</Text>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <View key={m.id} style={s.userWrap}>
              <View style={s.userBubble}><Text style={s.userText}>{m.content}</Text></View>
            </View>
          ) : (
            <View key={m.id} style={s.aiWrap}>
              <View style={s.aiAvatar}><Sparkles size={12} color={colors.teal} /></View>
              <View style={s.aiBubble}><Text style={s.aiText}>{m.content || "…"}</Text></View>
            </View>
          )
        )}
      </ScrollView>

      {/* Suggestion chips */}
      {messages.length === 0 && (
        <View style={s.chips}>
          {STARTERS.map((q) => (
            <TouchableOpacity key={q} style={s.chip} onPress={() => send(q)}>
              <Text style={s.chipText}>{q}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Input */}
      <View style={s.inputBar}>
        <TextInput
          style={s.input}
          value={input}
          onChangeText={setInput}
          placeholder="Type a question…"
          placeholderTextColor={colors.textSecondary}
          onSubmitEditing={() => send(input)}
          returnKeyType="send"
        />
        <TouchableOpacity style={[s.sendBtn, (!input.trim() || streaming) && { opacity: 0.5 }]} onPress={() => send(input)} disabled={!input.trim() || streaming}>
          <Send size={18} color="#06201d" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  content: { padding: 16, paddingBottom: 8, gap: 12 },
  ctx: { flexDirection: "row", gap: 10, backgroundColor: colors.bgCard, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 12 },
  ctxIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.tealGlow, borderWidth: 1, borderColor: colors.teal + "40", alignItems: "center", justifyContent: "center" },
  ctxText: { color: colors.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 4 },
  hint: { color: colors.textSecondary, fontSize: 11, textAlign: "center", opacity: 0.7, marginVertical: 8 },

  userWrap: { alignItems: "flex-end" },
  userBubble: { maxWidth: "82%", backgroundColor: colors.teal, borderRadius: 16, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 10 },
  userText: { color: "#06201d", fontSize: 13, lineHeight: 19, fontWeight: "500" },

  aiWrap: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  aiAvatar: { width: 26, height: 26, borderRadius: 8, backgroundColor: colors.tealGlow, borderWidth: 1, borderColor: colors.teal + "40", alignItems: "center", justifyContent: "center", marginTop: 2 },
  aiBubble: { flex: 1, maxWidth: "85%", backgroundColor: colors.bgCard, borderColor: colors.border, borderWidth: 1, borderRadius: 16, borderTopLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 11 },
  aiText: { color: colors.textPrimary, fontSize: 13, lineHeight: 20 },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  chip: { backgroundColor: colors.bgCard, borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { color: colors.textSecondary, fontSize: 12 },

  inputBar: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bgCard },
  input: { flex: 1, backgroundColor: colors.bgBase, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
  sendBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.teal, alignItems: "center", justifyContent: "center" },
});

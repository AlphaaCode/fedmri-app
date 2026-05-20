import React, { useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from "react-native";
import { colors } from "../lib/theme";
import { apiLogin, getApiUrl, setApiUrl } from "../lib/api";
import { useAuthStore } from "../lib/auth-store";

export function LoginScreen({ navigation }: any) {
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState(getApiUrl());
  const [showServer, setShowServer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setServer(getApiUrl()); }, []);

  async function saveServer() {
    await setApiUrl(server);
    setError(null);
    setShowServer(false);
  }

  async function onSubmit() {
    if (!email || !password) return;
    setLoading(true); setError(null);
    try {
      const { accessToken, user } = await apiLogin(email, password);
      await setAuth(user, accessToken);
    } catch (e: any) {
      setError(e?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 20 }} keyboardShouldPersistTaps="handled">
      <View style={s.card}>
        <View style={s.logoRow}>
          <View style={s.logoBox}>
            <Text style={{ color: colors.teal, fontSize: 18, fontWeight: "700" }}>+</Text>
          </View>
          <View>
            <Text style={s.brand}>FedMRI</Text>
            <Text style={s.brandSub}>Patient portal</Text>
          </View>
        </View>

        <Text style={s.h1}>Sign in</Text>
        <Text style={s.sub}>Access AI-powered breast MRI analysis</Text>

        <View>
          <Text style={s.label}>EMAIL</Text>
          <TextInput
            style={s.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        <View>
          <Text style={s.label}>PASSWORD</Text>
          <TextInput
            style={s.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.textSecondary}
            secureTextEntry
          />
        </View>

        {error && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity style={s.btn} onPress={onSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.bgBase} /> : <Text style={s.btnText}>Sign in</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate("Register")}>
          <Text style={s.linkText}>
            New here? <Text style={{ color: colors.teal }}>Create an account</Text>
          </Text>
        </TouchableOpacity>

        <Text style={s.footer}>AI trained across 3 hospitals — your data never leaves your hospital</Text>

        {/* Server URL override — tap to expand */}
        <TouchableOpacity onPress={() => setShowServer((v) => !v)} style={{ marginTop: 4 }}>
          <Text style={s.serverHint}>
            {showServer ? "▼" : "▶"} Backend: <Text style={{ color: colors.teal }}>{server.replace(/^https?:\/\//, "")}</Text>
          </Text>
        </TouchableOpacity>

        {showServer && (
          <View style={s.serverBox}>
            <Text style={s.label}>BACKEND URL</Text>
            <TextInput
              style={s.input}
              value={server}
              onChangeText={setServer}
              placeholder="http://192.168.1.42:3001"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              keyboardType="url"
            />
            <Text style={s.helpText}>
              Use your computer&apos;s LAN IP, not localhost. Both devices must be on the same Wi-Fi.
            </Text>
            <TouchableOpacity style={s.smallBtn} onPress={saveServer}>
              <Text style={s.smallBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase, justifyContent: "center", padding: 20 },
  card: { backgroundColor: colors.bgCard, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 24, gap: 16 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  logoBox: { width: 36, height: 36, backgroundColor: colors.tealGlow, borderRadius: 10, borderWidth: 1, borderColor: colors.teal + "60", alignItems: "center", justifyContent: "center" },
  brand: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  brandSub: { color: colors.textSecondary, fontSize: 11 },
  h1: { color: colors.textPrimary, fontSize: 20, fontWeight: "700" },
  sub: { color: colors.textSecondary, fontSize: 12, marginTop: -8 },
  label: { color: colors.textSecondary, fontSize: 10, letterSpacing: 1.5, marginBottom: 6 },
  input: { backgroundColor: colors.bgBase, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  errorBox: { backgroundColor: "#fb718515", borderColor: colors.coral + "60", borderWidth: 1, borderRadius: 8, padding: 10 },
  errorText: { color: colors.coral, fontSize: 12 },
  btn: { backgroundColor: colors.tealDim, borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  btnText: { color: colors.bgBase, fontSize: 14, fontWeight: "600" },
  linkText: { color: colors.textSecondary, fontSize: 12, textAlign: "center" },
  footer: { color: colors.textSecondary, fontSize: 10, textAlign: "center", marginTop: 4 },
  serverHint: { color: colors.textSecondary, fontSize: 10, textAlign: "center" },
  serverBox: { backgroundColor: colors.bgCard2, borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: 12, gap: 6, marginTop: 4 },
  helpText: { color: colors.textSecondary, fontSize: 10, lineHeight: 14, marginTop: 2 },
  smallBtn: { backgroundColor: colors.tealGlow, borderColor: colors.teal + "60", borderWidth: 1, borderRadius: 8, paddingVertical: 8, alignItems: "center", marginTop: 4 },
  smallBtnText: { color: colors.teal, fontWeight: "600", fontSize: 12 },
});

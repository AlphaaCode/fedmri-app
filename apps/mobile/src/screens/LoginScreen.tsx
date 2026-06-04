import React, { useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from "react-native";
import { Mail, Lock, Server } from "lucide-react-native";
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

  async function saveServer() { await setApiUrl(server); setError(null); setShowServer(false); }

  async function onSubmit() {
    if (!email || !password) return;
    setLoading(true); setError(null);
    try {
      const { accessToken, user } = await apiLogin(email, password);
      await setAuth(user, accessToken);
    } catch (e: any) {
      setError(e?.message || "Login failed");
    } finally { setLoading(false); }
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Image source={require("../../assets/fedmri-logo.png")} style={s.logo} resizeMode="contain" />
        <Text style={s.tagline}>Sign in to your patient portal</Text>

        <View style={s.card}>
          <Field icon={<Mail size={16} color={colors.textSecondary} />} label="Email Address" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
          <Field icon={<Lock size={16} color={colors.textSecondary} />} label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />

          {error && <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View>}

          <TouchableOpacity style={s.btn} onPress={onSubmit} disabled={loading} activeOpacity={0.85}>
            {loading ? <ActivityIndicator color="#06201d" /> : <Text style={s.btnText}>Sign In</Text>}
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => navigation.navigate("Register")}>
          <Text style={s.link}>New here? <Text style={{ color: colors.teal, fontWeight: "700" }}>Create an account</Text></Text>
        </TouchableOpacity>

        {/* Backend override — needed to point the app at your computer's LAN IP */}
        <TouchableOpacity style={s.serverToggle} onPress={() => setShowServer((v) => !v)}>
          <Server size={12} color={colors.textSecondary} />
          <Text style={s.serverHint}>Backend: <Text style={{ color: colors.teal }}>{server.replace(/^https?:\/\//, "")}</Text></Text>
        </TouchableOpacity>
        {showServer && (
          <View style={s.serverBox}>
            <Text style={s.label}>Backend URL</Text>
            <View style={s.inputWrap}>
              <View style={s.inputIcon}><Server size={15} color={colors.textSecondary} /></View>
              <TextInput style={s.input} value={server} onChangeText={setServer} placeholder="http://192.168.1.42:3001" placeholderTextColor={colors.textSecondary} autoCapitalize="none" keyboardType="url" />
            </View>
            <Text style={s.help}>Use your computer&apos;s LAN IP, not localhost. Both devices on the same Wi-Fi.</Text>
            <TouchableOpacity style={s.saveBtn} onPress={saveServer}><Text style={s.saveBtnText}>Save</Text></TouchableOpacity>
          </View>
        )}

        <Text style={s.footer}>AI trained across 3 hospitals — your data never leaves your hospital.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ icon, label, ...props }: any) {
  return (
    <View>
      <Text style={s.label}>{label}</Text>
      <View style={s.inputWrap}>
        <View style={s.inputIcon}>{icon}</View>
        <TextInput style={s.input} placeholderTextColor={colors.textSecondary} {...props} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 22, gap: 14 },
  logo: { width: 190, height: 80, alignSelf: "center" },
  tagline: { color: colors.textSecondary, fontSize: 13, textAlign: "center", marginTop: -10 },
  card: { backgroundColor: colors.bgCard, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 20, gap: 14, marginTop: 4 },
  label: { color: colors.textPrimary, fontSize: 12, fontWeight: "600", marginBottom: 7 },
  inputWrap: { flexDirection: "row", alignItems: "center", backgroundColor: colors.bgBase, borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
  inputIcon: { paddingLeft: 12 },
  input: { flex: 1, color: colors.textPrimary, paddingHorizontal: 10, paddingVertical: 12, fontSize: 14 },
  btn: { backgroundColor: colors.teal, borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  btnText: { color: "#06201d", fontSize: 15, fontWeight: "800" },
  errorBox: { backgroundColor: "#fb718515", borderColor: colors.coral + "60", borderWidth: 1, borderRadius: 8, padding: 10 },
  errorText: { color: colors.coral, fontSize: 12 },
  link: { color: colors.textSecondary, fontSize: 13, textAlign: "center" },
  serverToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  serverHint: { color: colors.textSecondary, fontSize: 11 },
  serverBox: { backgroundColor: colors.bgCard2, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  help: { color: colors.textSecondary, fontSize: 10, lineHeight: 14 },
  saveBtn: { backgroundColor: colors.tealGlow, borderColor: colors.teal + "55", borderWidth: 1, borderRadius: 8, paddingVertical: 9, alignItems: "center" },
  saveBtnText: { color: colors.teal, fontWeight: "700", fontSize: 12 },
  footer: { color: colors.textSecondary, fontSize: 10, textAlign: "center", opacity: 0.7 },
});

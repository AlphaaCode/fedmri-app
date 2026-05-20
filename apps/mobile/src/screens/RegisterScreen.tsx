import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { colors } from "../lib/theme";
import { apiLogin, apiRegister } from "../lib/api";
import { useAuthStore } from "../lib/auth-store";

export function RegisterScreen({ navigation }: any) {
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setLoading(true); setError(null);
    try {
      await apiRegister(form.email, form.password, form.name);
      const { accessToken, user } = await apiLogin(form.email, form.password);
      await setAuth(user, accessToken);
    } catch (e: any) {
      setError(e?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={s.card}>
        <Text style={s.h1}>Create account</Text>
        <Text style={s.sub}>Free access to AI-powered MRI analysis</Text>

        {[
          { label: "FULL NAME", key: "name", secure: false, kb: "default" as const },
          { label: "EMAIL", key: "email", secure: false, kb: "email-address" as const },
          { label: "PASSWORD", key: "password", secure: true, kb: "default" as const },
        ].map(({ label, key, secure, kb }) => (
          <View key={key}>
            <Text style={s.label}>{label}</Text>
            <TextInput
              style={s.input}
              value={form[key as keyof typeof form]}
              onChangeText={(v) => setForm({ ...form, [key]: v })}
              placeholderTextColor={colors.textSecondary}
              autoCapitalize={key === "email" ? "none" : "words"}
              secureTextEntry={secure}
              keyboardType={kb}
            />
          </View>
        ))}

        {error && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity style={s.btn} onPress={onSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.bgBase} /> : <Text style={s.btnText}>Create account</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.linkText}>
            Already have an account? <Text style={{ color: colors.teal }}>Sign in</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase, justifyContent: "center", padding: 20 },
  card: { backgroundColor: colors.bgCard, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 24, gap: 14 },
  h1: { color: colors.textPrimary, fontSize: 20, fontWeight: "700" },
  sub: { color: colors.textSecondary, fontSize: 12, marginTop: -8 },
  label: { color: colors.textSecondary, fontSize: 10, letterSpacing: 1.5, marginBottom: 6 },
  input: { backgroundColor: colors.bgBase, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  errorBox: { backgroundColor: "#fb718515", borderColor: colors.coral + "60", borderWidth: 1, borderRadius: 8, padding: 10 },
  errorText: { color: colors.coral, fontSize: 12 },
  btn: { backgroundColor: colors.tealDim, borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  btnText: { color: colors.bgBase, fontSize: 14, fontWeight: "600" },
  linkText: { color: colors.textSecondary, fontSize: 12, textAlign: "center" },
});

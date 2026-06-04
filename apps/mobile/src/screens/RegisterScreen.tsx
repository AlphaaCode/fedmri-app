import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from "react-native";
import { User, Mail, Lock, Info } from "lucide-react-native";
import { colors } from "../lib/theme";
import { apiRegister } from "../lib/api";
import { useAuthStore } from "../lib/auth-store";

export function RegisterScreen({ navigation }: any) {
  const setAuth = useAuthStore((s) => s.setAuth);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    if (!name || !email || !password) return;
    setLoading(true); setError(null);
    try {
      const res: any = await apiRegister(email, password, name);
      if (res?.accessToken && res?.user) await setAuth(res.user, res.accessToken);
      else navigation.navigate("Login");
    } catch (e: any) {
      setError(e?.message || "Registration failed");
    } finally { setLoading(false); }
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Image source={require("../../assets/fedmri-logo.png")} style={s.logo} resizeMode="contain" />
        <Text style={s.tagline}>Create your patient portal account</Text>

        <View style={s.card}>
          <Field icon={<User size={16} color={colors.textSecondary} />} label="Full Name" value={name} onChangeText={setName} placeholder="Hussin Mehdi" />
          <Field icon={<Mail size={16} color={colors.textSecondary} />} label="Email Address" value={email} onChangeText={setEmail} placeholder="jane@example.com" keyboardType="email-address" autoCapitalize="none" />
          <Field icon={<Lock size={16} color={colors.textSecondary} />} label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />

          {error && <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View>}

          <TouchableOpacity style={s.btn} onPress={onSubmit} disabled={loading} activeOpacity={0.85}>
            {loading ? <ActivityIndicator color="#06201d" /> : <Text style={s.btnText}>Create Account</Text>}
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => navigation.navigate("Login")}>
          <Text style={s.link}>Already have an account? <Text style={{ color: colors.teal, fontWeight: "700" }}>Log in</Text></Text>
        </TouchableOpacity>

        <View style={s.info}>
          <Info size={14} color={colors.coral} />
          <Text style={s.infoText}>By creating an account, you agree to our secure data-handling protocols.</Text>
        </View>
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
  logo: { width: 180, height: 76, alignSelf: "center" },
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
  info: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: "#fb718510", borderColor: colors.coral + "40", borderWidth: 1, borderRadius: 12, padding: 12 },
  infoText: { color: colors.coral, fontSize: 11, lineHeight: 16, flex: 1 },
});

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { colors } from "../lib/theme";
import { useAuthStore } from "../lib/auth-store";
import { getApiUrl } from "../lib/api";

export function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <View style={s.avatar}>
        <Text style={{ color: colors.teal, fontSize: 32, fontWeight: "700" }}>
          {user?.name?.[0]?.toUpperCase() ?? "?"}
        </Text>
      </View>
      <Text style={s.name}>{user?.name ?? "—"}</Text>
      <Text style={s.email}>{user?.email}</Text>

      <View style={s.section}>
        <Text style={s.sectionLabel}>Account</Text>
        <Row label="Role" value={user?.role} />
        <Row label="User ID" value={user?.id?.slice(0, 12) + "…"} mono />
      </View>

      <View style={s.section}>
        <Text style={s.sectionLabel}>System</Text>
        <Row label="API endpoint" value={getApiUrl()} mono />
        <Row label="Mode" value="Mock inference" />
      </View>

      <View style={s.aboutBox}>
        <Text style={s.aboutTitle}>About FedMRI</Text>
        <Text style={s.aboutText}>
          AI trained across 3 hospitals using federated learning — your scans and data
          never leave their hospital. You benefit from collaborative AI while keeping
          your privacy intact.
        </Text>
      </View>

      <TouchableOpacity style={s.logout} onPress={clear}>
        <Text style={s.logoutText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Row({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, mono && { fontFamily: "monospace", fontSize: 11 }]} numberOfLines={1}>
        {value ?? "—"}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  content: { padding: 16, alignItems: "center" },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.tealGlow, borderWidth: 1, borderColor: colors.teal + "60", alignItems: "center", justifyContent: "center", marginTop: 12 },
  name: { color: colors.textPrimary, fontSize: 18, fontWeight: "700", marginTop: 12 },
  email: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  section: { width: "100%", marginTop: 24 },
  sectionLabel: { color: colors.textSecondary, fontSize: 10, letterSpacing: 1.5, marginBottom: 8 },
  row: { backgroundColor: colors.bgCard, borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  rowLabel: { color: colors.textSecondary, fontSize: 12 },
  rowValue: { color: colors.textPrimary, fontSize: 12, marginLeft: 12, flexShrink: 1, textAlign: "right" },
  aboutBox: { width: "100%", backgroundColor: colors.tealGlow, borderColor: colors.teal + "40", borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 24 },
  aboutTitle: { color: colors.teal, fontSize: 13, fontWeight: "700", marginBottom: 4 },
  aboutText: { color: "#99f6e4", fontSize: 11, lineHeight: 16 },
  logout: { marginTop: 32, marginBottom: 24, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.coral + "60", backgroundColor: "#fb718510" },
  logoutText: { color: colors.coral, fontSize: 13, fontWeight: "600" },
});

import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, ShieldCheck, Download, UserX, LogOut } from "lucide-react-native";
import { colors } from "../lib/theme";
import { useAuthStore } from "../lib/auth-store";
import { getApiUrl } from "../lib/api";
import { Card, SectionLabel } from "../components/ui";

function Toggle({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={s.toggleRow}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={s.toggleLabel}>{label}</Text>
        <Text style={s.toggleDesc}>{desc}</Text>
      </View>
      <Switch value={value} onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.teal }} thumbColor="#fff" ios_backgroundColor={colors.border} />
    </View>
  );
}

export function SettingsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((u) => u.user);
  const clear = useAuthStore((u) => u.clear);
  const [pool, setPool] = useState(true);
  const [ctx, setCtx] = useState(true);
  const [thirdParty, setThirdParty] = useState(false);
  const nodeId = "node_" + (user?.id ? user.id.slice(0, 6) : "7a9f_px");

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} style={{ width: 22 }}>
          <ChevronLeft size={22} color={colors.teal} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Privacy &amp; Security</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Card style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <View style={s.shield}><ShieldCheck size={20} color={colors.teal} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.zeroTitle}>Zero-Trust Active</Text>
            <Text style={s.zeroSub}>End-to-end encryption engaged. Your scans stay on-device.</Text>
          </View>
        </Card>

        <View style={s.nodeBox}>
          <Text style={s.nodeLabel}>Federated Node ID</Text>
          <Text style={s.nodeId}>{nodeId}</Text>
        </View>

        <SectionLabel>Data Sharing Preferences</SectionLabel>
        <Card style={{ marginTop: 8 }}>
          <Toggle label="Federated Research Pool" desc="Contribute anonymised model patterns to global training." value={pool} onChange={setPool} />
          <View style={s.divider} />
          <Toggle label="AI Context Enhancement" desc="Allow the assistant to use your scan metadata for better answers." value={ctx} onChange={setCtx} />
          <View style={s.divider} />
          <Toggle label="3rd-Party Verification" desc="Permit external auditing nodes to verify integrity hashes." value={thirdParty} onChange={setThirdParty} />
        </Card>

        <SectionLabel>Data Portability</SectionLabel>
        <Card style={{ marginTop: 8, gap: 0 }}>
          <TouchableOpacity style={s.actionRow}>
            <Download size={16} color={colors.teal} />
            <View style={{ flex: 1 }}>
              <Text style={s.actionLabel}>Download Full Archive</Text>
              <Text style={s.actionDesc}>Export all logs, metadata, and encrypted scans.</Text>
            </View>
          </TouchableOpacity>
          <View style={s.divider} />
          <TouchableOpacity style={s.actionRow}>
            <UserX size={16} color={colors.coral} />
            <View style={{ flex: 1 }}>
              <Text style={[s.actionLabel, { color: colors.coral }]}>De-identify Account</Text>
              <Text style={s.actionDesc}>Permanently sever the link between identity and node data.</Text>
            </View>
          </TouchableOpacity>
        </Card>

        <View style={s.account}>
          <Text style={s.accountName}>{user?.name}</Text>
          <Text style={s.accountEmail}>{user?.email}</Text>
          <Text style={s.accountApi}>{getApiUrl().replace(/^https?:\/\//, "")}</Text>
        </View>

        <TouchableOpacity style={s.logout} onPress={clear}>
          <LogOut size={16} color={colors.coral} />
          <Text style={s.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingBottom: 10, backgroundColor: colors.bgCard, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.teal, fontSize: 16, fontWeight: "700" },
  content: { padding: 16, paddingBottom: 36, gap: 12 },
  shield: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.tealGlow, borderWidth: 1, borderColor: colors.teal + "40", alignItems: "center", justifyContent: "center" },
  zeroTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  zeroSub: { color: colors.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 2 },
  nodeBox: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.bgCard, borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  nodeLabel: { color: colors.textSecondary, fontSize: 12 },
  nodeId: { color: colors.teal, fontSize: 12, fontWeight: "600", fontFamily: "monospace" },
  toggleRow: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  toggleLabel: { color: colors.textPrimary, fontSize: 13, fontWeight: "600" },
  toggleDesc: { color: colors.textSecondary, fontSize: 11, lineHeight: 15, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  actionLabel: { color: colors.textPrimary, fontSize: 13, fontWeight: "600" },
  actionDesc: { color: colors.textSecondary, fontSize: 11, lineHeight: 15, marginTop: 2 },
  account: { alignItems: "center", marginTop: 8, gap: 2 },
  accountName: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  accountEmail: { color: colors.textSecondary, fontSize: 12 },
  accountApi: { color: colors.textSecondary, fontSize: 10, fontFamily: "monospace", opacity: 0.6, marginTop: 2 },
  logout: { flexDirection: "row", alignSelf: "center", alignItems: "center", gap: 8, marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.coral + "55", backgroundColor: "#fb718510" },
  logoutText: { color: colors.coral, fontSize: 13, fontWeight: "600" },
});

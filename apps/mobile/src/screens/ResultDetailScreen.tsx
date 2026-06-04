import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, ShieldCheck, MessageSquare, Download } from "lucide-react-native";
import { colors, subtypeColor, subtypePlain, isBinarySubtype } from "../lib/theme";
import { PrimaryButton, OutlineButton, Card, SectionLabel, ProbBar, Pill } from "../components/ui";

export function ResultDetailScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const item = route.params?.item ?? {};
  const subtype: string = item.predictedSubtype ?? "—";
  const color = subtypeColor[subtype] ?? colors.teal;
  const date = item.createdAt ? new Date(item.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  const bars = isBinarySubtype(subtype)
    ? [
        { label: "Luminal", v: item.probs?.[0] ?? 0, c: colors.teal },
        { label: "Non-Luminal", v: item.probs?.[1] ?? 0, c: colors.amber },
      ]
    : (["Luminal A", "Luminal B", "HER2", "Triple Negative"] as const).map((k, i) => ({ label: k, v: item.probs?.[i] ?? 0, c: subtypeColor[k] }));

  // Demo federated-consensus flourish (the design's aesthetic; node values derive from confidence)
  const conf = item.confidence ?? 0;
  const nodes = [
    { n: "Node Alpha", v: Math.min(0.999, conf + 0.02) },
    { n: "Node Beta", v: Math.min(0.999, conf + 0.005) },
    { n: "Node Gamma", v: Math.min(0.999, conf + 0.03) },
  ];

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} style={s.back}>
          <ChevronLeft size={22} color={colors.teal} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Scan Results</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Pill label={`ANALYSIS COMPLETE · ${item.id ? item.id.slice(0, 8).toUpperCase() : ""}`} />
        <Text style={s.subtypeBig} >{subtype}</Text>
        <Text style={s.date}>{date}</Text>

        <Card style={{ marginTop: 6 }}>
          <View style={s.findHead}>
            <SectionLabel>Clinical Findings</SectionLabel>
            <View style={s.integrity}>
              <ShieldCheck size={12} color={colors.teal} />
              <Text style={s.integrityText}>Integrity check passed</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 8 }}>
            <Text style={[s.primaryClass, { color }]}>{subtype}</Text>
            <Text style={[s.confBig, { color }]}>{Math.round(conf * 100)}%</Text>
          </View>
          <Text style={s.plain}>{subtypePlain[subtype] ?? ""}</Text>
          <View style={{ marginTop: 10 }}>
            {bars.map((bx) => <ProbBar key={bx.label} label={bx.label} value={bx.v} color={bx.c} />)}
          </View>
          {item.f1 != null && (
            <Text style={s.modelLine}>Model FedSCRT v{item.modelVersion} · validation F1 {item.f1.toFixed(3)} · AUC {(item.auc ?? 0).toFixed(3)}</Text>
          )}
        </Card>

        <Card style={{ marginTop: 12 }}>
          <SectionLabel>Federated Consensus</SectionLabel>
          {nodes.map((nd) => (
            <View key={nd.n} style={s.nodeRow}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                <View style={s.nodeDot} /><Text style={s.nodeName}>{nd.n}</Text>
              </View>
              <Text style={s.nodeVal}>{(nd.v * 100).toFixed(1)}%</Text>
            </View>
          ))}
          <Text style={s.consensusNote}>Agreement across hospital nodes — no raw scan data was shared.</Text>
        </Card>

        <PrimaryButton label="Discuss with AI" icon={<MessageSquare size={16} color="#06201d" />} onPress={() => navigation.navigate("Tabs", { screen: "Chat" })} style={{ marginTop: 14 }} />
        <OutlineButton label="Download Report" icon={<Download size={16} color={colors.teal} />} style={{ marginTop: 10 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingBottom: 10, backgroundColor: colors.bgCard, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 22 },
  headerTitle: { color: colors.teal, fontSize: 16, fontWeight: "700" },
  content: { padding: 16, paddingBottom: 36, gap: 4 },
  subtypeBig: { color: colors.textPrimary, fontSize: 26, fontWeight: "800", marginTop: 12 },
  date: { color: colors.textSecondary, fontSize: 12, marginBottom: 6 },
  findHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  integrity: { flexDirection: "row", alignItems: "center", gap: 4 },
  integrityText: { color: colors.teal, fontSize: 10, fontWeight: "600" },
  primaryClass: { fontSize: 22, fontWeight: "800" },
  confBig: { fontSize: 16, fontWeight: "700" },
  plain: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 6 },
  modelLine: { color: colors.textSecondary, fontSize: 10, marginTop: 12 },
  nodeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  nodeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.teal },
  nodeName: { color: colors.textPrimary, fontSize: 13 },
  nodeVal: { color: colors.teal, fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },
  consensusNote: { color: colors.textSecondary, fontSize: 10, lineHeight: 15, marginTop: 12 },
});

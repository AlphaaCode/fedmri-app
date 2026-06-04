import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl, ActivityIndicator, TouchableOpacity } from "react-native";
import { ChevronRight, ClipboardList } from "lucide-react-native";
import { colors, subtypeColor } from "../lib/theme";
import { apiFetch } from "../lib/api";
import { AppHeader, Pill } from "../components/ui";

interface CaseItem {
  id: string; predictedSubtype: string; confidence: number; modelVersion: number; createdAt: string; status?: string;
  probs?: number[]; f1?: number; auc?: number;
}

const STATUS_COLOR: Record<string, string> = { VALIDATED: colors.teal, DISPUTED: colors.amber, PENDING: colors.textSecondary };

export function ResultsScreen({ navigation }: any) {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try { const r = await apiFetch<{ data: CaseItem[] }>("/cases"); setCases(r.data); } catch {}
  }
  useEffect(() => { load().finally(() => setLoading(false)); }, []);
  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false); }

  return (
    <View style={s.root}>
      <AppHeader onSettings={() => navigation.navigate("Settings")} />
      {loading ? (
        <View style={s.center}><ActivityIndicator color={colors.teal} size="large" /></View>
      ) : (
        <FlatList
          data={cases}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.teal} />}
          ListHeaderComponent={
            <View style={{ marginBottom: 14 }}>
              <Text style={s.h1}>Scan Results</Text>
              <Text style={s.sub}>{cases.length} analysis{cases.length !== 1 ? "es" : ""} · always confirm with your oncologist</Text>
            </View>
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <ClipboardList size={34} color={colors.textSecondary} />
              <Text style={s.emptyText}>No analyses yet</Text>
              <Text style={s.emptySub}>Run a scan from the Scan tab to see results here.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const color = subtypeColor[item.predictedSubtype] ?? colors.teal;
            const date = new Date(item.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
            const status = item.status ?? "PENDING";
            return (
              <TouchableOpacity style={s.card} activeOpacity={0.8} onPress={() => navigation.navigate("ResultDetail", { item })}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <Text style={[s.subtype, { color }]}>{item.predictedSubtype}</Text>
                    <Pill label={status} color={STATUS_COLOR[status] ?? colors.textSecondary} />
                  </View>
                  <Text style={s.meta}>{date} · {Math.round(item.confidence * 100)}% confidence · v{item.modelVersion}</Text>
                </View>
                <ChevronRight size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  h1: { color: colors.textPrimary, fontSize: 22, fontWeight: "800" },
  sub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  card: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.bgCard, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  subtype: { fontSize: 15, fontWeight: "700" },
  meta: { color: colors.textSecondary, fontSize: 11 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 8 },
  emptyText: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  emptySub: { color: colors.textSecondary, fontSize: 12, textAlign: "center", paddingHorizontal: 30 },
});

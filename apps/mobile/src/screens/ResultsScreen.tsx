import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl, ActivityIndicator, TouchableOpacity } from "react-native";
import { colors, subtypeColor, subtypePlain } from "../lib/theme";
import { apiFetch } from "../lib/api";

interface CaseItem {
  id: string;
  predictedSubtype: string;
  confidence: number;
  modelVersion: number;
  createdAt: string;
  status?: string;
}

const STATUS_COLOR: Record<string, string> = {
  VALIDATED: colors.teal,
  DISPUTED: colors.amber,
  PENDING: colors.textSecondary,
};

export function ResultsScreen() {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try {
      const r = await apiFetch<{ data: CaseItem[] }>("/cases");
      setCases(r.data);
    } catch {}
  }

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={colors.teal} size="large" /></View>;
  }

  return (
    <View style={s.root}>
      <FlatList
        data={cases}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.teal} />}
        ListHeaderComponent={
          <View style={s.header}>
            <Text style={s.h1}>Scan history</Text>
            <Text style={s.sub}>{cases.length} scan{cases.length !== 1 ? "s" : ""} · Always confirm with your oncologist</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyIcon}>🩻</Text>
            <Text style={s.emptyTitle}>No scans yet</Text>
            <Text style={s.emptySub}>Upload an MRI scan from the Scan tab to see your results here</Text>
          </View>
        }
        renderItem={({ item }) => {
          const color = subtypeColor[item.predictedSubtype] || colors.textSecondary;
          const date = new Date(item.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
          const conf = Math.round(item.confidence * 100);
          const statusColor = STATUS_COLOR[item.status || "PENDING"] || colors.textSecondary;

          return (
            <View style={s.card}>
              {/* Top row */}
              <View style={s.cardTop}>
                <View style={[s.dot, { backgroundColor: color }]} />
                <Text style={[s.subtype, { color }]}>{item.predictedSubtype}</Text>
                <View style={{ flex: 1 }} />
                <Text style={s.date}>{date}</Text>
              </View>

              {/* Description */}
              <Text style={s.plain} numberOfLines={2}>{subtypePlain[item.predictedSubtype]}</Text>

              {/* Confidence bar */}
              <View style={s.confRow}>
                <Text style={s.confLabel}>Confidence</Text>
                <View style={s.barTrack}>
                  <View style={[s.barFill, {
                    width: `${conf}%` as any,
                    backgroundColor: conf >= 70 ? colors.teal : conf >= 50 ? colors.amber : colors.coral,
                  }]} />
                </View>
                <Text style={[s.confPct, {
                  color: conf >= 70 ? colors.teal : conf >= 50 ? colors.amber : colors.coral,
                }]}>{conf}%</Text>
              </View>

              {/* Footer */}
              <View style={s.cardFooter}>
                <Text style={s.modelV}>v{item.modelVersion}</Text>
                {item.status && item.status !== "PENDING" && (
                  <View style={[s.statusBadge, { borderColor: statusColor + "60", backgroundColor: statusColor + "15" }]}>
                    <Text style={[s.statusText, { color: statusColor }]}>{item.status}</Text>
                  </View>
                )}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  center: { flex: 1, backgroundColor: colors.bgBase, justifyContent: "center", alignItems: "center" },

  header: { marginBottom: 12 },
  h1: { color: colors.textPrimary, fontSize: 20, fontWeight: "700" },
  sub: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },

  empty: { alignItems: "center", paddingVertical: 60, gap: 10 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "600" },
  emptySub: { color: colors.textSecondary, fontSize: 12, textAlign: "center", paddingHorizontal: 30, lineHeight: 17 },

  card: {
    backgroundColor: colors.bgCard, borderColor: colors.border, borderWidth: 1,
    borderRadius: 14, padding: 14, marginBottom: 10, gap: 8,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  subtype: { fontSize: 14, fontWeight: "700" },
  date: { color: colors.textSecondary, fontSize: 11 },

  plain: { color: colors.textSecondary, fontSize: 11, lineHeight: 16 },

  confRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  confLabel: { color: colors.textSecondary, fontSize: 10, width: 66 },
  barTrack: { flex: 1, height: 5, backgroundColor: colors.bgCard2, borderRadius: 3, overflow: "hidden" },
  barFill: { height: 5, borderRadius: 3 },
  confPct: { fontSize: 11, fontWeight: "600", width: 30, textAlign: "right" },

  cardFooter: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  modelV: { color: colors.teal + "80", fontSize: 10, fontWeight: "600", backgroundColor: colors.tealGlow, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  statusBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  statusText: { fontSize: 9, fontWeight: "700", letterSpacing: 0.8 },
});

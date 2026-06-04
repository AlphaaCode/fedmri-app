import React, { ReactNode } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Settings } from "lucide-react-native";
import { colors } from "../lib/theme";

// ─── Top app bar: FedMRI logo + settings gear (matches Figma TopAppBar) ───────
export function AppHeader({ onSettings, right }: { onSettings?: () => void; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[h.bar, { paddingTop: insets.top + 8 }]}>
      <Image source={require("../../assets/fedmri-logo.png")} style={h.logo} resizeMode="contain" />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {right}
        {onSettings && (
          <TouchableOpacity onPress={onSettings} style={h.iconBtn} hitSlop={8}>
            <Settings size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const h = StyleSheet.create({
  bar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 10,
    backgroundColor: colors.bgCard, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  logo: { width: 116, height: 30 },
  iconBtn: {
    width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.bgCard2, borderWidth: 1, borderColor: colors.border,
  },
});

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[c.card, style]}>{children}</View>;
}
const c = StyleSheet.create({
  card: { backgroundColor: colors.bgCard, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16 },
});

// ─── Status pill (teal outline w/ dot) ────────────────────────────────────────
export function Pill({ label, color = colors.teal, filled }: { label: string; color?: string; filled?: boolean }) {
  return (
    <View style={[p.pill, { borderColor: color + "55", backgroundColor: filled ? color + "1f" : color + "12" }]}>
      <View style={[p.dot, { backgroundColor: color }]} />
      <Text style={[p.text, { color }]}>{label}</Text>
    </View>
  );
}
const p = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
});

// ─── Section label (uppercase, dim) ───────────────────────────────────────────
export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text style={sl.label}>{children}</Text>;
}
const sl = StyleSheet.create({
  label: { color: colors.textSecondary, fontSize: 10, letterSpacing: 1.8, fontWeight: "700", textTransform: "uppercase" },
});

// ─── Buttons ──────────────────────────────────────────────────────────────────
export function PrimaryButton({ label, onPress, disabled, icon, style }: { label: string; onPress?: () => void; disabled?: boolean; icon?: ReactNode; style?: ViewStyle }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.85} style={[b.primary, disabled && { opacity: 0.5 }, style]}>
      {icon}
      <Text style={b.primaryText}>{label}</Text>
    </TouchableOpacity>
  );
}
export function OutlineButton({ label, onPress, icon, color = colors.teal, style }: { label: string; onPress?: () => void; icon?: ReactNode; color?: string; style?: ViewStyle }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[b.outline, { borderColor: color + "55" }, style]}>
      {icon}
      <Text style={[b.outlineText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}
const b = StyleSheet.create({
  primary: { flexDirection: "row", gap: 8, backgroundColor: colors.teal, borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#06201d", fontSize: 14, fontWeight: "800" },
  outline: { flexDirection: "row", gap: 8, backgroundColor: colors.tealGlow, borderRadius: 12, borderWidth: 1, paddingVertical: 13, alignItems: "center", justifyContent: "center" },
  outlineText: { fontSize: 13, fontWeight: "700" },
});

// ─── Probability / metric bar ─────────────────────────────────────────────────
export function ProbBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={pb.row}>
      <Text style={pb.label}>{label}</Text>
      <View style={pb.track}>
        <View style={[pb.fill, { width: `${Math.max(2, Math.round(value * 100))}%`, backgroundColor: color }]} />
      </View>
      <Text style={pb.pct}>{(value * 100).toFixed(1)}%</Text>
    </View>
  );
}
const pb = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  label: { color: colors.textPrimary, fontSize: 12, width: 96 },
  track: { flex: 1, height: 6, backgroundColor: colors.bgBase, borderRadius: 3, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
  pct: { color: colors.textSecondary, fontSize: 11, width: 44, textAlign: "right", fontVariant: ["tabular-nums"] },
});

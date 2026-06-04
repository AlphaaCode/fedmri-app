import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from "react-native";
import { Plus, Mail, ShieldCheck } from "lucide-react-native";
import { colors } from "../lib/theme";
import { AppHeader, Card, SectionLabel } from "../components/ui";

const FAQ = [
  { q: "Is my scan data private?", a: "Yes. Your scans never leave this hospital. Only anonymised AI model patterns are shared during federated training — 0 bytes of raw imaging data are transmitted." },
  { q: "What does the AI result mean?", a: "It indicates the likely molecular subtype of the tumour in your MRI. Always discuss the result with your oncologist before any medical decision." },
  { q: "How accurate is the AI?", a: "The model was trained across 3 hospitals and reports its validation F1 and AUC on every result. It is an educational tool — clinical confirmation is always required." },
  { q: "Can I delete my data?", a: "Yes. Use 'De-identify Account' in Privacy & Security, or contact your hospital's data protection officer." },
];

function FaqItem({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
  return (
    <View style={s.faq}>
      <TouchableOpacity style={s.faqHead} onPress={onToggle} activeOpacity={0.7}>
        <Text style={s.faqQ}>{q}</Text>
        <Plus size={16} color={colors.teal} style={{ transform: [{ rotate: open ? "45deg" : "0deg" }] }} />
      </TouchableOpacity>
      {open && <Text style={s.faqA}>{a}</Text>}
    </View>
  );
}

export function SupportScreen({ navigation }: any) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <View style={s.root}>
      <AppHeader onSettings={() => navigation.navigate("Settings")} />
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.h1}>Support</Text>
        <Text style={s.sub}>Help with your FedMRI account and how the AI works.</Text>

        <Card style={{ flexDirection: "row", gap: 12, alignItems: "center", marginTop: 14 }}>
          <View style={s.shield}><ShieldCheck size={18} color={colors.teal} /></View>
          <Text style={s.privacy}>Trained across 3 hospitals. The AI comes to your data — your images never leave the hospital.</Text>
        </Card>

        <SectionLabel >Frequently asked</SectionLabel>
        <Card style={{ marginTop: 8 }}>
          {FAQ.map((f, i) => (
            <View key={f.q}>
              {i > 0 && <View style={s.divider} />}
              <FaqItem q={f.q} a={f.a} open={open === i} onToggle={() => setOpen(open === i ? null : i)} />
            </View>
          ))}
        </Card>

        <TouchableOpacity style={s.contact} onPress={() => Linking.openURL("mailto:support@fedmri.local")} activeOpacity={0.85}>
          <Mail size={16} color={colors.teal} />
          <Text style={s.contactText}>Email the operations team</Text>
        </TouchableOpacity>
        <Text style={s.footer}>support@fedmri.local · 24h response window</Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  h1: { color: colors.textPrimary, fontSize: 22, fontWeight: "800" },
  sub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  shield: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.tealGlow, borderWidth: 1, borderColor: colors.teal + "40", alignItems: "center", justifyContent: "center" },
  privacy: { color: colors.textSecondary, fontSize: 11, lineHeight: 16, flex: 1 },
  faq: { paddingVertical: 4 },
  faqHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingVertical: 8 },
  faqQ: { color: colors.textPrimary, fontSize: 13, fontWeight: "600", flex: 1 },
  faqA: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, paddingBottom: 8 },
  divider: { height: 1, backgroundColor: colors.border },
  contact: { flexDirection: "row", alignSelf: "center", alignItems: "center", gap: 8, marginTop: 6, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.teal + "55", backgroundColor: colors.tealGlow },
  contactText: { color: colors.teal, fontSize: 13, fontWeight: "700" },
  footer: { color: colors.textSecondary, fontSize: 10, textAlign: "center", opacity: 0.7 },
});

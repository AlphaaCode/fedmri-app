import React, { useEffect, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Image, Alert, Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { colors, subtypeColor, subtypePlain } from "../lib/theme";
import { apiUploadImage, apiVerifyImage } from "../lib/api";

const SUBTYPE_ICONS: Record<string, string> = {
  "Luminal A": "◎",
  "Luminal B": "◉",
  "HER2": "⬡",
  "Triple Negative": "▲",
};

function ConfBar({ value, color }: { value: number; color: string }) {
  return (
    <View style={bar.track}>
      <View style={[bar.fill, { width: `${Math.round(value * 100)}%` as any, backgroundColor: color }]} />
    </View>
  );
}

const bar = StyleSheet.create({
  track: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: "hidden", flex: 1 },
  fill: { height: 6, borderRadius: 3 },
});

type VerifyState = "idle" | "checking" | "ok" | "warn";

export function ScanScreen() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [verify, setVerify] = useState<VerifyState>("idle");
  const [verifyReason, setVerifyReason] = useState("");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!imageUri) { setVerify("idle"); setVerifyReason(""); return; }
    let cancelled = false;
    (async () => {
      setVerify("checking");
      const t0 = Date.now();
      try {
        const v = await apiVerifyImage(imageUri, `check-${Date.now()}.jpg`);
        // Minimum visible time so the checking badge is always readable
        const elapsed = Date.now() - t0;
        if (elapsed < 700) await new Promise((r) => setTimeout(r, 700 - elapsed));
        if (cancelled) return;
        setVerify(v.valid ? "ok" : "warn");
        setVerifyReason(v.reason);
      } catch {
        if (!cancelled) setVerify("ok");
      }
    })();
    return () => { cancelled = true; };
  }, [imageUri]);

  async function pickFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission needed", "FedMRI needs gallery access."); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9 });
    if (!r.canceled && r.assets?.[0]) { setImageUri(r.assets[0].uri); setResult(null); setError(null); }
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission needed", "FedMRI needs camera access."); return; }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.9 });
    if (!r.canceled && r.assets?.[0]) { setImageUri(r.assets[0].uri); setResult(null); setError(null); }
  }

  async function doUpload() {
    if (!imageUri) return;
    setUploading(true); setError(null);
    try {
      const data = await apiUploadImage(imageUri, `scan-${Date.now()}.jpg`);
      setResult(data);
    } catch (e: any) {
      setError(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function upload() {
    if (verify === "warn") {
      if (Platform.OS === "web") {
        if (window.confirm(`⚠ ${verifyReason}\n\nThis may not be a breast MRI scan. Analyse anyway?`)) {
          doUpload();
        }
      } else {
        Alert.alert(
          "Not a breast MRI scan",
          `${verifyReason}\n\nDo you want to analyse it anyway?`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Analyse anyway", style: "destructive", onPress: doUpload },
          ]
        );
      }
    } else {
      doUpload();
    }
  }

  function reset() { setImageUri(null); setResult(null); setError(null); setVerify("idle"); }

  const conf = result ? Math.round(result.confidence * 100) : 0;
  const confColor = result
    ? result.confidence >= 0.7 ? colors.teal : result.confidence >= 0.5 ? colors.amber : colors.coral
    : colors.teal;
  const confLabel = result
    ? result.confidence >= 0.7 ? "High confidence" : result.confidence >= 0.5 ? "Moderate confidence" : "Low — consult specialist"
    : "";

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

      {/* Upload zone */}
      {!imageUri && !result && (
        <>
          <Text style={s.h1}>Upload MRI scan</Text>
          <Text style={s.sub}>AI analysis of breast MRI molecular subtypes</Text>

          <TouchableOpacity style={s.uploadZone} onPress={pickFromLibrary} activeOpacity={0.8}>
            <View style={s.uploadIcon}>
              <Text style={{ fontSize: 32 }}>🩻</Text>
            </View>
            <Text style={s.uploadTitle}>Tap to choose from library</Text>
            <Text style={s.uploadSub}>JPEG · PNG · up to 10 MB</Text>
          </TouchableOpacity>

          <View style={s.dividerRow}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>or</Text>
            <View style={s.dividerLine} />
          </View>

          <TouchableOpacity style={s.cameraBtn} onPress={takePhoto} activeOpacity={0.8}>
            <Text style={{ fontSize: 16 }}>📷</Text>
            <Text style={s.cameraBtnText}>Take a photo</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Preview + verify */}
      {imageUri && !result && (
        <View style={s.previewSection}>
          <Image source={{ uri: imageUri }} style={s.previewImg} resizeMode="cover" />

          {/* Verify badge */}
          {verify === "checking" && (
            <View style={[s.verifyBadge, { borderColor: colors.border }]}>
              <ActivityIndicator size="small" color={colors.teal} style={{ marginRight: 8 }} />
              <Text style={[s.verifyText, { color: colors.textSecondary }]}>Verifying scan…</Text>
            </View>
          )}
          {verify === "ok" && (
            <View style={[s.verifyBadge, { borderColor: colors.teal + "60", backgroundColor: colors.tealGlow }]}>
              <Text style={{ marginRight: 6 }}>✓</Text>
              <Text style={[s.verifyText, { color: colors.teal }]}>{verifyReason}</Text>
            </View>
          )}
          {verify === "warn" && (
            <View style={[s.verifyBadge, { borderColor: colors.amber + "60", backgroundColor: "#f59e0b10" }]}>
              <Text style={{ marginRight: 6 }}>⚠</Text>
              <Text style={[s.verifyText, { color: colors.amber }]} numberOfLines={2}>{verifyReason}</Text>
            </View>
          )}

          {uploading ? (
            <View style={s.uploadingBox}>
              <ActivityIndicator color={colors.teal} size="large" />
              <Text style={s.uploadingTitle}>Analysing scan…</Text>
              <Text style={s.uploadingSub}>AI model processing, this takes 2–4 s</Text>
            </View>
          ) : (
            <View style={s.previewBtns}>
              <TouchableOpacity style={s.secondaryBtn} onPress={reset}>
                <Text style={s.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.primaryBtn, verify === "checking" && { opacity: 0.5 }]}
                onPress={upload}
                disabled={verify === "checking"}
              >
                <Text style={s.primaryBtnText}>
                  {verify === "checking" ? "Verifying…" : verify === "warn" ? "Analyse anyway →" : "Analyse →"}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {error && (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}
        </View>
      )}

      {/* Result */}
      {result && (
        <View style={s.resultSection}>
          {/* Subtype hero */}
          <View style={[s.subtypeHero, { borderColor: (subtypeColor[result.predictedSubtype] || colors.teal) + "40" }]}>
            <View style={[s.subtypeIconBox, { backgroundColor: (subtypeColor[result.predictedSubtype] || colors.teal) + "20" }]}>
              <Text style={[s.subtypeIcon, { color: subtypeColor[result.predictedSubtype] || colors.teal }]}>
                {SUBTYPE_ICONS[result.predictedSubtype] || "◎"}
              </Text>
            </View>
            <Text style={s.aiLabel}>AI RESULT</Text>
            <Text style={[s.subtypeName, { color: subtypeColor[result.predictedSubtype] || colors.teal }]}>
              {result.predictedSubtype}
            </Text>
            <Text style={s.subtypePlain}>{subtypePlain[result.predictedSubtype]}</Text>
          </View>

          {/* Confidence */}
          <View style={s.card}>
            <View style={s.cardRow}>
              <Text style={s.cardLabel}>CONFIDENCE</Text>
              <Text style={[s.cardValue, { color: confColor }]}>{conf}%</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 }}>
              <ConfBar value={result.confidence} color={confColor} />
            </View>
            <Text style={[s.confHint, { color: confColor }]}>{confLabel}</Text>
          </View>

          {/* Probs breakdown */}
          {result.probs && Array.isArray(result.probs) && (
            <View style={s.card}>
              <Text style={s.cardLabel}>CLASS PROBABILITIES</Text>
              {(["Luminal A", "Luminal B", "HER2", "Triple Negative"] as const).map((k, i) => (
                <View key={k} style={s.probRow}>
                  <Text style={[s.probLabel, { color: subtypeColor[k] }]}>{k}</Text>
                  <View style={{ flex: 1, marginHorizontal: 10 }}>
                    <ConfBar value={result.probs[i] ?? 0} color={subtypeColor[k]} />
                  </View>
                  <Text style={s.probPct}>{Math.round((result.probs[i] ?? 0) * 100)}%</Text>
                </View>
              ))}
            </View>
          )}

          {/* Model badge */}
          <View style={s.modelBadge}>
            <Text style={s.modelBadgeText}>Model v{result.modelVersion} · AI trained across 3 hospitals</Text>
          </View>

          {/* Disclaimer */}
          <View style={s.disclaimer}>
            <Text style={s.disclaimerTitle}>⚠ For educational purposes only</Text>
            <Text style={s.disclaimerText}>
              This AI tool does not constitute a medical diagnosis. Only a certified oncologist
              can diagnose cancer. Contact your doctor or nearest cancer centre if you have concerns.
            </Text>
          </View>

          <TouchableOpacity style={s.resetBtn} onPress={reset}>
            <Text style={s.resetBtnText}>Analyse another scan</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  content: { padding: 16, paddingBottom: 48 },
  h1: { color: colors.textPrimary, fontSize: 22, fontWeight: "700", marginBottom: 4 },
  sub: { color: colors.textSecondary, fontSize: 12, marginBottom: 20 },

  uploadZone: {
    borderWidth: 2, borderColor: colors.teal + "40", borderStyle: "dashed",
    borderRadius: 16, padding: 32, alignItems: "center", gap: 10,
    backgroundColor: colors.tealGlow, marginBottom: 16,
  },
  uploadIcon: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: colors.bgCard, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  uploadTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  uploadSub: { color: colors.textSecondary, fontSize: 11 },

  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.textSecondary, fontSize: 11 },

  cameraBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.bgCard, borderColor: colors.border, borderWidth: 1,
    borderRadius: 12, paddingVertical: 14,
  },
  cameraBtnText: { color: colors.textPrimary, fontSize: 14, fontWeight: "600" },

  previewSection: { gap: 12 },
  previewImg: { width: "100%", height: 260, borderRadius: 14, backgroundColor: colors.bgCard },

  verifyBadge: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  verifyText: { fontSize: 12, flex: 1 },

  uploadingBox: { alignItems: "center", paddingVertical: 20, gap: 8 },
  uploadingTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  uploadingSub: { color: colors.textSecondary, fontSize: 12 },

  previewBtns: { flexDirection: "row", gap: 10 },
  primaryBtn: { flex: 1, backgroundColor: colors.tealDim, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  secondaryBtn: { flex: 1, backgroundColor: colors.bgCard, borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  secondaryBtnText: { color: colors.textSecondary, fontSize: 14 },

  errorBox: { backgroundColor: "#fb718515", borderColor: colors.coral + "60", borderWidth: 1, borderRadius: 10, padding: 12 },
  errorText: { color: colors.coral, fontSize: 12 },

  resultSection: { gap: 12 },
  subtypeHero: {
    backgroundColor: colors.bgCard, borderWidth: 1,
    borderRadius: 16, padding: 22, alignItems: "center", gap: 8,
  },
  subtypeIconBox: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  subtypeIcon: { fontSize: 26, fontWeight: "700" },
  aiLabel: { color: colors.textSecondary, fontSize: 10, letterSpacing: 2, marginTop: 4 },
  subtypeName: { fontSize: 26, fontWeight: "800" },
  subtypePlain: { color: colors.textSecondary, fontSize: 12, textAlign: "center", lineHeight: 17, paddingHorizontal: 10 },

  card: { backgroundColor: colors.bgCard, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 16, gap: 4 },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardLabel: { color: colors.textSecondary, fontSize: 10, letterSpacing: 1.5 },
  cardValue: { fontSize: 18, fontWeight: "800" },
  confHint: { fontSize: 11, marginTop: 2 },

  probRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  probLabel: { fontSize: 11, fontWeight: "600", width: 90 },
  probPct: { color: colors.textSecondary, fontSize: 11, width: 32, textAlign: "right" },

  modelBadge: { backgroundColor: colors.bgCard2, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, alignItems: "center" },
  modelBadgeText: { color: colors.textSecondary, fontSize: 10, letterSpacing: 0.5 },

  disclaimer: { backgroundColor: "#fb718508", borderColor: colors.coral + "50", borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
  disclaimerTitle: { color: colors.coral, fontSize: 13, fontWeight: "700" },
  disclaimerText: { color: colors.coral + "cc", fontSize: 11, lineHeight: 17 },

  resetBtn: { backgroundColor: colors.bgCard, borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  resetBtnText: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
});
